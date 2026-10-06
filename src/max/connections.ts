import { connectionStoreSchema } from "../../contracts/persistence.js";
import type {
  ConnectionStore,
  SavedConnection,
} from "../../types/persistence.js";
import type { MaxConnectInput, MaxProfile } from "../../types/max.js";
import { EncryptedStore } from "./storage.js";
export class SavedConnections {
  private readonly store: EncryptedStore<ConnectionStore>;
  constructor(directory: string) {
    this.store = new EncryptedStore(
      directory,
      "max-connections",
      connectionStoreSchema,
      { version: 1, connections: [] },
    );
  }
  get(owner: number): SavedConnection | undefined {
    return this.store.read().connections.find((c) => c.owner === owner);
  }
  claimed(instance: string, owner: number): boolean {
    return this.store
      .read()
      .connections.some(
        (c) =>
          c.owner !== owner &&
          c.credentials &&
          c.profile.idInstance === instance,
      );
  }
  save(
    owner: number,
    credentials: MaxConnectInput,
    connectionId: string,
  ): void {
    const data = this.store.read();
    const profile = {
      apiUrl: credentials.apiUrl,
      mediaUrl: credentials.mediaUrl,
      idInstance: credentials.idInstance,
    };
    data.connections = data.connections.filter((c) => c.owner !== owner);
    data.connections.push({ owner, credentials, profile, connectionId });
    this.store.write(data);
  }
  forget(owner: number): void {
    const data = this.store.read();
    const connection = data.connections.find((c) => c.owner === owner);
    if (!connection?.credentials) return;
    delete connection.credentials;
    this.store.write(data);
  }
  profile(owner: number): MaxProfile | null {
    return this.get(owner)?.profile ?? null;
  }
}
