import { Bot, Message } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("PART", (msg: Message) => { // Handle part
    delete bot.server.user[msg.params[0]];
  });
};
