import fetch from "flumm-fetch";
import EventEmitter from "events";

const allowedFiles = ["audio", "video", "photo", "document"] as const;

type AllowedFileTypes = typeof allowedFiles[number];

interface TelegramOptions {
  token: string;
  pollrate?: number;
  set?: string;
}

interface ServerInfo {
  set: string;
  channel: Map<string, any>;
  user: Map<string, any>;
  me: Record<string, any>;
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramMessage {
  message_id: number;
  from: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  chat: {
    id: number;
    title?: string;
    type: string;
  };
  date: number;
  text?: string;
  caption?: string;
  [key: string]: any;
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: any;
  inline_query?: any;
}

export default class tg extends EventEmitter {
  private options: Required<TelegramOptions>;
  private token: string;
  private api: string;
  private lastUpdate: number = 0;
  private lastMessage: number = 0;
  private poller: NodeJS.Timeout | null = null;
  private server: ServerInfo = {
    set: "",
    channel: new Map(),
    user: new Map(),
    me: {},
  };

  constructor(options: TelegramOptions) {
    super();
    this.options = {
      pollrate: 1000,
      set: "all",
      ...options,
    };
    this.token = this.options.token;
    this.api = `https://api.telegram.org/bot${this.token}`;
    this.server.set = this.options.set;

    return (async () => {
      await this.connect();
      await this.poll();
      return this;
    })() as unknown as tg;
  }

  async connect(): Promise<void> {
    const res = await (await fetch(`${this.api}/getMe`)).json() as TelegramResponse<any>;
    if(!res.ok)
      throw this.emit("data", ["error", res.description ?? "Unknown error"]);

    this.server.me = {
      nickname: res.result.first_name,
      username: res.result.username,
      account: res.result.id.toString(),
      prefix: `${res.result.username}!${res.result.id.toString()}`,
      id: res.result.id.toString(),
    };
  }

  async getFile(fileId: string): Promise<string | false> {
    const res = await (await fetch(`${this.api}/getFile?file_id=${fileId}`)).json() as TelegramResponse<{ file_path: string }>;
    if(!res.ok)
      return false;
    return `https://api.telegram.org/file/bot${this.token}/${res.result?.file_path}`;
  }

  async poll(): Promise<void> {
    try {
      const updates = await this.fetchUpdates();
      if(!updates || updates.length === 0)
        return;
      
      this.lastUpdate = updates[updates.length - 1].update_id + 1;
      
      for(const update of updates)
        await this.processUpdate(update);
    }
    catch(err: any) {
      await this.handlePollError(err);
    }
    finally {
      setTimeout(() => this.poll(), this.options.pollrate);
    }
  }
  
  private async fetchUpdates(): Promise<TelegramUpdate[]> {
    const res = await (await fetch(`${this.api}/getUpdates?offset=${this.lastUpdate}&allowed_updates=message`)).json() as TelegramResponse<TelegramUpdate[]>;
    if(!res.ok)
      throw new Error(res.description || "Failed to fetch updates");
    return res.result || [];
  }
  
  private async processUpdate(update: any): Promise<void> {
    if(update.message)
      await this.handleMessage(update.message);
    else if(update.callback_query)
      this.emit("data", ["callback_query", this.reply(update.callback_query.message, update.callback_query)]);
    else if(update.inline_query)
      this.emit("data", ["inline_query", update.inline_query]);
  }
  
  private async handleMessage(message: any): Promise<void> {
    if (
      message.date >= Math.floor(Date.now() / 1000) - 10 &&
      message.message_id !== this.lastMessage
    ) {
      this.lastMessage = message.message_id;
  
      if(!this.server.user.has(message.from.username || message.from.first_name)) {
        this.server.user.set(message.from.username || message.from.first_name, {
          nick: message.from.first_name,
          username: message.from.username,
          account: message.from.id.toString(),
          prefix: `${message.from.username}!${message.from.id.toString()}@Telegram`,
          id: message.from.id,
        });
      }
  
      try {
        const fileKey = Object.keys(message).find(key =>
          allowedFiles.includes(key as AllowedFileTypes)
        );
        if(fileKey) {
          let media = message[fileKey];
          if(fileKey === "photo")
            media = message[fileKey][message[fileKey].length - 1];
          message.media = await this.getFile(media.file_id);
          message.text = message.caption;
          delete message[fileKey];
        }
      }
      catch {}
  
      this.emit("data", ["message", this.reply(message)]);
    }
  }
  
  private async handlePollError(err: any): Promise<void> {
    if(!err.type)
      this.emit("data", ["error", "tg timed out lol"]);
    else if(err.type === "tg")
      this.emit("data", ["error", err.message]);
    await this.connect();
  }

  reply(tmp: any, opt = {}): any {
    return {
      type: "tg",
      network: "Telegram",
      channel: tmp.chat?.title,
      channelid: tmp.chat?.id,
      user: {
        prefix: `${tmp.from.username}!${tmp.from.id}@Telegram`,
        nick: tmp.from.first_name,
        username: tmp.from.username,
        account: tmp.from.id.toString(),
      },
      self: this.server,
      message: tmp.text,
      time: tmp.date,
      raw: tmp,
      media: tmp.media || null,
      reply: async (msg: string, opt = {}) => await this.send(tmp.chat.id, msg, tmp.message_id, opt),
      replyAction: async (msg: string, opt = {}) => await this.send(tmp.chat.id, `Action ${msg}`, tmp.message_id, opt),
    };
  }

  async send(chatId: number, msg: string, reply: number | null = null, opt = {}): Promise<any> {
    const body: { chat_id: number; text: string; parse_mode: string; reply_to_message_id?: number } = {
      chat_id: chatId,
      text: this.format(msg),
      parse_mode: "HTML",
      ...opt,
    };
    if(reply)
      body["reply_to_message_id"] = reply;

    const opts = { method: "POST", body };
    return await (await fetch(`${this.api}/sendMessage`, opts)).json();
  }

  format(msg: string): string {
    return msg.toString()
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .replace(/\[b\](.*?)\[\/b\]/gsm, "<b>$1</b>") // bold
      .replace(/\[i\](.*?)\[\/i\]/gsm, "<i>$1</i>") // italic
      .replace(/\[color=(.*?)](.*?)\[\/color\]/gsm, "$2")
      .replace(/\[pre\](.*?)\[\/pre\]/gsm, "<pre>$1</pre>")
    ;
  }
}
