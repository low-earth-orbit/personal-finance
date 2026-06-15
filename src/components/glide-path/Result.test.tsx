import { describe, expect, it, vi } from "vitest";
import { fireEvent, renderWithMantine, screen } from "@/test-utils";
import Result from "./Result";
import { DEFAULTS } from "@/utils/glide-path/presets";
import type { GlidePathResult } from "@/utils/glide-path/types";

/** A coherent default result; override fields (and individual params) per test. */
type ResultOverrides = Partial<Omit<GlidePathResult, "params">> & {
  params?: Partial<GlidePathResult["params"]>;
};
function makeResult(o: ResultOverrides = {}): GlidePathResult {
  const params = {
    accumYears: 30,
    retireYears: 30,
    guaranteed: 20000,
    maxLeverage: 1,
    borrowCost: 2,
    gamma: 3,
    interval: 5,
    returnMode: "forward-block" as const,
    ...o.params,
  };
  return {
    schedule: [
      {
        step: 0,
        yearStart: 0,
        yearEnd: 29,
        ageStart: 35,
        phase: "accum",
        equityPct: 80,
      },
      {
        step: 1,
        yearStart: 30,
        yearEnd: 59,
        ageStart: 65,
        phase: "retire",
        equityPct: 50,
      },
    ],
    equityByYear: Array.from({ length: 60 }, (_, i) => (i < 30 ? 0.8 : 0.5)),
    accumDir: "Falling",
    retireDir: "Rising",
    tentPct: 50,
    tentAge: 66,
    ceIncome: 50000,
    flatEquityPct: 60,
    flatCeIncome: 49000,
    depletion: 0.05,
    drawdownDepletion: 0.05,
    expectedRetirementBalance: 1200000,
    flatDepletion: 0.06,
    flatDrawdownDepletion: 0.04,
    incomeCv: 0.2,
    ...o,
    params,
  };
}

function renderResult(result: GlidePathResult | null, extra = {}) {
  return renderWithMantine(
    <Result
      input={{ ...DEFAULTS }}
      result={result}
      computing={false}
      hasErrors={false}
      {...extra}
    />,
  );
}

describe("glide-path Result", () => {
  it("prefers the constant allocation when CE income is within 1%", () => {
    renderResult(makeResult({ flatCeIncome: 49500 }));
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The constant allocation is preferred/i),
    ).toBeInTheDocument();
  });

  it("reports comparable outcomes for both allocation options", () => {
    renderResult(
      makeResult({
        ceIncome: 55000,
        flatCeIncome: 47000,
        depletion: 0.12,
        flatDepletion: 0.24,
        drawdownDepletion: 0.08,
        flatDrawdownDepletion: 0.18,
      }),
    );
    expect(screen.getAllByText(/Optimized glide path/i)).not.toHaveLength(0);
    expect(screen.getAllByText(/Constant 60% equity/i)).not.toHaveLength(0);
    expect(screen.getByText("$55,000/yr")).toBeInTheDocument();
    expect(screen.getByText("$47,000/yr")).toBeInTheDocument();
    expect(screen.getByText("8.0%")).toBeInTheDocument();
    expect(screen.getByText("18.0%")).toBeInTheDocument();
    expect(screen.getByText("12.0%")).toBeInTheDocument();
    expect(screen.getByText("24.0%")).toBeInTheDocument();
  });

  it("matches slope badge icons to the actual glide-path shape", () => {
    const { container } = renderResult(
      makeResult({ accumDir: "Rising", retireDir: "Falling" }),
    );

    expect(container.querySelectorAll(".tabler-icon-trending-up")).toHaveLength(
      1,
    );
    expect(
      container.querySelectorAll(".tabler-icon-trending-down"),
    ).toHaveLength(1);
  });

  it("uses a horizontal icon for flat slopes and no icon for n/a", () => {
    const { container } = renderResult(
      makeResult({ accumDir: "Flat", retireDir: "n/a" }),
    );

    expect(container.querySelectorAll(".tabler-icon-minus")).toHaveLength(1);
    expect(
      container.querySelectorAll(
        ".tabler-icon-trending-up, .tabler-icon-trending-down",
      ),
    ).toHaveLength(0);
  });

  it("prefers the constant when drawdown depletion is within half a point", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 59400,
        drawdownDepletion: 0.05,
        flatDrawdownDepletion: 0.054,
        depletion: 0.1,
        flatDepletion: 0.1,
      }),
    );
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The constant allocation is preferred/i),
    ).toBeInTheDocument();
  });

  it("prefers the glide when the constant's drawdown shortfall is meaningfully higher", () => {
    // Same CE story, but the constant adds >0.5pp of drawdown shortfall — the
    // tightened gate vetoes the simplicity pick.
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 59400,
        drawdownDepletion: 0.05,
        flatDrawdownDepletion: 0.06,
        depletion: 0.1,
        flatDepletion: 0.1,
      }),
    );
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The glide path is preferred/i),
    ).toBeInTheDocument();
  });

  it("prefers the constant when full-path shortfall is within 1 point", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 59400,
        drawdownDepletion: 0.05,
        flatDrawdownDepletion: 0.05,
        depletion: 0.1,
        flatDepletion: 0.109,
      }),
    );
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The constant allocation is preferred/i),
    ).toBeInTheDocument();
  });

  it("prefers the constant when it wins all comparable outcomes", () => {
    renderResult(
      makeResult({
        ceIncome: 50000,
        flatCeIncome: 51000,
        drawdownDepletion: 0.08,
        flatDrawdownDepletion: 0.07,
        depletion: 0.12,
        flatDepletion: 0.1,
      }),
    );
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/The constant allocation is preferred/i),
    ).toBeInTheDocument();
  });

  it("prefers the glide path when the constant trails every threshold", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 50000,
        drawdownDepletion: 0.05,
        flatDrawdownDepletion: 0.11,
        depletion: 0.1,
        flatDepletion: 0.16,
      }),
    );
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(
        /The glide path is preferred because the constant allocation trails it/i,
      ),
    ).toBeInTheDocument();
  });

  it("suggests retiring earlier or spending more below 5% drawdown shortfall", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 50000,
        drawdownDepletion: 0.049,
        flatDrawdownDepletion: 0.2,
        depletion: 0.1,
        flatDepletion: 0.3,
      }),
    );

    const guidance = screen.getByText(/You may have room to adjust your plan/i);
    const recommendation = screen.getByText(/Recommended allocation/i);

    expect(
      screen.getByText(/may be able to retire earlier or increase/i),
    ).toBeInTheDocument();
    expect(
      guidance.compareDocumentPosition(recommendation) &
        Node.DOCUMENT_POSITION_PRECEDING,
    ).toBeTruthy();
  });

  it("does not show plan-adjustment guidance at exactly 5% drawdown shortfall", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 50000,
        drawdownDepletion: 0.05,
        flatDrawdownDepletion: 0.2,
        depletion: 0.1,
        flatDepletion: 0.3,
      }),
    );

    expect(
      screen.queryByText(/may be able to retire earlier or increase/i),
    ).toBeNull();
  });

  it("does not show plan-adjustment guidance for an inconclusive comparison", () => {
    renderResult(
      makeResult({
        ceIncome: 95,
        flatCeIncome: 444,
        drawdownDepletion: 0.04,
        flatDrawdownDepletion: 0.03,
      }),
    );

    expect(
      screen.queryByText(/may be able to retire earlier or increase/i),
    ).toBeNull();
  });

  it("warns when recommended drawdown shortfall is at least 15%", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 50000,
        drawdownDepletion: 0.15,
        flatDrawdownDepletion: 0.2,
        depletion: 0.1,
        flatDepletion: 0.3,
      }),
    );

    const warning = screen.getByText(/Your plan may need adjustment/i);
    const glide = screen.getByRole("heading", { name: "Optimized glide path" });

    expect(
      screen.getByText(/Drawdown shortfall is 15% or higher/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Recommended allocation/i)).toBeNull();
    expect(screen.queryByText(/Alternative —/i)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Constant 60% equity" }),
    ).toBeInTheDocument();
    expect(
      warning.compareDocumentPosition(glide) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("warns when recommended full-path shortfall is at least 30%", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 50000,
        drawdownDepletion: 0.08,
        flatDrawdownDepletion: 0.2,
        depletion: 0.3,
        flatDepletion: 0.35,
      }),
    );

    expect(
      screen.getByText(/Full-path shortfall is 30% or higher/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Recommended allocation/i)).toBeNull();
    expect(screen.queryByText(/Alternative —/i)).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Optimized glide path" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Constant 60% equity" }),
    ).toBeInTheDocument();
  });

  it("suppresses positive guidance when full-path risk is high", () => {
    renderResult(
      makeResult({
        ceIncome: 60000,
        flatCeIncome: 50000,
        drawdownDepletion: 0.04,
        flatDrawdownDepletion: 0.2,
        depletion: 0.55,
        flatDepletion: 0.55,
      }),
    );

    expect(
      screen.queryByText(/may be able to retire earlier or increase/i),
    ).toBeNull();
    expect(
      screen.getByText(/Full-path shortfall is 30% or higher/i),
    ).toBeInTheDocument();
  });

  it("uses inline warning icons instead of planner-style alerts", () => {
    const { container } = renderResult(
      makeResult({
        ceIncome: 95,
        flatCeIncome: 50000,
        depletion: 0.55,
        drawdownDepletion: 0.25,
        flatDepletion: 0.08,
        flatDrawdownDepletion: 0.04,
      }),
    );
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      container.querySelectorAll(".tabler-icon-alert-triangle"),
    ).toHaveLength(3);
    expect(screen.getAllByText(/Tail-dominated/i)).not.toHaveLength(0);
  });

  it("prefers the constant when only the glide path CE is tail-dominated", () => {
    renderResult(makeResult({ ceIncome: 95, flatCeIncome: 50000 }));

    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/glide path's CE income is tail-dominated/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Comparison inconclusive/i)).toBeNull();
  });

  it("prefers the glide path when only the constant CE is tail-dominated", () => {
    renderResult(makeResult({ ceIncome: 50000, flatCeIncome: 444 }));

    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByText(/constant allocation's CE income is tail-dominated/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Comparison inconclusive/i)).toBeNull();
  });

  it("shows an inconclusive comparison when both CE scores are tail-dominated", () => {
    renderResult(makeResult({ ceIncome: 95, flatCeIncome: 444 }));

    expect(screen.getByText(/Comparison inconclusive/i)).toBeInTheDocument();
    expect(
      screen.getByText(/cannot reliably distinguish these allocations/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Recommended allocation/i)).toBeNull();
    expect(screen.getAllByText("Optimized glide path")).not.toHaveLength(0);
    expect(screen.getAllByText("Constant 60% equity")).not.toHaveLength(0);
  });

  it("renders an error state when the worker fails", () => {
    renderResult(null, { error: true });
    expect(screen.getByText(/Couldn't compute/i)).toBeInTheDocument();
  });

  it("offers an opt-in re-roll control that recomputes with a new seed", () => {
    const onReroll = vi.fn();
    renderResult(makeResult(), { onReroll });
    fireEvent.click(
      screen.getByRole("button", { name: /another simulation sample/i }),
    );
    expect(onReroll).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/Optional stability check/i)).toBeInTheDocument();
  });

  it("labels the alternative sample after re-rolling", () => {
    renderResult(makeResult(), { onReroll: () => {}, seed: 2 });
    expect(screen.getByText(/simulation sample #3/i)).toBeInTheDocument();
  });

  it("omits the re-roll control when no handler is provided", () => {
    renderResult(makeResult());
    expect(
      screen.queryByRole("button", { name: /another simulation sample/i }),
    ).toBeNull();
  });

  it("shows the empty state before generating", () => {
    renderResult(null);
    expect(screen.getByText(/Ready to optimize/i)).toBeInTheDocument();
  });

  it("shows the loading state while computing", () => {
    renderResult(null, { computing: true });
    expect(
      screen.getByText(/Optimizing your allocation paths/i),
    ).toBeInTheDocument();
  });

  it("keeps existing results visible while updating", () => {
    renderResult(makeResult(), {
      computing: true,
      updating: true,
      onReroll: () => {},
    });
    expect(screen.getByText(/Updating allocation paths/i)).toBeInTheDocument();
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /another simulation sample/i }),
    ).toBeDisabled();
  });

  it("keeps existing results visible after inputs change and prompts generation", () => {
    renderResult(makeResult(), { stale: true, onReroll: () => {} });
    expect(
      screen.getByText(/Inputs changed.*Generate allocation paths/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Recommended allocation/i)).toBeInTheDocument();
    expect(screen.queryByText(/Updating allocation paths/i)).toBeNull();
    expect(
      screen.getByRole("button", { name: /another simulation sample/i }),
    ).toBeDisabled();
  });

  it("prompts users to fix invalid changed inputs before generating", () => {
    renderResult(makeResult(), { stale: true, hasErrors: true });
    expect(
      screen.getByText(/fix the highlighted fields, then generate again/i),
    ).toBeInTheDocument();
  });
});
