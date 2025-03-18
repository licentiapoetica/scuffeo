import { Bot, Message } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("PING", (msg: Message) => { // Handle PING
    bot.send(`PONG ${msg.params.join('')}`);
  });
};
