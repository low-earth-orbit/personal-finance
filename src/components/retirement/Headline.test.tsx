import { describe, expect, it } from "vitest";
import { renderWithMantine, screen } from "@/test-utils";
import Headline from "./Headline";
import Result from "./Result";
import { DEFAULTS } from "@/utils/retirement/presets";
import { computePlan } from "@/utils/retirement/monteCarlo";
import type { RetirementInput } from "@/utils/retirement/types";

const input = (overrides: Partial<RetirementInput> = {}): RetirementInput => ({
  ...DEFAULTS,
  ...overrides,
});

describe("retirement Headline", () => {
  it("explains what the confidence target covers and shows money left", () => {
    const i = input();
    const { result, planSWR } = computePlan(i);
    renderWithMantine(<Headline input={i} result={result} planSWR={planSWR} />);
    expect(
      screen.getByText(/confidence covers market swings after you retire/),
    ).toBeInTheDocument();
    expect(screen.getByText(`Left at age ${i.planningAge}`)).toBeInTheDocument();
    expect(screen.queryByText(/Chance of trimming spending/)).toBeNull();
  });

  it("shows the chance of trimming spending when spending is flexible", () => {
    const i = input({ spendingFlexibilityPct: 20 });
    const { result, planSWR } = computePlan(i);
    renderWithMantine(<Headline input={i} result={result} planSWR={planSWR} />);
    expect(screen.getByText(/Chance of trimming spending/)).toBeInTheDocument();
  });
});

describe("retirement Result", () => {
  it("shows a loader while the first simulation is running", () => {
    renderWithMantine(<Result input={input()} result={null} planSWR={null} loading />);
    expect(screen.getByLabelText(/Simulating your plan/)).toBeInTheDocument();
    expect(screen.queryByText(/Incomplete inputs/)).toBeNull();
  });

  it("asks for fixes when inputs are invalid", () => {
    renderWithMantine(<Result input={input()} result={null} planSWR={null} />);
    expect(screen.getByText(/Incomplete inputs/)).toBeInTheDocument();
  });
});
