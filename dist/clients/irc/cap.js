export default (bot) => {
    bot._cmd.set("CAP", (msg) => {
        switch (msg.params[1]) {
            case "LS":
                bot.send(`CAP REQ :${msg.params[2]}`);
                break;
            case "ACK":
                bot.send("AUTHENTICATE PLAIN");
                break;
        }
    });
    bot._cmd.set("AUTHENTICATE", (msg) => {
        if (msg.params[0].match(/\+/)) {
            bot.send(`AUTHENTICATE ${Buffer.from(bot.username + "\u0000" + bot.username + "\u0000" + bot.options.password).toString("base64")}`);
        }
    });
    bot._cmd.set("900", (msg) => {
        bot.send("CAP END");
    });
};
