import Loki from "lokijs";
import { existsSync, readFileSync } from "fs";

const SNAPSHOT_PATH = "./exchange-snapshot.json";
const TTL_MS = 48 * 60 * 60 * 1000; // 48 hours
const SNAPSHOT_INTERVAL = 60 * 1000; // 60 seconds
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour

export interface Message {
  id: string;
  to: string;
  from: string;
  type: string;
  body: string;
  timestamp: number;
  created_at: number;
}

let db: Loki;
let messages: Collection<Message>;

export function initStore(): void {
  db = new Loki(SNAPSHOT_PATH, {
    autoload: false,
    autosave: false,
  });

  // Load snapshot if exists
  if (existsSync(SNAPSHOT_PATH)) {
    const data = readFileSync(SNAPSHOT_PATH, "utf-8");
    db.loadJSON(data);
  }

  messages = db.getCollection<Message>("messages");
  if (!messages) {
    messages = db.addCollection<Message>("messages", {
      indices: ["to", "timestamp"],
    });
  }

  // Discard expired on startup
  cleanup();

  // Periodic cleanup
  setInterval(cleanup, CLEANUP_INTERVAL);

  // Periodic snapshot
  setInterval(snapshot, SNAPSHOT_INTERVAL);
}

export function addMessage(msg: Omit<Message, "id" | "timestamp" | "created_at">): Message {
  const now = Date.now();
  const entry: Message = {
    ...msg,
    id: crypto.randomUUID(),
    timestamp: now,
    created_at: now,
  };
  messages.insert(entry);
  return entry;
}

export function getMessagesSince(hostId: string, since: number): Message[] {
  return messages
    .chain()
    .find({
      timestamp: { $gt: since },
    })
    .data()
    .filter((m) => parseHostId(m.to) === hostId);
}

export function getMessageCount(): number {
  return messages.count();
}

export function cleanup(): void {
  const cutoff = Date.now() - TTL_MS;
  messages.findAndRemove({ created_at: { $lt: cutoff } });
}

export function snapshot(): void {
  try {
    const data = db.serialize();
    Bun.write(SNAPSHOT_PATH, data);
  } catch (e) {
    console.error("Snapshot failed:", e);
  }
}

function parseHostId(address: string): string {
  const parts = address.split("@");
  return parts.length > 1 ? parts[1] : address;
}
