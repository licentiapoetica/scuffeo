import EventEmitter from "events";
interface TelegramOptions {
    token: string;
    pollrate?: number;
    set?: string;
}
interface TelegramEvents {
    data: [string | [string, any]];
    error: [string];
}
export default class tg extends EventEmitter {
    private options;
    private token;
    private api;
    private lastUpdate;
    private lastMessage;
    private poller;
    private server;
    emit<K extends keyof TelegramEvents>(event: K, ...args: TelegramEvents[K]): boolean;
    on<K extends keyof TelegramEvents>(event: K, listener: (...args: TelegramEvents[K]) => void): this;
    constructor(options: TelegramOptions);
    connect(): Promise<void>;
    getFile(fileId: string): Promise<string | false>;
    poll(): Promise<void>;
    private fetchUpdates;
    private processUpdate;
    private handleMessage;
    private handlePollError;
    reply(tmp: any, opt?: {}): any;
    send(chatId: number, msg: string, reply?: number | null, opt?: {}): Promise<any>;
    format(msg: string): string;
}
export {};
