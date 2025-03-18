const max = 400;
let whois = [];
let chan;
export default (bot) => {
    bot._cmd.set("352", (msg) => {
        chan = msg.params[1];
        whois.push(msg.params[5]);
    });
    bot._cmd.set("315", (msg) => {
        bot.server.channel.set(chan, whois);
        whois = [...new Set(whois)];
        Array(Math.ceil(whois.length / 10)).fill(undefined).map(() => whois.splice(0, 10)).forEach((l) => {
            bot.whois(l);
        });
        whois = [];
    });
};
