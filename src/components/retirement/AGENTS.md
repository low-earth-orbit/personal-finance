# Retirement Tool

Projects portfolio in real $ → finds earliest feasible retirement age. Grows savings to retirement, draws to top up guaranteed income (CPP/OAS/DB) to target gross income. Methodology: `docs/retirement/swr-methodology.md`.

## Files

- `Main.tsx` — state container, persists via `src/utils/retirement/storage.ts`; runs `computePlan` in `src/workers/retirementWorker.ts` (main-thread fallback when `Worker` is missing, e.g. jsdom)
- `RetirementApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `InputForm.tsx` — user inputs (age, income, savings, target %, CPP/OAS at 65 + start ages, workplace pension)
- `Result.tsx` — renders feasibility result
- `Headline.tsx` — earliest retirement age summary
- `ProjectionChart.tsx` — portfolio projection chart (Recharts)
- `Assumptions.tsx` — key assumption display
- `SwrTechnicalNote.tsx` — static SWR methodology note

## Engine (`src/utils/retirement/`)

- `projection.ts` — deterministic mean-return accumulation path, income breakdown, CPP/OAS start-age adjustments (`guaranteedAtAge`, `incomePhases`)
- `monteCarlo.ts` — MC engine (live): deterministic accumulation + seeded MC drawdown; earliest age meeting the confidence target, age range, cut rate
- `presets.ts`, `validation.ts`, `storage.ts`, `types.ts`
