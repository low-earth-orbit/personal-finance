import { describe, expect, it } from "vitest";
import { renderWithMantine, screen } from "@/test-utils";
import Headline from "./Headline";
import Result from "./Result";
import { DEFAULTS } from "@/utils/retirement/presets";
import { computeRetirement } from "@/utils/retirement/monteCarlo";
import type { RetirementInput } from "@/utils/retirement/types";

const input = (overrides: Partial<RetirementInput> = {}): RetirementInput => ({
  ...DEFAULTS,
  ...overrides,
});

describe("retirement Headline", () => {
  it("explains what the confidence target covers and shows money left", () => {
    const i = input();
    renderWithMantine(<Headline input={i} result={computeRetirement(i)} />);
    expect(
      screen.getByText(/confidence covers market swings after you retire/),
    ).toBeInTheDocument();
    expect(screen.getByText(`Left at age ${i.planningAge}`)).toBeInTheDocument();
  });

  it("does not show a year-1 withdrawal rate", () => {
    const i = input();
    renderWithMantine(<Headline input={i} result={computeRetirement(i)} />);
    expect(screen.queryByText(/Year-1 withdrawal/)).toBeNull();
  });
});

describe("retirement Result", () => {
  it("shows a loader while the first simulation is running", () => {
    renderWithMantine(<Result input={input()} result={null} loading />);
    expect(screen.getByLabelText(/Simulating your plan/)).toBeInTheDocument();
    expect(screen.queryByText(/Incomplete inputs/)).toBeNull();
  });

  it("asks for fixes when inputs are invalid", () => {
    renderWithMantine(<Result input={input()} result={null} />);
    expect(screen.getByText(/Incomplete inputs/)).toBeInTheDocument();
  });
});
