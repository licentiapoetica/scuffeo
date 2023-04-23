import https from "https";
import url from "url";
import EventEmitter from "events";
import fetch from "flumm-fetch";

export default class slack extends EventEmitter {
  constructor(options) {
    super();
    this.options = options || {};
    this.token = options.token || null;
    this.set = this.options.set || "all";
    this.network = "Slack";
    this.api = "https://slack.com/api";
    this.socket = null;
    this.interval = null;
    this.server = {
      set: this.set,
      channel: new Map(),
      user: new Map(),
      wss: {
        url: null,
        socket: null
      },
      me: {}
    };

    return (async () => {
      await this.connect();
      return this;
    })();
  }
  async connect() {
    const res = await (await fetch(`${this.api}/rtm.start?token=${this.token}`)).json();

    if (!res.ok)
      return this.emit("data", [ "error", res.description ]); // more infos

    res.channels?.forEach(channel => this.server.channel.set(channel.id, channel.name));
    res.users?.forEach(user => this.server.user.set(user.id, {
      account: user.name,
      nickname: user.real_name
    }));

    this.server.wss.url = url.parse(res.url);

    https.get({
      hostname: this.server.wss.url.host,
      path: this.server.wss.url.path,
      port: 443,
      headers: {
        "Upgrade": "websocket",
        "Connection": "Upgrade",
        "Sec-WebSocket-Version": 13,
        "Sec-WebSocket-Key": new Buffer.from(Array(16).fill().map(e => Math.round(Math.random() * 0xFF))).toString("base64")
      }
    }).on("upgrade", (_, sock) => {
      this.server.wss.socket = sock;
      this.server.wss.socket.setDefaultEncoding("utf-8");

      this.interval = setInterval(async () => await this.ping(), 3e4); // 30 seconds lul

      this.server.wss.socket.on("data", async data => {
        try {
          if (data.length < 2)
            throw "payload too short";
          if (data[1] & 0x80)
            throw "we no accept masked data";
          let offset = 2;
          let length = data[1] & 0x7F;
          if (length === 126) {
            offset = 4;
            length = data.readUInt16BE(2);
          }
          else if(length === 127)
            throw "payload too long";
          if (data.length < length + offset)
            throw "payload shorter than given length";
          //console.log(data, offset, length);
          data = JSON.parse(data.slice(offset, length + offset).toString().replace(/\0+$/, "")); // trim null bytes at the end

          //console.log(data, data.type);

          if (data.type !== "message")
            return false;

          await Promise.all([this.getChannel(data.channel), this.getUser(data.user)]);

          return this.emit("data", [ "message", this.reply(data) ]);
        }
        catch(err) {
          this.emit("data", [ "error", err ]);
        }
      })
      .on("end", async () => {
        this.emit("data", [ "debug", "stream ended" ]);
        await this.reconnect();
      })
      .on("error", async err => {
        this.emit("data", [ "error", err ]);
        await this.reconnect();
      });
    });
  }

  async reconnect() {
    this.server.wss.url = null;
    this.server.wss.socket = null;
    clearTimeout(this.interval);
    this.emit("data", [ "info", "reconnecting slack" ]);
    return await this.connect();
  }

  async getChannel(channelId) {
    if (this.server.channel.has(channelId))
      return this.server.channel.get(channelId);

    const res = await (await fetch(`${this.api}/conversations.info?channel=${channelId}&token=${this.token}`)).json();
    this.server.channel.set(channelId, res.channel.name);
    return res.channel.name;
  }

  async getUser(userId) {
    if (this.server.user.has(userId))
      return this.server.user.get(userId);

    const res = await (await fetch(`${this.api}/users.info?user=${userId}&token=${this.token}`)).json();
    this.server.user.set(userId, {
      account: res.user.name,
      nickname: res.user.real_name
    });
  }

  async send(channel, text) {
    text = Array.isArray(text) ? text.join("\n") : text;
    text = text.includes("\n") ? "```" + text + "```" : text;
    await this.write({
      type: "message",
      channel: channel,
      text: this.format(text)
    });
  }

  async ping() {
    return await this.write({
      type: "ping"
    });
  }

  async write(json) {
    const msg = JSON.stringify(json);

    const payload = Buffer.from(msg);

    if(payload.length > 2 ** 14) // 16KB limit
      throw this.emit("data", [ "error", "message too long, slack limit reached" ]);

    let frame_length = 6;
    let frame_payload_length = payload.length;

    if(payload.length > 125) {
      frame_length += 2;
      frame_payload_length = 126;
    }

    const frame = Buffer.alloc(frame_length);

    // set mask bit but leave mask key empty (= 0), so we don't have to mask the message
    frame.writeUInt16BE(0x8180 | frame_payload_length);

    if(frame_length > 6)
      frame.writeUInt16BE(payload.length, 2);

    if (!this.server.wss.socket)
      await this.reconnect();

    try {
      this.server.wss.socket.cork();
      this.server.wss.socket.write(frame);
      this.server.wss.socket.write(Buffer.from(msg));
      this.server.wss.socket.uncork();
    } catch(err) {
      console.error(err);
    }
  }

  reply(tmp) {
    return {
      type: "slack",
      network: "Slack",
      channel: this.server.channel.get(tmp.channel), // get channelname
      channelid: tmp.channel,
      user: {
        prefix: `${this.server.user.get(tmp.user).account}!${tmp.user}@${this.network}`, // get username
        nick: this.server.user.get(tmp.user).nickname, // get username
        username: this.server.user.get(tmp.user).nickname,  // get username
        account: this.server.user.get(tmp.user).account
      },
      self: this.server,
      message: tmp.text,
      time: ~~(Date.now() / 1000),
      raw: tmp,
      reply: msg => this.send(tmp.channel, msg),
      replyAction: msg => this.send(tmp.channel, `[i]${msg}[/i]`),
      replyNotice: msg => this.send(tmp.channel, msg)
    };
  }

  format(msg) {
    return msg.toString()
      .replace(/\[b\](.*?)\[\/b\]/g, "*$1*") // bold
      .replace(/\[s\](.*?)\[\/s\]/g, "~$1~") // strike
      .replace(/\[i\](.*?)\[\/i\]/g, "_$1_") // italic
      .replace(/\[color=(.*?)](.*?)\[\/color\]/g, "$2")
    ;
  }

}
