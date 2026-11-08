# Rent vs Buy Tool

Year-by-year net worth comparison, MC confidence bands, win probability. Methodology: `docs/rent-vs-buy/methodology.md`.

## Files

- `Main.tsx` — state container; holds `userInput`, `expandedFields`, `customPresets`, `hiddenBuiltins`, `activePresetId`; persists via `src/utils/storage.ts`
- `RentVsBuyApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `UserInputForm.tsx` — Accordion form (Rent/Property/Mortgage/Investment/Costs); preset buttons
- `NetWorthChart.tsx` — dispatches MC to Web Worker, renders chart + Summary Alert + CSV
- `Result.tsx` — validates input → renders NetWorthChart
- `Methodology.tsx` — static methodology note

## Engine

`src/utils/monteCarlo.ts` — `runMonteCarlo()` → P25/median/P75 + `medianGap` + `renterWinPct` `src/workers/monteCarloWorker.ts` — runs MC off main thread; debounced 300ms, `requestId` drops stale responses. Seeded (`src/utils/rng.ts`): identical inputs give identical results

## Summary tiers

≥70% → "clearly leads" | 60–70% → "likely leads" | <60% → "too close to call". The body adds the median gap at sale and when buying leads, read relative to the sale year (since when, if buying leads at sale; otherwise the first later year it would, noting an earlier lead that was lost).
