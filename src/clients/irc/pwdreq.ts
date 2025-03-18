import { Bot, Message } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("464", (msg: Message) => { // Handle password request
    if(bot.options.password.length > 0 && !bot.options.sasl)
      bot.send(`PASS ${bot.options.password}`);
  });
};
