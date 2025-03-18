import { Bot, Message } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("JOIN", (msg: Message) => { // Handle join
    bot.send(`WHO ${msg.params[0]}`);
  });
};
