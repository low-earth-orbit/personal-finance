import { allocateLumpSum } from "../utils/allocator/allocate";
import type { AllocationRequest } from "../utils/allocator/types";

const ctx = self as unknown as Worker;

ctx.onmessage = (event: MessageEvent<AllocationRequest>) => {
  const { input, requestId } = event.data;
  const result = allocateLumpSum(input, input.lumpSum);
  ctx.postMessage({ requestId, result });
};
