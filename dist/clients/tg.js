import EventEmitter from "events";
const allowedFiles = ["audio", "video", "photo", "document"];
export default class tg extends EventEmitter {
    options;
    token;
    api;
    lastUpdate = 0;
    lastMessage = 0;
    poller = null;
    server = {
        set: "",
        channel: new Map(),
        user: new Map(),
        me: {},
    };
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    constructor(options) {
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
        })();
    }
    async connect() {
        const res = await (await fetch(`${this.api}/getMe`)).json();
        if (!res.ok)
            throw this.emit("data", ["error", res.description ?? "Unknown error"]);
        this.server.me = {
            nickname: res.result.first_name,
            username: res.result.username,
            account: res.result.id.toString(),
            prefix: `${res.result.username}!${res.result.id.toString()}`,
            id: res.result.id.toString(),
        };
    }
    async getFile(fileId) {
        const res = await (await fetch(`${this.api}/getFile?file_id=${fileId}`)).json();
        if (!res.ok)
            return false;
        return `https://api.telegram.org/file/bot${this.token}/${res.result?.file_path}`;
    }
    async poll() {
        try {
            const updates = await this.fetchUpdates();
            if (!updates || updates.length === 0)
                return;
            this.lastUpdate = updates[updates.length - 1].update_id + 1;
            for (const update of updates)
                await this.processUpdate(update);
        }
        catch (err) {
            await this.handlePollError(err);
        }
        finally {
            setTimeout(() => this.poll(), this.options.pollrate);
        }
    }
    async fetchUpdates() {
        const res = await (await fetch(`${this.api}/getUpdates?offset=${this.lastUpdate}&allowed_updates=message`)).json();
        if (!res.ok)
            throw new Error(res.description || "Failed to fetch updates");
        return res.result || [];
    }
    async processUpdate(update) {
        if (update.message)
            await this.handleMessage(update.message);
        else if (update.callback_query)
            this.emit("data", ["callback_query", this.reply(update.callback_query.message, update.callback_query)]);
        else if (update.inline_query)
            this.emit("data", ["inline_query", update.inline_query]);
    }
    async handleMessage(message) {
        if (message.date >= Math.floor(Date.now() / 1000) - 10 &&
            message.message_id !== this.lastMessage) {
            this.lastMessage = message.message_id;
            if (!this.server.user.has(message.from.username || message.from.first_name)) {
                this.server.user.set(message.from.username || message.from.first_name, {
                    nick: message.from.first_name,
                    username: message.from.username,
                    account: message.from.id.toString(),
                    prefix: `${message.from.username}!${message.from.id.toString()}@Telegram`,
                    id: message.from.id,
                });
            }
            try {
                const fileKey = Object.keys(message).find(key => allowedFiles.includes(key));
                if (fileKey) {
                    let media = message[fileKey];
                    if (fileKey === "photo")
                        media = message[fileKey][message[fileKey].length - 1];
                    message.media = await this.getFile(media.file_id);
                    message.text = message.caption;
                    delete message[fileKey];
                }
            }
            catch { }
            this.emit("data", ["message", this.reply(message)]);
        }
    }
    async handlePollError(err) {
        if (!err.type)
            this.emit("data", ["error", "tg timed out lol"]);
        else if (err.type === "tg")
            this.emit("data", ["error", err.message]);
        await this.connect();
    }
    reply(tmp, opt = {}) {
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
            reply: async (msg, opt = {}) => await this.send(tmp.chat.id, msg, tmp.message_id, opt),
            replyAction: async (msg, opt = {}) => await this.send(tmp.chat.id, `Action ${msg}`, tmp.message_id, opt),
        };
    }
    async send(chatId, msg, reply = null, opt = {}) {
        const body = {
            chat_id: chatId,
            text: this.format(msg),
            parse_mode: "HTML",
            ...opt,
        };
        if (reply)
            body["reply_to_message_id"] = reply;
        const opts = {
            method: "POST",
            body: JSON.stringify(body),
            headers: {
                "Content-Type": "application/json"
            }
        };
        return await (await fetch(`${this.api}/sendMessage`, opts)).json();
    }
    format(msg) {
        return msg.toString()
            .split("&").join("&amp;")
            .split("<").join("&lt;")
            .split(">").join("&gt;")
            .replace(/\[b\](.*?)\[\/b\]/gsm, "<b>$1</b>")
            .replace(/\[i\](.*?)\[\/i\]/gsm, "<i>$1</i>")
            .replace(/\[color=(.*?)](.*?)\[\/color\]/gsm, "$2")
            .replace(/\[pre\](.*?)\[\/pre\]/gsm, "<pre>$1</pre>");
    }
}
