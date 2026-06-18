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

`src/utils/monteCarlo.ts` — `runMonteCarlo()` → P25/median/P75 + `renterWinPct` `src/workers/monteCarloWorker.ts` — runs MC off main thread; debounced 150ms, `requestId` drops stale responses

## Summary tiers

≥70% → "clearly leads" | 60–70% → "likely leads" | <60% → "too close to call"
