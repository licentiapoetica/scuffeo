import { Bot, Message, User } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("INVITE", (msg: Message) => {
    const user: User = bot.parsePrefix(msg.prefix);
    const channel: string = msg.params[1];

    if(!bot.server.channel.has(channel)) {
      bot.join(channel);
      setTimeout(() => {
        bot.send(`PRIVMSG ${channel} :Hi. Wurde von ${user.nick} eingeladen.`);
      }, 1000);
    }
  });
};
