import { accumulationBalances, incomeBreakdown, realMean, withdrawalAtAge } from "./projection";
import { RETURN_PRESETS } from "./presets";
import type { RetirementBand, RetirementInput, RetirementResult } from "./types";
import { investmentAnnualVolPct } from "../monteCarlo";

export const NUM_SIMULATIONS = 1000;

// Fixed seed so identical inputs always produce identical bands: no jitter
// between renders, and smooth motion when a single input is nudged (the
// simulations share a common random stream across calls).
const SEED = 0x9e3779b9;

/**
 * Annual return volatility (as a fraction) for a phase. Uses the known
 * volatility of a matching allocation preset when the returns line up, otherwise
 * the calibrated formula above.
 */
function phaseSigma(input: RetirementInput, phase: "accum" | "retire"): number {
  const matching = RETURN_PRESETS.find(
    (p) => p.accumReturn === input.accumReturn && p.retireReturn === input.retireReturn,
  );
  if (phase === "accum") {
    const vol = matching ? matching.accumVolatility : investmentAnnualVolPct(input.accumReturn);
    return vol / 100;
  }
  const vol = matching ? matching.retireVolatility : investmentAnnualVolPct(input.retireReturn);
  return vol / 100;
}

/**
 * AR(1) coefficient on the annual return deviation. Set to 0: each year's real
 * return is drawn iid around the phase mean — the industry-standard default for
 * retirement Monte Carlo. An earlier version used −0.2 to assume mean reversion,
 * which lifts the implied SWR ~0.2pp and had been tuned to match Morningstar's 30y
 * headline. We dropped it: global return history (JST Macrohistory, 1870–2020)
 * shows real returns have *at least* as much multi-year dispersion as iid — crashes
 * and high-inflation decades cluster — so a variance-reducing φ<0 is not empirically
 * supported and was quietly inflating the result. The AR(1) machinery is left in
 * place (just zeroed) so a separately justified mean-reversion view could be
 * reintroduced via this one constant. INNOVATION_SCALE keeps the deviation's
 * stationary stdev at `sigma` (= 1 when φ = 0).
 */
const RETURN_AUTOCORRELATION = 0;
const INNOVATION_SCALE = Math.sqrt(1 - RETURN_AUTOCORRELATION * RETURN_AUTOCORRELATION);

/**
 * Withdrawal-rate guardrail trigger. Spending stays at the full target until a weak
 * sequence lifts the current withdrawal rate above the rate at retirement by this
 * factor (+20%); then the retiree trims spending to the floor (target less
 * `spendingFlexibilityPct`). The "cut when the rate runs high" trigger is the idea
 * behind guardrail methods like Guyton–Klinger, but this is a deliberately simplified
 * version: a single binary cut to the floor (not GK's sticky, incremental 10% steps),
 * downside-only (no upside "prosperity" raises), and memoryless (re-evaluated fresh
 * each year against the fixed initial rate, so spending can return to full when the
 * portfolio recovers). Hardcoded so the UI exposes only the cut depth, not the trigger.
 */
const GUARDRAIL_TRIGGER = 1.2;

/** Deterministic PRNG (mulberry32) for reproducible simulations. */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One standard-normal draw via Box–Muller, using the supplied uniform source. */
function standardNormalFrom(rand: () => number): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(Math.floor(sorted.length * p), sorted.length - 1);
  return sorted[idx];
}

interface PhaseResult {
  successRate: number;
  /** Per-age percentile bands (retireAge..planningAge); null when not collected. */
  bands: RetirementBand[] | null;
}

/**
 * Monte Carlo of the retirement (drawdown) phase only, starting from a fixed
 * balance at `retireAge`. Each year's real return is the phase mean plus an
 * AR(1) deviation, so a bad early run can permanently impair the portfolio —
 * the sequence-of-returns risk a smooth mean-return path hides. Accumulation is
 * deterministic (handled by the caller), so success rises with retirement age.
 *
 * `collectBands` is skipped during the age search (only `successRate` is needed)
 * and turned on once for the chosen age.
 */
function simulate(
  input: RetirementInput,
  retireAge: number,
  startBalance: number,
  collectBands: boolean,
  numSims: number = NUM_SIMULATIONS,
): PhaseResult {
  const breakdown = incomeBreakdown(input);
  const mean = realMean(input.retireReturn, input.inflationRate);
  const sigma = phaseSigma(input, "retire");
  const years = input.planningAge - retireAge;
  const flex = input.spendingFlexibilityPct / 100;
  // Guardrail reference: the withdrawal rate at retirement. A weak sequence that
  // lifts the current rate above this (by GUARDRAIL_TRIGGER) trims spending.
  const initialRate =
    startBalance > 0 ? withdrawalAtAge(input, breakdown, retireAge) / startBalance : 0;

  const balancesByAge = collectBands
    ? Array.from({ length: years + 1 }, () => [] as number[])
    : null;
  let successes = 0;
  const rand = mulberry32(SEED);

  for (let sim = 0; sim < numSims; sim++) {
    let balance = startBalance;
    let depleted = false;
    let deviation = 0; // AR(1) state: deviation from the long-run mean return
    if (balancesByAge) balancesByAge[0].push(balance);

    for (let i = 0; i < years; i++) {
      const age = retireAge + i;
      const full = withdrawalAtAge(input, breakdown, age);
      deviation =
        RETURN_AUTOCORRELATION * deviation + INNOVATION_SCALE * sigma * standardNormalFrom(rand);
      const r = mean + deviation;

      if (!depleted) {
        // Guardrail flexibility: spend the full target most years, but if a weak
        // sequence has lifted the withdrawal rate above its starting level by the
        // trigger margin, trim spending to the floor (target less the flexibility
        // %). At 0% flex the floor equals the target, so this reduces exactly to
        // the fixed-withdrawal model. Mid-year draw earns a half-year of return.
        const behind = full > balance * initialRate * GUARDRAIL_TRIGGER;
        const withdrawal = behind ? full * (1 - flex) : full;
        balance = balance * (1 + r) - withdrawal * (1 + r / 2);
        if (balance <= 0) {
          balance = 0;
          depleted = true; // absorbing: even the floor can't be met.
        }
      }
      if (balancesByAge) balancesByAge[i + 1].push(balance);
    }
    if (!depleted) successes++;
  }

  let bands: RetirementBand[] | null = null;
  if (balancesByAge) {
    bands = balancesByAge.map((vals, i) => {
      vals.sort((a, b) => a - b);
      return {
        age: retireAge + i,
        p10: percentile(vals, 0.1),
        p50: percentile(vals, 0.5),
        p90: percentile(vals, 0.9),
      };
    });
  }

  return { successRate: successes / numSims, bands };
}

/**
 * Simulate the retirement phase at a given age and starting balance, returning
 * the per-age percentile bands and the success rate. Exposed for the chart and
 * tests; the feasibility search uses the lighter band-less path internally.
 */
export function simulateRetirementPhase(
  input: RetirementInput,
  retireAge: number,
  startBalance: number,
): { bands: RetirementBand[]; successRate: number } {
  const { bands, successRate } = simulate(input, retireAge, startBalance, true);
  return { bands: bands ?? [], successRate };
}

// Lighter sim counts for the age-range pass (a threshold + percentiles, which
// are robust to a bit more sampling noise than the headline bands).
const RANGE_SIMS = 300;
const RANGE_PATHS = 800;
const ACCUM_SEED = 0x85ebca6b;

/**
 * The wealth needed at `retireAge` to retire at the target success rate. Success
 * is monotonic in the starting balance, so we bisect for the smallest balance
 * that clears the target — the age-specific "retirement number".
 */
function requiredWealth(input: RetirementInput, retireAge: number, target: number): number {
  const breakdown = incomeBreakdown(input);
  let lo = 0;
  // 100× the annual target funds any horizon even at a zero return — a safe ceiling.
  let hi = Math.max(1, breakdown.targetGrossIncome) * 100;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (simulate(input, retireAge, mid, false, RANGE_SIMS).successRate >= target) hi = mid;
    else lo = mid;
  }
  return hi;
}

/**
 * Distribution of the earliest feasible retirement age across stochastic
 * accumulation paths. We precompute the wealth needed to retire at each age (at
 * the target confidence), then simulate saving paths with year-to-year return
 * swings and record, per path, the first age its wealth reaches that bar. The
 * 25th–75th percentiles are the "50% likely" retirement-age range.
 */
function retirementAgeRange(
  input: RetirementInput,
  detAge: number,
): { p25: number; p50: number; p75: number } | null {
  const target = input.targetSuccessRate / 100;
  const loAge = Math.max(input.currentAge, detAge - 10);
  const hiAge = Math.min(input.planningAge - 1, detAge + 12);
  if (hiAge < loAge) return null;

  const wStar: number[] = []; // indexed by age - loAge
  for (let age = loAge; age <= hiAge; age++) {
    wStar.push(requiredWealth(input, age, target));
  }

  const contribution = (input.currentIncome * input.contributionPct) / 100;
  const { guaranteedIncome } = incomeBreakdown(input);
  const mean = realMean(input.accumReturn, input.inflationRate);
  const sigma = phaseSigma(input, "accum");
  const rand = mulberry32(ACCUM_SEED);

  const crossings: number[] = [];
  for (let p = 0; p < RANGE_PATHS; p++) {
    let balance = input.currentSavings;
    let deviation = 0;
    let crossed = -1;
    for (let age = input.currentAge; age <= hiAge; age++) {
      if (age >= loAge && balance >= wStar[age - loAge]) {
        crossed = age;
        break;
      }
      deviation =
        RETURN_AUTOCORRELATION * deviation + INNOVATION_SCALE * sigma * standardNormalFrom(rand);
      const r = mean + deviation;
      // A pension that starts while still working is saved (matches accumulationBalances).
      const inflow = contribution + (age >= input.pensionStartAge ? guaranteedIncome : 0);
      balance = balance * (1 + r) + inflow * (1 + r / 2);
    }
    // Paths that don't reach the bar within the window retire later still; count
    // them just past it so they lift only the upper tail, not the median.
    crossings.push(crossed < 0 ? hiAge + 1 : crossed);
  }

  crossings.sort((a, b) => a - b);
  return {
    p25: percentile(crossings, 0.25),
    p50: percentile(crossings, 0.5),
    p75: percentile(crossings, 0.75),
  };
}

/**
 * Headline safe withdrawal rate: the first retirement year's portfolio draw as a
 * fraction of savings at retirement — the true initial withdrawal rate. The year-1
 * draw is the FULL target income when retiring before the pension starts (the
 * bridge — so this runs high), otherwise the post-pension gap (comparable to the
 * "4% rule").
 */
export function computePlanSWR(
  input: RetirementInput,
  retireAge: number,
  savingsAtRetirement: number,
): number {
  if (savingsAtRetirement <= 0) return 0;
  const breakdown = incomeBreakdown(input);
  const yearOneWithdrawal = withdrawalAtAge(input, breakdown, retireAge);
  return yearOneWithdrawal / savingsAtRetirement;
}

/**
 * Pure-drawdown safe withdrawal rate (real, as a fraction of the starting balance):
 * the largest constant real withdrawal sustainable for `years` with at least
 * `successRate` survival, for a portfolio with the given nominal mean return and
 * volatility. Independent of the user's savings/pension — this generalizes the
 * headline figure across allocations and horizons for the technical-note reference
 * table. Uses the same normal-return + AR(1) + mid-year-withdrawal dynamics as
 * `simulate` (φ is currently 0, i.e. iid). Lighter `numSims` since it's a table cell.
 */
export function safeWithdrawalRate(
  retireReturnPct: number,
  retireVolPct: number,
  inflationPct: number,
  years: number,
  successRate: number,
  numSims: number = 4000,
): number {
  const mean = realMean(retireReturnPct, inflationPct);
  const sigma = retireVolPct / 100;

  const survival = (w: number): number => {
    const rand = mulberry32(SEED);
    let successes = 0;
    for (let sim = 0; sim < numSims; sim++) {
      let balance = 1;
      let depleted = false;
      let deviation = 0;
      for (let i = 0; i < years; i++) {
        deviation =
          RETURN_AUTOCORRELATION * deviation + INNOVATION_SCALE * sigma * standardNormalFrom(rand);
        const r = mean + deviation;
        if (!depleted) {
          balance = balance * (1 + r) - w * (1 + r / 2);
          if (balance <= 0) {
            balance = 0;
            depleted = true;
          }
        }
      }
      if (!depleted) successes++;
    }
    return successes / numSims;
  };

  let lo = 0;
  let hi = 0.2; // 20%/yr is an unreachable ceiling for any realistic horizon
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (survival(mid) >= successRate) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Earliest retirement age whose simulated plan meets the user's target success
 * rate, on the deterministic (mean-return) accumulation path. Success rises
 * monotonically with age (more saved, shorter drawdown), so the first age that
 * clears the target is the earliest. Also returns the chosen age's accumulation
 * path and retirement bands for the chart, and the stochastic-accumulation
 * `retirementAgeRange` (25th–75th percentile of when saving luck gets you there).
 */
export function computeRetirement(input: RetirementInput): RetirementResult {
  const breakdown = incomeBreakdown(input);
  const target = input.targetSuccessRate / 100;
  const accum = accumulationBalances(input);
  const balanceAt = (age: number) => accum[age - input.currentAge]?.balance ?? 0;

  for (let age = input.currentAge; age < input.planningAge; age++) {
    const startBalance = balanceAt(age);
    if (startBalance <= 0) continue;

    const { successRate } = simulate(input, age, startBalance, false);
    if (successRate < target) continue;

    const { bands } = simulate(input, age, startBalance, true);
    return {
      ...breakdown,
      earliestRetirementAge: age,
      yearsUntilRetirement: age - input.currentAge,
      portfolioAtRetirement: startBalance,
      successRate,
      accumulationPath: accum.slice(0, age - input.currentAge + 1),
      retirementBands: bands,
      retirementAgeRange: retirementAgeRange(input, age),
    };
  }

  return {
    ...breakdown,
    earliestRetirementAge: null,
    yearsUntilRetirement: null,
    portfolioAtRetirement: null,
    successRate: null,
    accumulationPath: null,
    retirementBands: null,
    retirementAgeRange: null,
  };
}
