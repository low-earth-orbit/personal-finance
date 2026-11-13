import type { ReactNode } from "react";
import { Anchor, Text } from "@mantine/core";
import ToolNotes from "@/components/shared/ToolNotes";

/**
 * Quotes and apostrophes are typed as typographic characters, not HTML entities: with an entity in
 * a text run, this toolchain drops the run's leading space after an inline element ("<b>Bond +
 * premium</b> is" rendered as "Bond + premiumis").
 */
function Point({ heading, children }: { heading?: string; children: ReactNode }) {
  return (
    <Text size="sm" pb="sm" c="dimmed">
      {heading && (
        <>
          <Text span fw={600} c="bright">
            {heading}
          </Text>{" "}
        </>
      )}
      {children}
    </Text>
  );
}

function Source({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Anchor href={href} target="_blank" rel="noreferrer" c="dimmed" underline="always">
      {children}
    </Anchor>
  );
}

export default function Notes() {
  return (
    <>
      <ToolNotes title="Method" columns>
        <Point>
          No single model forecasts stock returns well: most predictors barely beat the long-run
          average out of sample (Goyal and Welch, 2008). So this tool blends five views per region
          and shows how far apart they are. All returns are real (after inflation), in local
          currency and compound (geometric). Currencies are assumed to add nothing over the long
          run, so regions are blended directly by weight.
        </Point>
        <Point heading="Market-consistent.">
          The building-block model (Grinold and Kroner) with valuation multiples held where they
          are: dividend yield + net buyback yield + real growth of total earnings. Damodaran’s
          implied equity risk premium rests on the same yield-plus-growth logic. Treating yield +
          growth as a compound return follows common practice; some argue it is closer to an
          arithmetic one, which would lower it by about half the variance.
        </Point>
        <Point heading="Valuation.">
          Adds a CAPE drag. Log CAPE decays toward your target like an AR(1): half the gap closes
          every half-life, so most of the move comes early. The total change is averaged over your
          horizon. In US data since 1881 the half-life is about 7–13 years, depending on the
          estimator; the default is 10. Setting the target equal to today switches it off for that
          region.
        </Point>
        <Point heading="Earnings yield.">
          1/CAPE, scaled up by 1.075: CAPE’s 10-year earnings average sits about 5 years behind
          today’s earnings, and 5 years of 1.5% real growth is 1.015^5 ≈ 1.075. If multiples stay
          put and retained earnings earn the cost of capital, the real return equals the earnings
          yield, with no growth input needed (AQR averages a version of it with yield + growth). It
          overstates returns where companies issue many new shares, as in emerging markets.
        </Point>
        <Point heading="Bond + premium.">
          The 10-year TIPS yield plus an equity risk premium, the same for every region. It ties the
          estimate to today’s bond market, so a rise in real yields lifts the expected return on
          stocks too. The default premium is Damodaran’s implied premium for the S&P 500, which
          leans on analyst earnings forecasts; stocks have beaten bonds by about 3% a year across
          countries since 1900.
        </Point>
        <Point heading="History.">
          One long-run real return for every region, about 5% for global stocks since 1900 (Dimson,
          Marsh and Staunton; Jordà, Schularick and Taylor). It is the anchor the other views shrink
          toward. The default weights are equal: simple equal-weight averages of forecasts have
          beaten the individual forecasts out of sample (Rapach, Strauss and Zhou, 2010).
        </Point>
        <Point heading="Costs and conversions.">
          The fund MER plus foreign withholding tax on dividends come off the blend. Withholding is
          lost in a TFSA or RRSP but mostly recoverable through the foreign tax credit in a
          non-registered account, so lower it there. The nominal figure compounds your inflation
          rate on top; the arithmetic figure converts it with your volatility. Even with a century
          of data, the average return is only known to about ±1.5%, so check plans against the low
          end of the range. Published assumptions, such as FP Canada’s Projection Assumption
          Guidelines, are a good cross-check.
        </Point>
      </ToolNotes>

      <ToolNotes title="Where to find the inputs" columns>
        <Point>
          The defaults were set from market data on November 12, 2026. Yields, CAPE, the real bond
          yield and the equity premium move with markets, so update them before relying on the
          result. Each field’s info button repeats its source.
        </Point>
        <Point heading="Dividend yield and P/E.">
          Index ETF pages list both: iShares XIC (Canada), IVV (US), EFA (developed ex-North
          America) and EEM (emerging). Add the fund’s fee back to its distribution yield.
        </Point>
        <Point heading="CAPE.">
          <Source href="https://www.multpl.com/shiller-pe">multpl.com</Source> shows it daily, and{" "}
          <Source href="http://www.econ.yale.edu/~shiller/data.htm">Robert Shiller’s data</Source>{" "}
          has the full history. For other regions,{" "}
          <Source href="https://www.researchaffiliates.com/asset-allocation">
            Research Affiliates’ Asset Allocation Interactive
          </Source>{" "}
          shows CAPE by market (free sign-up).
        </Point>
        <Point heading="Real bond yield.">
          The 10-year TIPS yield,{" "}
          <Source href="https://fred.stlouisfed.org/series/DFII10">FRED series DFII10</Source>.
        </Point>
        <Point heading="Equity risk premium.">
          <Source href="https://pages.stern.nyu.edu/~adamodar/">Aswath Damodaran’s site</Source>,
          updated at the start of each month (Implied ERP).
        </Point>
        <Point heading="Buybacks and earnings growth.">
          S&P Dow Jones Indices reports S&P 500 buybacks quarterly. For growth, long-run real GDP
          projections such as the IMF World Economic Outlook are a reasonable guide.
        </Point>
        <Point heading="Fund costs and weights.">
          The fund’s fact sheet has the MER and regional split. Long-run returns: the UBS Global
          Investment Returns Yearbook (free summary edition).
        </Point>
      </ToolNotes>
    </>
  );
}
