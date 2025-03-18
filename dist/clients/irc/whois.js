export default (bot) => {
    bot._cmd.set("307", (msg) => {
        let tmpuser = bot.server.user.get(msg.params[1]) || {};
        tmpuser.account = msg.params[1];
        tmpuser.registered = true;
        bot.server.user.set(msg.params[1], tmpuser);
    });
    bot._cmd.set("311", (msg) => {
        let tmpuser = bot.server.user.get(msg.params[1]) || {};
        tmpuser.nickname = msg.params[1];
        tmpuser.username = msg.params[2];
        tmpuser.hostname = msg.params[3];
        tmpuser.realname = msg.params[5];
        tmpuser.prefix = `${msg.params[1]}!${msg.params[2]}@${msg.params[3]}`;
        bot.server.user.set(msg.params[1], tmpuser);
    });
    bot._cmd.set("313", (msg) => {
        let tmpuser = bot.server.user.get(msg.params[1]) || {};
        tmpuser.oper = true;
        bot.server.user.set(msg.params[1], tmpuser);
    });
    bot._cmd.set("318", (msg) => {
        let tmpuser = bot.server.user.get(msg.params[1]) || {};
        tmpuser = {
            nick: tmpuser.nick || false,
            nickname: tmpuser.nickname || false,
            username: tmpuser.username || false,
            hostname: tmpuser.hostname || false,
            realname: tmpuser.realname || false,
            account: tmpuser.account || false,
            prefix: tmpuser.prefix || false,
            registered: tmpuser.registered || false,
            oper: tmpuser.oper || false,
            channels: tmpuser.channels || [],
            cached: Math.floor(Date.now() / 1000),
        };
        bot.server.user.set(msg.params[1], tmpuser);
        if (msg.params[0] === msg.params[1]) {
            bot.server.me = tmpuser;
            bot.server.user.delete(msg.params[1]);
        }
    });
    bot._cmd.set("319", (msg) => {
        let tmpchan = new Map();
        let tmpuser = bot.server.user.get(msg.params[1]) || {};
        if (tmpuser.channels)
            tmpchan = new Map(tmpuser.channels);
        const chans = msg.params[2].trim().split(" ");
        chans.forEach((chan) => {
            const [flags, name] = chan.split("#");
            tmpchan.set(`#${name}`, flags);
        });
        tmpuser.channels = tmpchan;
        bot.server.user.set(msg.params[1], tmpuser);
    });
    bot._cmd.set("330", (msg) => {
        let tmpuser = bot.server.user.get(msg.params[1]) || {};
        tmpuser.account = msg.params[2];
        tmpuser.registered = true;
        bot.server.user.set(msg.params[1], tmpuser);
    });
};
