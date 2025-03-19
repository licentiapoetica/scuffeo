import EventEmitter from "node:events";
interface SlackOptions {
    token: string;
    set?: string;
}
interface User {
    account: string;
    nickname: string;
}
interface SlackMessage {
    type: string;
    channel: string;
    user: string;
    text: string;
}
interface SlackEvents {
    data: [string | [string, any]];
    error: [string];
    message: [SlackMessage];
}
export default class slack extends EventEmitter {
    private options;
    private token;
    private api;
    private interval;
    private server;
    private reconnectAttempts;
    emit<K extends keyof SlackEvents>(event: K, ...args: SlackEvents[K]): boolean;
    on<K extends keyof SlackEvents>(event: K, listener: (...args: SlackEvents[K]) => void): this;
    constructor(options: SlackOptions);
    connect(): Promise<void>;
    private initializeWebSocket;
    private handleWebSocketEvents;
    reconnect(): Promise<void>;
    getChannel(channelId: string): Promise<string | undefined>;
    getUser(userId: string): Promise<User | undefined>;
    send(channel: string, text: string | string[]): Promise<void>;
    ping(): Promise<void>;
    write(json: object): Promise<void>;
    reply(tmp: SlackMessage): any;
    private parseData;
    format(msg: string): string;
}
export {};
