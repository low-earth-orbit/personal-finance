import { findBreakEven, runMonteCarlo } from "../utils/monteCarlo";
import type { MonteCarloRequest } from "../types";

// `self` is the DedicatedWorkerGlobalScope inside a Web Worker.
const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<MonteCarloRequest>) => {
  const { userInput, numSimulations, requestId } = event.data;
  // Post the chart first; the break-even solve (same paths, ~1 s) follows for the same request.
  ctx.postMessage({ requestId, result: runMonteCarlo(userInput, numSimulations) });
  ctx.postMessage({ requestId, breakEven: findBreakEven(userInput, numSimulations) });
};
