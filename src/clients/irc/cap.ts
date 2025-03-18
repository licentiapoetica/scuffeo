import { Bot, Message } from "../../types";

export default (bot: Bot) => {
  bot._cmd.set("CAP", (msg: Message) => { // CAP Handling
    switch(msg.params[1]) {
      case "LS": // List
        bot.send(`CAP REQ :${msg.params[2]}`);
        break;
      case "ACK": // Success
        bot.send("AUTHENTICATE PLAIN");
        break;
    }
  });

  bot._cmd.set("AUTHENTICATE", (msg: Message) => { // Authentication
    if(msg.params[0].match(/\+/)) {
      bot.send(`AUTHENTICATE ${Buffer.from(
        bot.username + "\u0000" + bot.username + "\u0000" + bot.options.password
      ).toString("base64")}`);
    }
  });

  bot._cmd.set("900", (msg: Message) => { // End CAP
    bot.send("CAP END");
  });
};
