# SWR Tool

Safe withdrawal rate table: stock/bond mix (rows) by horizon (columns), from user-set stock and bond return, volatility, correlation, inflation and success rate. Optional VR(10) dynamics per asset. Methodology: `docs/swr/methodology.md`.

## Files

- `Main.tsx` — state container, persists via `src/utils/swr/storage.ts` (`swr_input`, `swr_dynamics`); runs `computeSwrTable` in `src/workers/swrWorker.ts` (150ms debounce, `requestId`, main-thread fallback when `Worker` is missing, e.g. jsdom)
- `SwrApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `InputForm.tsx` — capital market assumptions, success rate, return dynamics (Independent / Historical / Custom VR)
- `Result.tsx` — the table (sticky row labels, best rate per horizon in `--pf-accent`), clamp notice, footnote, `JumpToResult`
- `Notes.tsx` — method, VR caveat, PWL acknowledgement

## Engine (`src/utils/swr/`)

- `engine.ts` — `vrFromPhi`/`phiFromVr`, `innovationCorrelation`, `generateAssetPaths` (AR(1) paths, common random numbers), `swrFromPaths` (exact `(1−p)` quantile of `1/S_H`, no bisection), `computeSwrTable`
- `presets.ts` (defaults, `SWR_HORIZONS`, `HISTORICAL_VR`), `validation.ts`, `storage.ts`, `types.ts`
