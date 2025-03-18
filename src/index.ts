import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import EventEmitter from "node:events";

const __dirname = dirname(fileURLToPath(import.meta.url));

interface Config {
  enabled: boolean;
  type: string;
  network: string;
}

interface Client {
  name: string;
  type: string;
  client: any;
}

interface CuffeoEvents {
  data: [string, any];
  error: [Error];
}

export default class Cuffeo extends EventEmitter {
  private clients: Client[] = [];
  private libs: Record<string, any> = {};

  emit<K extends keyof CuffeoEvents>(event: K, ...args: CuffeoEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof CuffeoEvents>(event: K, listener: (...args: CuffeoEvents[K]) => void): this {
    return super.on(event, listener);
  }

  constructor(cfg: Config[]) {
    super();

    return (async () => {
      this.libs = await this.loadLibs();
      this.clients = await this.registerClients(cfg);
      return this;
    })() as unknown as Cuffeo;
  }

  private async loadLibs(): Promise<Record<string, any>> {
    const clientFiles = await fs.promises.readdir(`${__dirname}/clients`);
    const modules = await Promise.all(
      clientFiles
        .filter(f => f.endsWith(".js"))
        .map(async client => {
          const lib = (await import(`./clients/${client}`)).default;
          return { [lib.name]: lib };
        })
    );
    return modules.reduce((a, b) => ({ ...a, ...b }), {});
  }

  private async registerClients(cfg: Config[]): Promise<Client[]> {
    return Promise.all(
      cfg
        .filter(e => e.enabled)
        .map(async srv => {
          if(!Object.keys(this.libs).includes(srv.type))
            throw new Error(`unsupported client: ${srv.type}`);

          const client: Client = {
            name: srv.network,
            type: srv.type,
            client: await new this.libs[srv.type](srv),
          };

          client.client.on("data", ([type, data]: [keyof CuffeoEvents, any]) =>
            this.emit(type, data)
          );

          return client;
        })
    );
  }
}
