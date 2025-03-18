import _fs from "fs";
import { fileURLToPath } from "url";
import { dirname } from "path";
import net from "net";
import tls from "tls";
import EventEmitter from "events";
const fs = _fs.promises;
const __dirname = dirname(fileURLToPath(import.meta.url));
const colors = {
    white: "00", black: "01", navy: "02", green: "03", red: "04",
    brown: "05", purple: "06", orange: "07", yellow: "08",
    lightgreen: "09", teal: "10", cyan: "11", blue: "12",
    magenta: "13", gray: "14", lightgray: "15"
};
const msgmodes = {
    normal: "PRIVMSG {recipient} :{msg}",
    action: "PRIVMSG {recipient} :\u0001ACTION {msg}\u0001",
    notice: "NOTICE {recipient} :{msg}",
};
const replaceColor = (match, color, text) => {
    return colors[color] ? `\x03${colors[color]}${text}\x0F` : text;
};
export default class irc extends EventEmitter {
    options;
    socket;
    _recachetime = 60 * 30;
    _cmd = new Map();
    server;
    constructor(options) {
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
        })();
    }
    async initialize() {
        const dir = (await fs.readdir(`${__dirname}/irc`)).filter(f => f.endsWith(".js"));
        await Promise.all(dir.map(async (mod) => {
            return (await import(`${__dirname}/irc/${mod}`)).default(this);
        }));
        this.connect();
    }
    connect(reconnect = false) {
        if (reconnect)
            this.socket = undefined;
        if (this.options.ssl) {
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
        if (!this.socket)
            throw new Error("Socket konnte nicht initialisiert werden.");
        this.socket.setEncoding("utf-8");
        this.socket.on("data", (msg) => {
            console.log("Received data:", msg);
            this.handleData(msg);
        });
        this.socket.on("end", () => {
            this.handleDisconnect();
        });
        this.socket.on("error", (err) => {
            this.handleError(err);
        });
    }
    handleConnection() {
        this.send(`NICK ${this.options.nickname}`);
        this.send(`USER ${this.options.username} 0 * :${this.options.realname}`);
        if (this.options.sasl)
            this.send("CAP LS");
        this.emit("data", "[irc] connected!");
    }
    handleData(msg) {
        msg.split(/\r?\n|\r/).forEach((line) => {
            if (line.trim().length > 0) {
                const cmd = this.parse(line);
                if (this._cmd.has(cmd.command))
                    this._cmd.get(cmd.command)?.(cmd);
            }
        });
    }
    handleDisconnect() {
        this.emit("data", ["error", "[irc] stream ended, reconnecting in progress"]);
        this.connect(true);
    }
    handleError(err) {
        this.emit("data", ["error", `[irc] socket error: ${err.message}`]);
        this.connect(true);
    }
    join(channels) {
        if (!Array.isArray(channels))
            channels = [channels];
        channels.forEach(e => {
            this.send(`JOIN ${e}`);
        });
    }
    part(channel, msg) {
        this.send(`PART ${channel} :${msg || ""}`);
    }
    whois(nick) {
        if (!Array.isArray(nick))
            nick = [nick];
        nick.forEach(e => {
            this.send(`WHOIS ${e}`);
        });
    }
    send(data) {
        if (this.socket)
            this.socket.write(`${data}\n`);
        else
            this.emit("data", ["info", `[irc] nope: ${data}`]);
    }
    sendmsg(mode, recipient, msg) {
        const messages = Array.isArray(msg) ? msg : msg.split(/\r?\n/);
        if (messages.length >= 5)
            this.emit("data", ["error", "[irc] too many lines"]);
        messages.forEach((e) => {
            const formatted = msgmodes[mode]
                .replace("{recipient}", recipient)
                .replace("{msg}", this.format(e));
            this.send(formatted);
        });
    }
    parse(data) {
        const [a, ...b] = data.split(/ +:/);
        const tmp = a.split(" ").concat(b);
        const prefix = data.charAt(0) === ":"
            ? tmp.shift() ?? null
            : null;
        const command = tmp.shift();
        const params = command.toLowerCase() === "privmsg"
            ? [tmp.shift(), tmp.join(" :")]
            : tmp;
        return { prefix, command, params };
    }
    format(msg) {
        return msg
            .replace(/\[b\](.*?)\[\/b\]/g, "\x02$1\x02")
            .replace(/\[i\](.*?)\[\/i\]/g, "\x1D$1\x1D")
            .replace(/\[color=(.*?)](.*?)\[\/color\]/g, replaceColor);
    }
    parsePrefix(prefix) {
        if (!prefix)
            return false;
        const parsed = /:?(.*)\!(.*)@(.*)/.exec(prefix);
        if (!parsed)
            return false;
        return {
            nick: parsed[1],
            username: parsed[2],
            hostname: parsed[3],
        };
    }
    reply(tmp) {
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
            message: tmp.params[1].replace(/\u0002/g, ""),
            time: Math.floor(Date.now() / 1000),
            raw: tmp,
            reply: (msg) => this.sendmsg("normal", tmp.params[0], msg),
            replyAction: (msg) => this.sendmsg("action", tmp.params[0], msg),
            replyNotice: (msg) => this.sendmsg("notice", tmp.params[0], msg),
            self: this.server,
            _chan: this.server.channel.get(tmp.params[0]),
            _user: this.server.user,
            _cmd: this._cmd,
            join: (chan) => this.join(chan),
            part: (chan, msg) => this.part(chan, msg),
            whois: (user) => this.whois(user),
            write: (msg) => this.send(msg)
        };
    }
}
