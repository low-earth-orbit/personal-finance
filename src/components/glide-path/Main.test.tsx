import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, renderWithMantine, screen } from "@/test-utils";
import type {
  GlidePathInputKey,
  GlidePathResponse,
  GlidePathReturnMode,
} from "@/utils/glide-path/types";
import type { FieldValue } from "@/types";
import Main from "./Main";

vi.mock("./InputForm", () => ({
  default: ({
    onChange,
    onReturnModeChange,
    onGenerate,
  }: {
    onChange: (key: GlidePathInputKey, value: FieldValue) => void;
    onReturnModeChange: (mode: GlidePathReturnMode) => void;
    onGenerate: () => void;
  }) => (
    <>
      <button onClick={() => onChange("startAge", 31)}>Change input</button>
      <button onClick={() => onReturnModeChange("forward-block")}>
        Change return mode
      </button>
      <button onClick={onGenerate}>Generate</button>
    </>
  ),
}));

vi.mock("./Result", () => ({
  default: ({ stale, updating }: { stale: boolean; updating: boolean }) => (
    <div>
      <span data-testid="stale">{String(stale)}</span>
      <span data-testid="updating">{String(updating)}</span>
    </div>
  ),
}));

class WorkerMock {
  static instances: WorkerMock[] = [];

  onmessage: ((event: MessageEvent<GlidePathResponse>) => void) | null = null;
  onerror: (() => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor() {
    WorkerMock.instances.push(this);
  }
}

describe("glide-path Main", () => {
  beforeEach(() => {
    localStorage.clear();
    WorkerMock.instances = [];
    vi.stubGlobal("Worker", WorkerMock);
  });

  it("waits for explicit generation after inputs change", () => {
    renderWithMantine(<Main />);

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(WorkerMock.instances).toHaveLength(1);

    const requestId = WorkerMock.instances[0]!.postMessage.mock.calls[0]![0]
      .requestId as number;
    act(() => {
      WorkerMock.instances[0]!.onmessage?.({
        data: { requestId, result: {} },
      } as MessageEvent<GlidePathResponse>);
    });

    fireEvent.click(screen.getByRole("button", { name: "Change input" }));
    fireEvent.click(screen.getByRole("button", { name: "Change return mode" }));
    expect(WorkerMock.instances).toHaveLength(1);
    expect(screen.getByTestId("stale")).toHaveTextContent("true");
    expect(screen.getByTestId("updating")).toHaveTextContent("false");

    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(WorkerMock.instances).toHaveLength(2);
    expect(screen.getByTestId("stale")).toHaveTextContent("false");
    expect(screen.getByTestId("updating")).toHaveTextContent("true");
  });
});
