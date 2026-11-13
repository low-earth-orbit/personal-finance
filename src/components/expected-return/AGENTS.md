# Expected Return Tool

Long-run expected equity return for a global mix (VEQT-like regions) from user inputs: five views per region (market-consistent yield + growth, CAPE-reversion valuation, earnings yield 1.075/CAPE, real bond yield + equity premium, long-run history), view-weighted, region-weighted, after costs. Deterministic, no worker. Methodology: `docs/expected-return/methodology.md`.

## Files

- `Main.tsx` — state container, persists via `src/utils/expected-return/storage.ts` (`er_input`); computes on render; keeps the last valid inputs so an invalid edit pauses the result
- `ExpectedReturnApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `InputForm.tsx` — one accordion section per region, Canada first (weight, yields, growth, CAPE, target CAPE; aria-labels prefixed with the region), horizon & views (horizon, valuation half-life, real yield, equity premium, history return), view weights (five, with a note on how the views overlap), costs & conversion
- `Result.tsx` — headline (real, compound, after costs), view range, nominal/arithmetic figures, region × view table with CAPE path
- `Notes.tsx` — method summary and sources

## Engine (`src/utils/expected-return/`)

- `engine.ts` — `VIEWS`, `marketConsistent`, `earningsYield`, `riskPremium`, `gapClosed`, `endCape`, `valuationDrag`, `blendViews`, `regionViews`, `computeExpectedReturn`
- `presets.ts` (example defaults, `REGION_IDS` with Canada first), `validation.ts` (field ranges; region and view weights must each sum to 100%), `storage.ts`, `format.ts`, `types.ts`
