export default (bot) => {
    bot._cmd.set("INVITE", (msg) => {
        const user = bot.parsePrefix(msg.prefix);
        const channel = msg.params[1];
        if (!bot.server.channel.has(channel)) {
            bot.join(channel);
            setTimeout(() => {
                bot.send(`PRIVMSG ${channel} :Hi. Wurde von ${user.nick} eingeladen.`);
            }, 1000);
        }
    });
};
