type Controller = ReadableStreamDefaultController;

const clients = new Map<string, Set<Controller>>();
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startHeartbeat(): void {
  heartbeatTimer = setInterval(() => {
    const comment = ": heartbeat\n\n";
    for (const controllers of clients.values()) {
      for (const ctrl of controllers) {
        try {
          ctrl.enqueue(new TextEncoder().encode(comment));
        } catch {
          // client gone, will be cleaned up on disconnect
        }
      }
    }
  }, 5000);
}

export function addClient(hostId: string, controller: Controller): void {
  if (!clients.has(hostId)) {
    clients.set(hostId, new Set());
  }
  clients.get(hostId)!.add(controller);
}

export function removeClient(hostId: string, controller: Controller): void {
  const set = clients.get(hostId);
  if (set) {
    set.delete(controller);
    if (set.size === 0) {
      clients.delete(hostId);
    }
  }
}

export function broadcast(hostId: string, data: string): void {
  const set = clients.get(hostId);
  if (!set) return;
  const encoded = new TextEncoder().encode(`data: ${data}\n\n`);
  for (const ctrl of set) {
    try {
      ctrl.enqueue(encoded);
    } catch {
      // will be cleaned up
    }
  }
}

export function getConnectedHostCount(): number {
  return clients.size;
}
