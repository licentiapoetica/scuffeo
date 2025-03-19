import EventEmitter from "events";
type MessageModes = "normal" | "action" | "notice";
interface IRCOptions {
    channels?: string[];
    host?: string;
    port?: number;
    ssl?: boolean;
    selfSigned?: boolean;
    sasl?: boolean;
    network?: string;
    nickname?: string;
    username?: string;
    realname?: string;
    set?: string;
}
interface ParsedCommand {
    prefix: string | null;
    command: string;
    params: string[];
}
interface IRCEvents {
    data: [string | [string, any]];
    error: [string];
}
export default class irc extends EventEmitter {
    private options;
    private socket?;
    private _recachetime;
    private _cmd;
    private server;
    emit<K extends keyof IRCEvents>(event: K, ...args: IRCEvents[K]): boolean;
    on<K extends keyof IRCEvents>(event: K, listener: (...args: IRCEvents[K]) => void): this;
    constructor(options: IRCOptions);
    initialize(): Promise<void>;
    private createSocket;
    connect(reconnect?: boolean): void;
    private handleConnection;
    private handleData;
    private handleDisconnect;
    private handleError;
    private join;
    private part;
    private whois;
    send(data: string): void;
    sendmsg(mode: MessageModes, recipient: string, msg: string | string[]): void;
    parse(data: string): ParsedCommand;
    private format;
    parsePrefix(prefix: string | null): {
        nick: string;
        username: string;
        hostname: string;
    } | false;
    reply(tmp: ParsedCommand): {
        type: string;
        network: string;
        channel: string;
        channelid: string;
        user: {
            account: string | boolean;
            prefix: string;
            nick?: string | undefined;
            username?: string | undefined;
            hostname?: string | undefined;
        };
        message: string;
        time: number;
        raw: ParsedCommand;
        reply: (msg: string) => void;
        replyAction: (msg: string) => void;
        replyNotice: (msg: string) => void;
        self: {
            set: string;
            motd: string;
            me: Record<string, unknown>;
            channel: Map<string, unknown>;
            user: Map<string, {
                account?: string;
                cached: number;
            }>;
        };
        _chan: unknown;
        _user: Map<string, {
            account?: string;
            cached: number;
        }>;
        _cmd: Map<string, (cmd: ParsedCommand) => void>;
        join: (chan: string) => void;
        part: (chan: string, msg?: string) => void;
        whois: (user: string) => void;
        write: (msg: string) => void;
    };
}
export {};
