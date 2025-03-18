export default (bot) => {
    bot._cmd.set("372", (msg) => {
        bot.server.motd += `${msg.params[1]}\n`;
    });
    bot._cmd.set("375", (msg) => {
        bot.server.motd = `${msg.params[1]}\n`;
    });
    bot._cmd.set("376", (msg) => {
        bot.server.motd += `${msg.params[1]}\n`;
        bot.emit("data", ["motd", bot.server.motd]);
    });
};
