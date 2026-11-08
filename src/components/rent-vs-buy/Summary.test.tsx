import { describe, expect, it } from "vitest";
import { renderWithMantine as render, screen } from "@/test-utils";
import { Summary } from "./NetWorthChart";

type Point = Parameters<typeof Summary>[0]["data"][number];

const point = (year: number, renterWinPct: number, medianGap: number): Point =>
  ({ year, renterWinPct, medianGap }) as Point;

describe("rent-vs-buy Summary", () => {
  it("reports the median gap and when buying would pull ahead after the sale", () => {
    const data = [point(1, 0.8, 50000), point(2, 0.75, 30000), point(3, 0.4, -10000)];
    render(<Summary data={data} holdingPeriod={2} />);
    expect(screen.getByText(/Renting clearly leads/)).toBeInTheDocument();
    expect(screen.getByText(/renting is ahead by \$30,000/)).toBeInTheDocument();
    expect(
      screen.getByText(/Holding longer, buying would pull ahead in most simulations in year 3/),
    ).toBeInTheDocument();
  });

  it("says when buying never pulls ahead within the horizon", () => {
    const data = [point(1, 0.7, 1000), point(2, 0.65, 2000)];
    render(<Summary data={data} holdingPeriod={2} />);
    expect(
      screen.getByText(/doesn't pull ahead in most simulations by year 2/),
    ).toBeInTheDocument();
  });

  it("says when buying leads from the first year", () => {
    const data = [point(1, 0.2, -40000), point(2, 0.25, -60000)];
    render(<Summary data={data} holdingPeriod={2} />);
    expect(screen.getByText(/buying is ahead by \$60,000/)).toBeInTheDocument();
    expect(screen.getByText(/ahead in most simulations from year 1/)).toBeInTheDocument();
  });

  it("does not claim a break-even when buying's earlier lead is lost by the sale", () => {
    const data = [point(1, 0.4, -5000), point(2, 0.45, -2000), point(3, 0.6, 8000)];
    render(<Summary data={data} holdingPeriod={3} />);
    expect(screen.getByText(/Renting likely leads/)).toBeInTheDocument();
    expect(screen.getByText(/in some earlier years, but not at the sale/)).toBeInTheDocument();
    expect(screen.queryByText(/since year/)).toBeNull();
  });

  it("dates buying's lead from the start of the run that reaches the sale", () => {
    const data = [
      point(1, 0.4, -1000),
      point(2, 0.7, 9000),
      point(3, 0.35, -4000),
      point(4, 0.3, -9000),
    ];
    render(<Summary data={data} holdingPeriod={4} />);
    expect(screen.getByText(/ahead in most simulations since year 3/)).toBeInTheDocument();
  });
});
