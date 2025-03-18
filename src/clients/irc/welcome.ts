import { Bot, Message } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("001", (msg: Message) => { // Handle welcome
    bot.join(bot.options.channels);
    bot.emit("data", ["connected", msg.params[1]]);
  });
};
