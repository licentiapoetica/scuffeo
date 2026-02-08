import { Client, GatewayIntentBits, Partials } from "discord.js";
import EventEmitter from "events";

export default class discord extends EventEmitter {
  constructor(options) {
    super();
    this.options = options || {};
    this.token = options.token || null;
    this.set = this.options.set || "all";
    this.network = "discord";

    this.bot = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions
      ],
      partials: [Partials.Channel]
    });

    this.bot.login(this.token);

    this.server = {
      set: this.set,
      channel: new Map(),
      user: new Map(),
      me: {}
    };

    this.bot.on("clientReady", () => {
      this.server.me = {
        nickname: this.bot.user.username,
        username: this.bot.user.username,
        account: this.bot.user.id.toString(),
        prefix: `${this.bot.user.username}!${this.bot.user.id.toString()}`,
        id: this.bot.user.id.toString()
      };
      this.emit("data", ["ready", "discord"]);
    });

    this.bot.on("messageCreate", msg => {
      // Ignore messages from self
      if (msg.author.id === this.bot.user.id) return;

      console.log(`[DISCORD DEBUG] Received message: '${msg.content}' from ${msg.author.username} in ${msg.channel.name || 'DM'}`);

      const replyObj = this.reply(msg);
      console.log(`[DISCORD DEBUG] Emitting data event for message:`, replyObj.message);
      this.emit("data", ["message", replyObj]);
    });

    // Optional: Log errors to avoid crashing
    this.bot.on("error", console.error);
  }

  reply(tmp) {
    return {
      type: "discord",
      network: "Discord",
      channel: tmp.channel.name || 'DM',
      channelid: tmp.channel.id,
      user: {
        prefix: `${tmp.author.username}!${tmp.author.id}`,
        nick: tmp.author.username,
        username: tmp.author.username,
        account: tmp.author.id.toString()
      },
      message: tmp.content,
      media: tmp.attachments.find(a =>
        a.contentType?.startsWith('video/mp4') ||
        a.contentType?.startsWith('video/webm')
      )?.url,
      time: ~~(Date.now() / 1000),
      raw: tmp,
      self: this.server,
      reply: msg => { return this.send(tmp, this.format(msg)); },
      replyAction: msg => this.send(tmp, this.format(`*${msg}*`), "normal"),
      replyNotice: msg => this.send(tmp, this.format(msg))
    };
  }

  async send(r, msg, mode = "blah") {
    try {
      switch (mode) {
        case "normal":
          return await r.channel.send(msg);
          break;
        default:
          return await r.reply(msg);
          break;
      }
    } catch (e) {
      console.error("Failed to send message:", e);
    }
  }

  async sendmsg(mode, recipient, msg) {
    try {
      const channel = this.bot.channels.cache.get(recipient) || await this.bot.channels.fetch(recipient).catch(() => null);
      if (channel) {
        await channel.send(msg);
      } else {
        console.error(`Channel ${recipient} not found or not cached`);
      }
    } catch (e) {
      console.error("Failed to sendmsg:", e);
    }
  }

  format(msg) {
    if (typeof msg === 'object') return msg;
    return msg.toString()
      .replace(/\[b\](.*?)\[\/b\]/g, "**$1**") // bold
      .replace(/\[i\](.*?)\[\/i\]/g, "*$1*") // italic
      .replace(/\[color=(.*?)](.*?)\[\/color\]/g, "$2")
      ;
  }
};
