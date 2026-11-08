import { describe, expect, it } from "vitest";
import { renderWithMantine as render, screen } from "@/test-utils";
import { Summary } from "./NetWorthChart";

type Point = Parameters<typeof Summary>[0]["data"][number];

const point = (year: number, renterWinPct: number, medianGap: number): Point =>
  ({ year, renterWinPct, medianGap }) as Point;

describe("rent-vs-buy Summary", () => {
  it("reports the median gap and when buying first pulls ahead", () => {
    const data = [point(1, 0.8, 50000), point(2, 0.75, 30000), point(3, 0.4, -10000)];
    render(<Summary data={data} holdingPeriod={2} />);
    expect(screen.getByText(/Renting clearly leads/)).toBeInTheDocument();
    expect(screen.getByText(/renting is ahead by \$30,000/)).toBeInTheDocument();
    expect(screen.getByText(/first pulls ahead in most simulations in year 3/)).toBeInTheDocument();
  });

  it("says when buying never pulls ahead within the horizon", () => {
    const data = [point(1, 0.7, 1000), point(2, 0.65, 2000)];
    render(<Summary data={data} holdingPeriod={2} />);
    expect(
      screen.getByText(/doesn't pull ahead in most simulations within 2 years/),
    ).toBeInTheDocument();
  });

  it("says when buying leads from the first year", () => {
    const data = [point(1, 0.2, -40000), point(2, 0.25, -60000)];
    render(<Summary data={data} holdingPeriod={2} />);
    expect(screen.getByText(/buying is ahead by \$60,000/)).toBeInTheDocument();
    expect(screen.getByText(/ahead in most simulations from year 1/)).toBeInTheDocument();
  });
});
