import https from "node:https";
import url from "node:url";
import EventEmitter from "node:events";
import fetch from "flumm-fetch";
export default class slack extends EventEmitter {
    options;
    token;
    api = "https://slack.com/api";
    interval = null;
    server;
    constructor(options) {
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
        })();
    }
    async connect() {
        const response = await fetch(`${this.api}/rtm.start?token=${this.token}`);
        const res = await response.json();
        if (!res.ok) {
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
        if (res.url) {
            this.server.wss.url = url.parse(res.url);
            this.initializeWebSocket();
        }
        else
            this.emit("data", ["error", "No WebSocket URL provided"]);
    }
    initializeWebSocket() {
        https.get({
            hostname: this.server.wss.url?.host,
            path: this.server.wss.url?.path,
            port: 443,
            headers: {
                Upgrade: "websocket",
                Connection: "Upgrade",
                "Sec-WebSocket-Version": 13,
                "Sec-WebSocket-Key": Buffer.from(Array(16)
                    .fill(0)
                    .map(() => Math.round(Math.random() * 0xff))).toString("base64"),
            }
        }, () => { })
            .on("upgrade", (_, sock) => {
            this.server.wss.socket = sock;
            this.server.wss.socket.setEncoding("utf-8");
            this.handleWebSocketEvents();
        })
            .on("error", err => {
            this.emit("data", ["error", `Failed to establish WebSocket: ${err.message}`]);
        });
    }
    handleWebSocketEvents() {
        if (!this.server.wss.socket)
            return;
        this.interval = setInterval(async () => await this.ping(), 30000);
        this.server.wss.socket.on("data", async (data) => {
            try {
                const parsedData = this.parseData(data);
                if (parsedData?.type === "message") {
                    await Promise.all([
                        this.getChannel(parsedData.channel),
                        this.getUser(parsedData.user),
                    ]);
                    this.emit("data", ["message", this.reply(parsedData)]);
                }
            }
            catch (err) {
                this.emit("data", ["error", err]);
            }
        });
        this.server.wss.socket.on("end", async () => {
            this.emit("data", ["debug", "WebSocket stream ended"]);
            await this.reconnect();
        });
        this.server.wss.socket.on("error", async (err) => {
            this.emit("data", ["error", err.message]);
            await this.reconnect();
        });
    }
    async reconnect() {
        this.server.wss.url = null;
        this.server.wss.socket = null;
        if (this.interval)
            clearInterval(this.interval);
        this.emit("data", ["info", "reconnecting slack"]);
        await this.connect();
    }
    async getChannel(channelId) {
        if (this.server.channel.has(channelId))
            return this.server.channel.get(channelId);
        const res = await (await fetch(`${this.api}/conversations.info?channel=${channelId}&token=${this.token}`)).json();
        if (!res.channel)
            throw new Error("Channel not found");
        this.server.channel.set(channelId, res.channel.name);
        return res.channel.name;
    }
    async getUser(userId) {
        if (this.server.user.has(userId))
            return this.server.user.get(userId);
        const res = await (await fetch(`${this.api}/users.info?user=${userId}&token=${this.token}`)).json();
        if (!res.user)
            throw new Error("User not found");
        const user = { account: res.user.name, nickname: res.user.real_name };
        this.server.user.set(userId, user);
        return user;
    }
    async send(channel, text) {
        const message = Array.isArray(text) ? text.join("\n") : text;
        const formatted = message.includes("\n") ? "```" + message + "```" : message;
        await this.write({
            type: "message",
            channel: channel,
            text: this.format(formatted),
        });
    }
    async ping() {
        await this.write({ type: "ping" });
    }
    async write(json) {
        const msg = JSON.stringify(json);
        const payload = Buffer.from(msg);
        if (payload.length > 2 ** 14) {
            this.emit("data", ["error", "message too long, slack limit reached"]);
            return;
        }
        if (!this.server.wss.socket) {
            await this.reconnect();
            return;
        }
        try {
            this.server.wss.socket.cork();
            this.server.wss.socket.write(payload);
            this.server.wss.socket.uncork();
        }
        catch (err) {
            console.error(err);
            await this.reconnect();
        }
    }
    reply(tmp) {
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
            reply: (msg) => this.send(tmp.channel, msg),
            replyAction: (msg) => this.send(tmp.channel, `[i]${msg}[/i]`),
            replyNotice: (msg) => this.send(tmp.channel, msg),
        };
    }
    parseData(data) {
        try {
            const json = JSON.parse(data.toString());
            return json;
        }
        catch (err) {
            this.emit("data", ["error", "failed to parse data"]);
            return undefined;
        }
    }
    format(msg) {
        return msg.toString()
            .replace(/\[b\](.*?)\[\/b\]/g, "*$1*")
            .replace(/\[s\](.*?)\[\/s\]/g, "~$1~")
            .replace(/\[i\](.*?)\[\/i\]/g, "_$1_")
            .replace(/\[color=(.*?)](.*?)\[\/color\]/g, "$2");
    }
}
