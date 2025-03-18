import cuffeo from '../dist/index.js';

const clients = [{
  "type": "irc",
  "enabled": false,
  "network": "n0xy",
  "host": "irc.n0xy.net",
  "port": 6697,
  "ssl": true,
  "selfSigned": false,
  "sasl": false,
  "nickname": "cuffeots",
  "username": "cuffeots",
  "realname": "cuffeo",
  "channels": [
    "#kbot-dev"
  ]
}, {
  "type": "tg",
  "enabled": true,
  "token": "xd",
  "pollrate": 1001
}];

const bot = await new cuffeo(clients);
bot.on("message", msg => {
  console.log(msg);
  msg.reply("pong");
});

bot.on("data", data => {
  console.log(data);
});
