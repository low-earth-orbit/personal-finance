# Expected Return Tool

Long-run expected equity return for a global mix (VEQT-like regions) from user inputs: five views per region (yield + growth, CAPE reversion, earnings yield 1.075/CAPE, bond + premium, history), view-weighted, region-weighted, after costs. Deterministic, no worker. Methodology: `docs/expected-return/methodology.md`.

## View names

Use one name per view in all user-facing text (labels, table, notes, presets, docs): **Yield + growth**, **CAPE reversion**, **Earnings yield**, **Bond + premium**, **History**. Code keys are older and stay for saved-input compatibility: `market`, `valuation`, `earningsYield`, `riskPremium`, `history` (weights `weightMarket` …).

## Files

- `Main.tsx` — state container, persists via `src/utils/expected-return/storage.ts` (`er_input`); computes on render; keeps the last valid inputs so an invalid edit pauses the result
- `ExpectedReturnApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `InputForm.tsx` — one accordion section per region, Canada first (weight, yields, growth, CAPE, target CAPE; aria-labels prefixed with the region), horizon & views (horizon, CAPE half-life, real yield, equity premium, history return), view weights (preset buttons from `WEIGHT_PRESETS`, each showing the result it gives with the current inputs; then the five fields, with a note on how the views overlap; editing a field makes the weights custom), costs & conversion
- `Result.tsx` — headline (real, compound, after costs), view range, nominal/arithmetic figures, region × view table with CAPE path
- `Notes.tsx` — method summary and sources

## Engine (`src/utils/expected-return/`)

- `engine.ts` — `VIEWS`, `marketConsistent`, `earningsYield`, `riskPremium`, `gapClosed`, `endCape`, `valuationDrag`, `blendViews`, `regionViews`, `computeExpectedReturn`
- `presets.ts` (example defaults, `REGION_IDS` with Canada first, `WEIGHT_PRESETS` + `matchWeightPreset`), `validation.ts` (field ranges; region and view weights must each sum to 100%), `storage.ts`, `format.ts`, `types.ts`
