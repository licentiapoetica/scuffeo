import { Bot, Message, User } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("NICK", (msg: Message) => { // Handle nick change
    const prefix: User = bot.parsePrefix(msg.prefix);
    
    if(bot.server.user.has(prefix.nick))
      bot.server.user.delete(prefix.nick);
    
    bot.whois(msg.params[0], true); // Force whois
  });
};
