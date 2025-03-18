import _fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import net from "net";
import tls from "tls";
import EventEmitter from "events";

const fs = _fs.promises;
const __dirname = dirname(fileURLToPath(import.meta.url));

type MessageModes = "normal" | "action" | "notice";
interface IRCOptions {
  channels?: string[];
  host?: string;
  port?: number;
  ssl?: boolean;
  selfSigned?: boolean;
  sasl?: boolean;
  network?: string;
  nickname?: string;
  username?: string;
  realname?: string;
  set?: string;
}

interface ParsedCommand {
  prefix: string | null;
  command: string;
  params: string[];
}

const colors = {
  white: "00", black: "01", navy: "02", green: "03", red: "04",
  brown: "05", purple: "06", orange: "07", yellow: "08",
  lightgreen: "09", teal: "10", cyan: "11", blue: "12",
  magenta: "13", gray: "14", lightgray: "15"
};

const msgmodes: Record<MessageModes, string> = {
  normal: "PRIVMSG {recipient} :{msg}",
  action: "PRIVMSG {recipient} :\u0001ACTION {msg}\u0001",
  notice: "NOTICE {recipient} :{msg}",
};

const replaceColor = (match: string, color: keyof typeof colors, text: string) => {
  return colors[color] ? `\x03${colors[color]}${text}\x0F` : text;
};

export default class irc extends EventEmitter {
  private options: Required<IRCOptions>;
  private socket?: net.Socket | tls.TLSSocket;
  private _recachetime: number = 60 * 30; // 30 minutes
  private _cmd: Map<string, (cmd: ParsedCommand) => void> = new Map();
  private server: {
    set: string;
    motd: string;
    me: Record<string, unknown>;
    channel: Map<string, unknown>;
    user: Map<string, { account?: string; cached: number }>;
  };

  constructor(options: IRCOptions) {
    super();
    this.options = {
      channels: [],
      host: "127.0.0.1",
      port: 6667,
      ssl: false,
      selfSigned: false,
      sasl: false,
      network: "test",
      nickname: "test",
      username: "test",
      realname: "test",
      set: "all",
      ...options
    };

    this.server = {
      set: this.options.set,
      motd: "",
      me: {},
      channel: new Map(),
      user: new Map()
    };

    return (async () => {
      await this.initialize();
      return this;
    })() as unknown as irc;
  }

  async initialize() {
    const dir = (await fs.readdir(`${__dirname}/irc`)).filter(f =>
      f.endsWith(".js")
    );
    await Promise.all(
      dir.map(async mod => {
        return (await import(`${__dirname}/irc/${mod}`)).default(this);
      })
    );
    this.connect();
  }

  connect(reconnect: boolean = false): void {
    if(reconnect)
      this.socket = undefined;
  
    if(this.options.ssl) {
      this.socket = tls.connect({
        host: this.options.host,
        port: this.options.port,
        rejectUnauthorized: !this.options.selfSigned,
      }, () => this.handleConnection());
    }
    else {
      this.socket = net.connect({
        host: this.options.host,
        port: this.options.port,
      }, () => this.handleConnection());
    }
  
    if(!this.socket)
      throw new Error("Socket konnte nicht initialisiert werden.");
  
    this.socket.setEncoding("utf-8");
    this.socket.on("data", (msg: string) => {
      console.log("Received data:", msg);
      this.handleData(msg);
    });
    this.socket.on("end", () => {
      this.handleDisconnect();
    });
    this.socket.on("error", (err: Error) => {
      this.handleError(err);
    });
  }
  
  private handleConnection(): void {
    this.send(`NICK ${this.options.nickname}`);
    this.send(`USER ${this.options.username} 0 * :${this.options.realname}`);
    if(this.options.sasl)
      this.send("CAP LS");
    this.emit("data", "[irc] connected!");
  }
  
  private handleData(msg: string): void {
    msg.split(/\r?\n|\r/).forEach((line) => {
      if(line.trim().length > 0) {
        const cmd = this.parse(line);
        if(this._cmd.has(cmd.command))
          this._cmd.get(cmd.command)?.(cmd);
      }
    });
  }
  
  private handleDisconnect(): void {
    this.emit("data", ["error", "[irc] stream ended, reconnecting in progress"]);
    this.connect(true);
  }
  
  private handleError(err: Error): void {
    this.emit("data", ["error", `[irc] socket error: ${err.message}`]);
    this.connect(true);
  }

  private join(channels: string | string[]): void {
    if(!Array.isArray(channels))
      channels = [channels];
    channels.forEach(e => {
      this.send(`JOIN ${e}`);
    });
  }

  private part(channel: string, msg?: string): void {
    this.send(`PART ${channel} :${msg || ""}`);
  }

  private whois(nick: string | string[]): void {
    if(!Array.isArray(nick))
      nick = [nick];
    nick.forEach(e => {
      this.send(`WHOIS ${e}`);
    });
  }

  send(data: string) {
    if(this.socket)
      this.socket.write(`${data}\n`);
    else
      this.emit("data", ["info", `[irc] nope: ${data}`]);
  }

  sendmsg(mode: MessageModes, recipient: string, msg: string | string[]) {
    const messages = Array.isArray(msg) ? msg : msg.split(/\r?\n/);
    if(messages.length >= 5)
      this.emit("data", ["error", "[irc] too many lines"]);
    messages.forEach((e) => {
      const formatted = msgmodes[mode]
        .replace("{recipient}", recipient)
        .replace("{msg}", this.format(e));
      this.send(formatted);
    });
  }

  parse(data: string): ParsedCommand {
    const [a, ...b] = data.split(/ +:/);
    const tmp = a.split(" ").concat(b);
  
    const prefix: string | null = data.charAt(0) === ":"
      ? tmp.shift() ?? null
      : null;
  
    const command = tmp.shift()!;
    const params = command.toLowerCase() === "privmsg"
      ? [tmp.shift()!, tmp.join(" :")]
      : tmp;
  
    return { prefix, command, params };
  }

  private format(msg: string): string {
    return msg
      .replace(/\[b\](.*?)\[\/b\]/g, "\x02$1\x02") // bold
      .replace(/\[i\](.*?)\[\/i\]/g, "\x1D$1\x1D") // italic
      .replace(/\[color=(.*?)](.*?)\[\/color\]/g, replaceColor) // colors
    ;
  }

  parsePrefix(prefix: string | null): {
    nick: string; username: string; hostname: string
  } | false {
    if (!prefix) return false; // Null oder undefined behandeln
  
    const parsed = /:?(.*)\!(.*)@(.*)/.exec(prefix);
    if (!parsed) return false;
  
    return {
      nick: parsed[1],
      username: parsed[2],
      hostname: parsed[3],
    };
  }

  reply(tmp: ParsedCommand) {
    return {
      type: "irc",
      network: this.options.network,
      channel: tmp.params[0],
      channelid: tmp.params[0],
      user: {
        ...this.parsePrefix(tmp.prefix),
        account: (() => {
          const parsedPrefix = this.parsePrefix(tmp.prefix);
          return parsedPrefix && this.server.user.has(parsedPrefix.nick)
            ? this.server.user.get(parsedPrefix.nick)?.account || false
            : false;
        })(),
        prefix: (tmp.prefix?.charAt(0) === ":"
          ? tmp.prefix.substring(1)
          : tmp.prefix) + `@${this.options.network}`,
      },
      message: tmp.params[1].replace(/\u0002/g, ""), // Entfernt Steuerzeichen
      time: Math.floor(Date.now() / 1000),
      raw: tmp,
      reply: (msg: string) => this.sendmsg("normal", tmp.params[0], msg),
      replyAction: (msg: string) => this.sendmsg("action", tmp.params[0], msg),
      replyNotice: (msg: string) => this.sendmsg("notice", tmp.params[0], msg),
      self: this.server,
      _chan: this.server.channel.get(tmp.params[0]),
      _user: this.server.user,
      _cmd: this._cmd,
      join: (chan: string) => this.join(chan),
      part: (chan: string, msg?: string) => this.part(chan, msg),
      whois: (user: string) => this.whois(user),
      write: (msg: string) => this.send(msg)
    };
  }
}
