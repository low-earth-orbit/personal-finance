import { computeSwrTable } from "../utils/swr/engine";
import type { SwrWorkerRequest } from "../utils/swr/types";

// `self` is the DedicatedWorkerGlobalScope inside a Web Worker.
const ctx = self as unknown as Worker;

// The table simulates 10,000 paths x 50 years for 11 allocations (~100 ms), so it runs here
// rather than on the main thread, where it would stall typing.
ctx.onmessage = (event: MessageEvent<SwrWorkerRequest>) => {
  const { requestId, input, mode } = event.data;
  ctx.postMessage({ requestId, result: computeSwrTable(input, mode) });
};
