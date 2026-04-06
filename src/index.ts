import { initStore } from "./store";
import { startHeartbeat } from "./sse";
import { startServer } from "./server";
import { startIdleCheck } from "./idle";

console.log("Exchange starting...");

initStore();
startHeartbeat();
startServer();
startIdleCheck();

console.log("Exchange ready.");
