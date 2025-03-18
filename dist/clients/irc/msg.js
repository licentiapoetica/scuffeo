export default (bot) => {
    bot._cmd.set("PRIVMSG", (msg) => {
        if (msg.params[1] === "\u0001VERSION\u0001")
            return bot.emit("data", ["ctcp:version", bot.reply(msg)]);
        else if (msg.params[1].match(/^\u0001PING .*\u0001/i))
            return bot.emit("data", ["ctcp:ping", bot.reply(msg)]);
        else
            bot.emit("data", ["message", bot.reply(msg)]);
    });
    bot._cmd.set("NOTICE", (msg) => {
        bot.emit("data", ["notice", msg.params[1]]);
    });
};
