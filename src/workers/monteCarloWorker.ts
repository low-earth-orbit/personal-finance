import { findBreakEven, runMonteCarlo } from "../utils/monteCarlo";
import type { MonteCarloRequest } from "../types";

// `self` is the DedicatedWorkerGlobalScope inside a Web Worker.
const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<MonteCarloRequest>) => {
  const { userInput, numSimulations, requestId } = event.data;
  const result = runMonteCarlo(userInput, numSimulations);
  const breakEven = findBreakEven(userInput);
  ctx.postMessage({ requestId, result, breakEven });
};
