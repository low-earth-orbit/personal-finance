import { computePlan } from "../utils/retirement/monteCarlo";
import type { RetirementWorkerRequest } from "../utils/retirement/types";

// `self` is the DedicatedWorkerGlobalScope inside a Web Worker.
const ctx = self as unknown as Worker;

// The age search runs a few hundred thousand simulated years (~200 ms on a desktop), so it
// runs here rather than on the main thread, where it would stall typing.
ctx.onmessage = (event: MessageEvent<RetirementWorkerRequest>) => {
  const { requestId, input } = event.data;
  ctx.postMessage({ requestId, ...computePlan(input) });
};
