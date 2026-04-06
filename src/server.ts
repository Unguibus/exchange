import { addMessage, getMessagesSince, getMessageCount } from "./store";
import { addClient, removeClient, broadcast, getConnectedHostCount } from "./sse";
import { checkIdle } from "./idle";

const EXCHANGE_SECRET = process.env.EXCHANGE_SECRET || "";
const PORT = parseInt(process.env.PORT || "8080", 10);
const startTime = Date.now();

function unauthorized(): Response {
  return new Response("Unauthorized", { status: 401 });
}

function parseHostFromAddress(address: string): string {
  const parts = address.split("@");
  return parts.length > 1 ? parts[1] : address;
}

function authenticate(req: Request): boolean {
  if (!EXCHANGE_SECRET) return true; // no secret configured = open (dev)
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${EXCHANGE_SECRET}`;
}

export function startServer(): void {
  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);

      // Health check — public, no auth required
      if (req.method === "GET" && url.pathname === "/health") {
        return Response.json({
          status: "healthy",
          uptime: Math.floor((Date.now() - startTime) / 1000),
          connectedHosts: getConnectedHostCount(),
          messageCount: getMessageCount(),
        });
      }

      if (!authenticate(req)) return unauthorized();

      // POST /messages
      if (req.method === "POST" && url.pathname === "/messages") {
        try {
          const body = await req.json();
          const { to, from, type, body: msgBody } = body;
          if (!to || !from) {
            return Response.json({ error: "missing to/from" }, { status: 400 });
          }
          const msg = addMessage({ to, from, type: type || "message", body: msgBody || "" });
          const hostId = parseHostFromAddress(to);
          broadcast(hostId, JSON.stringify(msg));
          return Response.json({ id: msg.id, timestamp: msg.timestamp });
        } catch (e) {
          return Response.json({ error: "invalid request" }, { status: 400 });
        }
      }

      // GET /events
      if (req.method === "GET" && url.pathname === "/events") {
        const hostId = url.searchParams.get("hostId");
        if (!hostId) {
          return Response.json({ error: "hostId required" }, { status: 400 });
        }
        const since = parseInt(url.searchParams.get("since") || "0", 10);

        let streamController: ReadableStreamDefaultController | null = null;
        const stream = new ReadableStream({
          start(controller) {
            streamController = controller;
            addClient(hostId, controller);
            checkIdle();

            const missed = getMessagesSince(hostId, since);
            for (const msg of missed) {
              controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(msg)}\n\n`));
            }
          },
          cancel() {
            if (streamController) {
              removeClient(hostId, streamController);
              checkIdle();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      }

      // GET /messages (REST fallback)
      if (req.method === "GET" && url.pathname === "/messages") {
        const hostId = url.searchParams.get("hostId");
        if (!hostId) {
          return Response.json({ error: "hostId required" }, { status: 400 });
        }
        const since = parseInt(url.searchParams.get("since") || "0", 10);
        const msgs = getMessagesSince(hostId, since);
        return Response.json(msgs);
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  console.log(`Exchange listening on port ${PORT}`);
}
