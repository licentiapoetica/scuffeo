export default (bot) => {
    bot._cmd.set("JOIN", (msg) => {
        bot.send(`WHO ${msg.params[0]}`);
    });
};
