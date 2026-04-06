import { getConnectedHostCount } from "./sse";

const IDLE_TIMEOUT_MS = parseInt(process.env.IDLE_TIMEOUT_MS || String(48 * 60 * 60 * 1000), 10);
const IS_DEV = process.env.NODE_ENV !== "production";

let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function checkIdle(): void {
  const count = getConnectedHostCount();

  if (count === 0 && !idleTimer) {
    console.log(`No connected hosts. Starting idle countdown (${IDLE_TIMEOUT_MS}ms).`);
    idleTimer = setTimeout(() => {
      if (IS_DEV) {
        console.log("Would self-destruct (dev mode, continuing).");
      } else {
        console.warn("Idle timeout reached. Self-destructing.");
        process.exit(0);
      }
    }, IDLE_TIMEOUT_MS);
  } else if (count > 0 && idleTimer) {
    console.log("Host reconnected. Cancelling idle countdown.");
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

export function startIdleCheck(): void {
  setInterval(checkIdle, 10_000);
  checkIdle();
}
