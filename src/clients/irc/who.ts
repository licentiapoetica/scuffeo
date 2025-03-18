import { Bot, Message } from "../../types";

const max = 400;
let whois: string[] = [];
let chan: string;

export default (bot: Bot) => {
  bot._cmd.set("352", (msg: Message) => { // Handle WHO entry
    chan = msg.params[1];
    whois.push(msg.params[5]);
  });

  bot._cmd.set("315", (msg: Message) => { // Handle WHO end
    bot.server.channel.set(chan, whois);
    whois = [...new Set(whois)];
    Array(Math.ceil(whois.length / 10)).fill(undefined).map(() => whois.splice(0, 10)).forEach((l: string[]) => {
      bot.whois(l);
    });
    whois = [];
  });
};
