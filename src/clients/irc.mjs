import _fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import net from "net";
import tls from "tls";
import EventEmitter from "events";

const fs = _fs.promises;
const __dirname = dirname(fileURLToPath(import.meta.url));

const colors = [
  "white",      "black",   "navy",
  "green",      "red",     "brown",
  "purple",     "orange",  "yellow",
  "lightgreen", "teal",    "cyan",
  "blue",       "magenta", "gray",
  "lightgray"
].reduce((a, b, i) => ({...a, ...{[b]: i.toString().padStart(2, 0)}}), {});

const msgmodes = {
  normal: "PRIVMSG {recipient} :{msg}",
  action: "PRIVMSG {recipient} :\u0001ACTION {msg}\u0001",
  notice: "NOTICE {recipient} :{msg}"
};

const replaceColor = (match, color, text) => {
  if (colors.hasOwnProperty(color))
    return `\x03${colors[color]}${text}\x0F`;
  return text;
};

export default class irc extends EventEmitter {
  constructor(options) {
    super();
    this.options = options || {};
    this.options.channels = this.options.channels || [];
    this.options.host = this.options.host || "127.0.0.1";
    this.options.port = this.options.port || 6667;
    this.options.ssl = this.options.ssl || false;
    this.options.selfSigned = this.options.selfSigned || false;
    this.options.sasl = this.options.sasl || false;
    this.network = this.options.network || "test";
    this.nickname = this.options.nickname || "test";
    this.username = this.options.username || "test";
    this.realname = this.options.realname || "test";
    this.channels = this.options.channels || [];
    this.set = this.options.set || "all";
    this._recachetime = 60 * 30; // 30 minutes
    this._cmd = new Map();

    this.server = {
      set: this.set,
      motd: "",
      me: {},
      channel: new Map(),
      user: new Map()
    };

    return (async () => {
      const dir = (await fs.readdir(`${__dirname}/irc`)).filter(f => f.endsWith(".mjs"));
      await Promise.all(dir.map(async mod => {
        return (await import(`${__dirname}/irc/${mod}`)).default(this);
      }));
      this.connect();
      return this;
    })();
  }
  connect(reconnect = false) {
    if(reconnect)
      this.socket = null;
    this.socket = (this.options.ssl ? tls : net).connect({
      host: this.options.host,
      port: this.options.port,
      rejectUnauthorized: !this.options.selfSigned
    }, () => {
      this.send(`NICK ${this.nickname}`);
      this.send(`USER ${this.username} 0 * : ${this.realname}`);
      if (this.options.sasl)
        this.send("CAP LS");
      this.emit("data", "[irc] connected!");
    });
    this.socket.setEncoding("utf-8");
    this.socket.on("data", msg => {
      msg.split(/\r?\n|\r/).filter(tmp => tmp.length > 0).forEach(tmp => {
        const cmd = this.parse(tmp);
        if (this._cmd.has(cmd.command))
          this._cmd.get(cmd.command)(cmd);
      })
    });
    this.socket.on("end", () => {
      this.connect(true);
      return this.emit("data", ["error", "[irc] stream ended, reconnecting in progress"]);
    });
  }
  send(data) {
    if(this.socket)
      this.socket.write(`${data}\n`);
    else
      this.emit("data", ["info", `[irc] nope: ${data}`]);
  }
  sendmsg(mode, recipient, msg) {
    msg = Array.isArray(msg) ? msg : msg.split(/\r?\n/);
    if (msg.length >= 5)
      return this.emit("data", ["error", "[irc] too many lines"]);
    msg.forEach(e => this.send( msgmodes[mode].replace("{recipient}", recipient).replace("{msg}", this.format(e.toString())) ));
  }
  parse(data, [a, ...b] = data.split(/ +:/), tmp = a.split(" ").concat(b)) {
    const prefix = data.charAt(0) === ":" ? tmp.shift() : null
        , command = tmp.shift()
        , params = command.toLowerCase() === "privmsg" ? [ tmp.shift(), tmp.join(" :") ] : tmp;
    return {
      prefix: prefix,
      command: command,
      params: params
    };
  }
  reply(tmp) {
    return {
      type: "irc",
      network: this.network,
      channel: tmp.params[0],
      channelid: tmp.params[0],
      user: { ...this.parsePrefix(tmp.prefix), ...{
        account: this.server.user.has(this.parsePrefix(tmp.prefix).nick) ? this.server.user.get(this.parsePrefix(tmp.prefix).nick).account : false,
        prefix: (tmp.prefix.charAt(0) === ":" ? tmp.prefix.substring(1) : tmp.prefix) + `@${this.network}`
      }},
      message: tmp.params[1].replace(/\u0002/, ""),
      time: ~~(Date.now() / 1000),
      raw: tmp,
      reply:       msg => this.sendmsg("normal", tmp.params[0], msg),
      replyAction: msg => this.sendmsg("action", tmp.params[0], msg),
      replyNotice: msg => this.sendmsg("notice", tmp.params[0], msg),
      self: this.server,
      _chan: this.server.channel.get(tmp.params[0]),
      _user: this.server.user,
      _cmd: this._cmd,
      join: chan => this.join(chan),
      part: (chan, msg) => this.part(chan, msg),
      whois: user => this.whois(user),
      write: msg => this.send(msg),
      socket: this.socket
    };
  }
  join(channel) {
    this.send(`JOIN ${(typeof channel === "object") ? channel.join(",") : channel}`);
  }
  who(channel) {
    this.send(`WHO ${channel}`);
  }
  part(channel, msg = false) {
    this.send(`PART ${(typeof channel === "object") ? channel.join(",") : channel}${msg ? " " + msg : " part"}`);
  }
  whois(userlist, force = false, whois = []) {
    for(const u of (typeof userlist === "object") ? userlist : userlist.split(",")) {
      let tmpuser = { cached: 0 };
      if (this.server.user.has(u) && !force)
        tmpuser = this.server.user.get(u);
      if (tmpuser.cached < ~~(Date.now() / 1000) - this._recachetime)
        whois.push(u);
    }
    whois = whois.filter(e => e.trim());
    if(whois.length === 0)
      return false;
    this.emit("data", ["info", `[irc] whois > ${whois}`]);
    this.send(`WHOIS ${whois.join(',')}`);
  }
  parsePrefix(prefix) {
    prefix = /:?(.*)\!(.*)@(.*)/.exec(prefix);
    if (!prefix)
      return false;
    return {
      nick: prefix[1],
      username: prefix[2],
      hostname: prefix[3]
    };
  }
  format(msg) {
    return msg
      .replace(/\[b\](.*?)\[\/b\]/g, "\x02$1\x02") // bold
      .replace(/\[i\](.*?)\[\/i\]/g, "\x1D$1\x1D") // italic
      .replace(/\[color=(.*?)](.*?)\[\/color\]/g, replaceColor) // colors
    ;
  }
}
