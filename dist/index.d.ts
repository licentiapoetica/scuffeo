import EventEmitter from "node:events";
interface Config {
    enabled: boolean;
    type: string;
    network: string;
}
interface CuffeoEvents {
    data: [string, any];
    error: [Error];
}
export default class Cuffeo extends EventEmitter {
    private clients;
    private libs;
    emit<K extends keyof CuffeoEvents>(event: K, ...args: CuffeoEvents[K]): boolean;
    on<K extends keyof CuffeoEvents>(event: K, listener: (...args: CuffeoEvents[K]) => void): this;
    constructor(cfg: Config[]);
    private loadLibs;
    private registerClients;
}
export {};
