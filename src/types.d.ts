export interface Message {
  prefix: string;
  params: string[];
}

export interface Bot {
  username: string;
  parsePrefix: (prefix: string) => User;
  _cmd: Map<string, (msg: Message) => void>;
  send: (message: string) => void;
  server: {
    channel: Map<string, string[]>;
    motd: string;
    user: {
      [channel: string]: any
    };
    me?: User;
  };
  options: {
    password: string;
    sasl: boolean;
    channels: string[];
  };
  join: (channel: string | string[]) => void;
  emit: (event: string, args: any[]) => void;
  reply: (msg: Message) => string;
  whois: (nick: string | string[], force?: boolean) => void;
}

export interface User {
  nick: string | false;
  [key: string]: any;
}
