export default (bot) => {
    bot._cmd.set("PART", (msg) => {
        delete bot.server.user[msg.params[0]];
    });
};
