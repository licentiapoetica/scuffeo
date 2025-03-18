export default (bot) => {
    bot._cmd.set("PING", (msg) => {
        bot.send(`PONG ${msg.params.join('')}`);
    });
};
