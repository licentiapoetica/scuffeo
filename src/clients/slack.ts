import https from "node:https";
import net from "node:net";
import url from "node:url";
import EventEmitter from "node:events";
import fetch from "flumm-fetch";

interface SlackOptions {
  token: string;
  set?: string;
}

interface User {
  account: string;
  nickname: string;
}

interface ServerInfo {
  set: string;
  channel: Map<string, string>;
  user: Map<string, User>;
  wss: {
    url: url.UrlWithStringQuery | null;
    socket: net.Socket | null;
  };
  me: Record<string, any>;
}

interface SlackMessage {
  type: string;
  channel: string;
  user: string;
  text: string;
}

interface SlackRTMStartResponse {
  ok: boolean;
  url?: string;
  channels?: { id: string; name: string }[];
  users?: { id: string; name: string; real_name: string }[];
  description?: string;
}

interface SlackEvents {
  data: [string | [string, any]];
  error: [string];
  message: [SlackMessage];
}

export default class slack extends EventEmitter {
  private options: Required<SlackOptions>;
  private token: string;
  private api: string = "https://slack.com/api";
  private interval: NodeJS.Timeout | null = null;
  private server: ServerInfo;
  private reconnectAttempts = 0;

  emit<K extends keyof SlackEvents>(event: K, ...args: SlackEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof SlackEvents>(event: K, listener: (...args: SlackEvents[K]) => void): this {
    return super.on(event, listener);
  }

  constructor(options: SlackOptions) {
    super();
    this.options = {
      set: "all",
      ...options,
    };
    this.token = this.options.token;
    this.server = {
      set: this.options.set,
      channel: new Map(),
      user: new Map(),
      wss: {
        url: null,
        socket: null,
      },
      me: {},
    };

    return (async () => {
      await this.connect();
      return this;
    })() as unknown as slack;
  }

  async connect(): Promise<void> {
    const response = await fetch(`${this.api}/rtm.start?token=${this.token}`);
    const res: SlackRTMStartResponse = await response.json();
  
    if(!res.ok) {
      this.emit("data", ["error", res.description || "Connection failed"]);
      return;
    }
  
    res.channels?.forEach(channel => {
      this.server.channel.set(channel.id, channel.name);
    });
    res.users?.forEach(user => {
      this.server.user.set(user.id, {
        account: user.name,
        nickname: user.real_name,
      });
    });
  
    if(res.url) {
      this.server.wss.url = url.parse(res.url);
      this.reconnectAttempts = 0;
      this.initializeWebSocket();
    }
    else
      this.emit("data", ["error", "No WebSocket URL provided"]);
  }

  private initializeWebSocket(): void {
    https.get({
      hostname: this.server.wss.url?.host,
      path: this.server.wss.url?.path,
      port: 443,
      headers: {
        Upgrade: "websocket",
        Connection: "Upgrade",
        "Sec-WebSocket-Version": 13,
        "Sec-WebSocket-Key": Buffer.from(
          Array(16)
            .fill(0)
            .map(() => Math.round(Math.random() * 0xff))
        ).toString("base64"),
      }}, () => {}
    )
    .on("upgrade", (_, sock) => {
      this.server.wss.socket = sock;
      this.server.wss.socket.setEncoding("utf-8");
      this.handleWebSocketEvents();
    })
    .on("error", err => {
      this.emit("data", ["error", `Failed to establish WebSocket: ${err.message}`]);
    });
  }
  
  private handleWebSocketEvents(): void {
    if(!this.server.wss.socket)
      return;
  
    this.interval = setInterval(async () => await this.ping(), 3e4);
  
    this.server.wss.socket.on("data", async (data: Buffer) => {
      try {
        const parsedData = this.parseData(data);
        if(parsedData?.type === "message") {
          await Promise.all([
            this.getChannel(parsedData.channel),
            this.getUser(parsedData.user),
          ]);
          this.emit("data", ["message", this.reply(parsedData)]);
        }
      }
      catch(err: any) {
        this.emit("data", ["error", err]);
      }
    });
  
    this.server.wss.socket.on("end", async () => {
      this.emit("data", ["debug", "WebSocket stream ended"]);
      await this.reconnect();
    });
  
    this.server.wss.socket.on("error", async (err: Error) => {
      this.emit("data", ["error", err.message]);
      await this.reconnect();
    });
  }

  async reconnect(): Promise<void> {
    if(this.reconnectAttempts >= 5) {
      this.emit("data", ["error", "Too many reconnect attempts"]);
      return;
    }
    this.reconnectAttempts++;
    setTimeout(async () => {
      this.emit("data", ["info", "Reconnecting to Slack"]);
      await this.connect();
    }, this.reconnectAttempts * 1e3);
  }

  async getChannel(channelId: string): Promise<string | undefined> {
    if(this.server.channel.has(channelId))
      return this.server.channel.get(channelId);
  
    const res = await (await fetch(`${this.api}/conversations.info?channel=${channelId}&token=${this.token}`)).json() as { channel: { name: string } };
    if(!res.channel)
      throw new Error("Channel not found");
    this.server.channel.set(channelId, res.channel.name);
    return res.channel.name;
  }

  async getUser(userId: string): Promise<User | undefined> {
    if(this.server.user.has(userId))
      return this.server.user.get(userId);
  
    const res = await (await fetch(`${this.api}/users.info?user=${userId}&token=${this.token}`)).json() as { user: { name: string; real_name: string } };
    if(!res.user)
      throw new Error("User not found");
    const user = { account: res.user.name, nickname: res.user.real_name };
    this.server.user.set(userId, user);
    return user;
  }

  async send(channel: string, text: string | string[]): Promise<void> {
    const message = Array.isArray(text) ? text.join("\n") : text;
    const formatted = message.includes("\n") ? "```" + message + "```" : message;
    await this.write({
      type: "message",
      channel: channel,
      text: this.format(formatted),
    });
  }

  async ping(): Promise<void> {
    await this.write({ type: "ping" });
  }

  async write(json: object): Promise<void> {
    const msg = JSON.stringify(json);
    const payload = Buffer.from(msg);

    if(payload.length > 2 ** 14) {
      this.emit("data", ["error", "message too long, slack limit reached"]);
      return;
    }

    if(!this.server.wss.socket) {
      await this.reconnect();
      return;
    }

    try {
      this.server.wss.socket.cork();
      this.server.wss.socket.write(payload);
      this.server.wss.socket.uncork();
    }
    catch(err: any) {
      console.error(err);
      await this.reconnect();
    }
  }

  reply(tmp: SlackMessage): any {
    return {
      type: "slack",
      network: "Slack",
      channel: this.server.channel.get(tmp.channel),
      channelid: tmp.channel,
      user: this.server.user.get(tmp.user),
      self: this.server,
      message: tmp.text,
      time: ~~(Date.now() / 1000),
      raw: tmp,
      reply: (msg: string) => this.send(tmp.channel, msg),
      replyAction: (msg: string) => this.send(tmp.channel, `[i]${msg}[/i]`),
      replyNotice: (msg: string) => this.send(tmp.channel, msg),
    };
  }

  private parseData(data: Buffer): SlackMessage | undefined {
    try {
      return JSON.parse(data.toString()) as SlackMessage;
    }
    catch(err: any) {
      this.emit("data", ["error", "failed to parse data"]);
      return undefined;
    }
  }

  format(msg: string): string {
    return msg.toString()
      .replace(/\[b\](.*?)\[\/b\]/g, "*$1*") // bold
      .replace(/\[s\](.*?)\[\/s\]/g, "~$1~") // strike
      .replace(/\[i\](.*?)\[\/i\]/g, "_$1_") // italic
      .replace(/\[color=(.*?)](.*?)\[\/color\]/g, "$2")
    ;
  }
}
