import fetch from "flumm-fetch";
import EventEmitter from "events";

const allowedFiles = [ 'audio', 'video', 'photo', 'document' ];

export default class tg extends EventEmitter {
  constructor(options) {
    super();
    this.options = options || {};
    this.token = options.token || null;
    this.options.pollrate = options.pollrate || 1000;
    this.set = this.options.set || "all";
    this.network = "Telegram";
    this.api = `https://api.telegram.org/bot${this.token}`;
    this.lastUpdate = 0;
    this.lastMessage = 0;
    this.poller = null;
    this.server = {
      set: this.set,
      channel: new Map(),
      user: new Map(),
      me: {}
    };

    return (async () => {
      await this.connect();
      await this.poll();
      return this;
    })();
  }
  async connect() {
    const res = await (await fetch(`${this.api}/getMe`)).json();
    if (!res.ok)
      throw this.emit("data", ["error", res.description]); // more infos
    
    this.me = res.result;
    this.server.me = {
      nickname: res.result.first_name,
      username: res.result.username,
      account: res.result.id.toString(),
      prefix: `${res.result.username}!${res.result.id.toString()}`,
      id: res.result.id.toString()
    };
  }
  async getFile(file_id) {
    const res = await (await fetch(`${this.api}/getFile?file_id=${file_id}`)).json();
    if(!res.ok)
      return false;
    return `https://api.telegram.org/file/bot${this.token}/${res.result.file_path}`;
  }
  async poll() {
    try {
      const _res = await (await fetch(`${this.api}/getUpdates?offset=${this.lastUpdate}&allowed_updates=message`)).json();
      
      if(!_res.ok)
        throw { type: "tg", message: _res.description};
      if(_res.result.length === 0)
        return;
    
      this.lastUpdate = _res.result[_res.result.length - 1].update_id + 1;

      _res.result.forEach(async res => {
        if(res.message?.date >= ~~(Date.now() / 1000) - 10 && res.message?.message_id !== this.lastMessage) {
          this.lastMessage = res.message.message_id;
          if(!this.server.user.has(res.message.from.username || res.message.from.first_name)) {
            this.server.user.set(res.message.from.username || res.message.from.first_name, {
              nick: res.message.from.first_name,
              username: res.message.from.username,
              account: res.message.from.id.toString(),
              prefix: `${res.message.from.username}!${res.message.from.id.toString()}@${this.network}`,
              id: res.message.from.id
            });
          }

          try {
            let key;
            if(key = Object.keys(res.message).filter(t => allowedFiles.includes(t))?.[0]) {
              let media = res.message[key];
              if(key === 'photo')
                media = res.message[key][res.message[key].length - 1];
              res.message.media = await this.getFile(media.file_id);
              res.message.text = res.message.caption;
              delete res.message[key];
            }
          } catch {
            // no media files
          }

          this.emit("data", ["message", this.reply(res.message)]);
        }
      });
    }
    catch(err) {
      if(!err.type)
        this.emit("data", ["error", "tg timed out lol"]);
      else if(err.type === "tg")
        this.emit("data", ["error", err.message]);
      await this.connect();
    }
    finally {
      setTimeout(async () => {
        await this.poll();
      }, this.options.pollrate);
    }
  }
  async send(chatid, msg, reply = null) {
    msg = Array.isArray(msg) ? msg.join("\n") : msg;
    if (msg.length === 0 || msg.length > 2048)
      return this.emit("data", ["error", "msg to short or to long lol"]);
    const opts = {
      method: "POST",
      body: {
        chat_id: chatid,
        text: this.format(msg),
        parse_mode: "HTML"
      }
    };
    if (reply)
      opts.body.reply_to_message_id = reply;
    await fetch(`${this.api}/sendMessage`, opts);
  }
  async sendmsg(mode, recipient, msg) {
    await this.send(recipient, msg);
  }
  reply(tmp) {
    return {
      type: "tg",
      network: "Telegram",
      channel: tmp.chat.title,
      channelid: tmp.chat.id,
      user: {
        prefix: `${tmp.from.username}!${tmp.from.id}@${this.network}`,
        nick: tmp.from.first_name,
        username: tmp.from.username,
        account: tmp.from.id.toString()
      },
      self: this.server,
      message: tmp.text,
      time: tmp.date,
      raw: tmp,
      media: tmp.media || null,
      reply: msg => this.send(tmp.chat.id, msg, tmp.message_id),
      replyAction: msg => this.send(tmp.chat.id, `Uwe ${msg}`, tmp.message_id),
      replyNotice: msg => this.send(tmp.chat.id, msg, tmp.message_id),
      _user: this.server.user
    };
  }
  format(msg) {
    return msg.toString()
      .split("&").join("&amp;")
      .split("<").join("&lt;")
      .split(">").join("&gt;")
      .replace(/\[b\](.*?)\[\/b\]/g, "<b>$1</b>") // bold
      .replace(/\[i\](.*?)\[\/i\]/g, "<i>$1</i>") // italic
      .replace(/\[color=(.*?)](.*?)\[\/color\]/g, "$2")
    ;
  }
}
