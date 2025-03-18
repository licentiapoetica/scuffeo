import { Bot, Message } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("372", (msg: Message) => { // MOTD Entry
    bot.server.motd += `${msg.params[1]}\n`;
  });

  bot._cmd.set("375", (msg: Message) => { // MOTD Start
    bot.server.motd = `${msg.params[1]}\n`;
  });

  bot._cmd.set("376", (msg: Message) => { // MOTD End
    bot.server.motd += `${msg.params[1]}\n`;
    bot.emit("data", ["motd", bot.server.motd]);
  });
};
