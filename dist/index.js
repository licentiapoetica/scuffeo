import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import EventEmitter from "node:events";
const __dirname = dirname(fileURLToPath(import.meta.url));
export default class Cuffeo extends EventEmitter {
    clients = [];
    libs = {};
    emit(event, ...args) {
        return super.emit(event, ...args);
    }
    on(event, listener) {
        return super.on(event, listener);
    }
    constructor(cfg) {
        super();
        return (async () => {
            this.libs = await this.loadLibs();
            this.clients = await this.registerClients(cfg);
            return this;
        })();
    }
    async loadLibs() {
        const clientFiles = await fs.promises.readdir(`${__dirname}/clients`);
        const modules = await Promise.all(clientFiles
            .filter(f => f.endsWith(".js"))
            .map(async (client) => {
            const lib = (await import(`./clients/${client}`)).default;
            return { [lib.name]: lib };
        }));
        return modules.reduce((a, b) => ({ ...a, ...b }), {});
    }
    async registerClients(cfg) {
        return Promise.all(cfg
            .filter(e => e.enabled)
            .map(async (srv) => {
            if (!Object.keys(this.libs).includes(srv.type))
                throw new Error(`unsupported client: ${srv.type}`);
            const client = {
                name: srv.network,
                type: srv.type,
                client: await new this.libs[srv.type](srv),
            };
            client.client.on("data", ([type, data]) => this.emit(type, data));
            return client;
        }));
    }
}
