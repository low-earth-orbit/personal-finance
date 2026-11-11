# Glide-Path Tool

MC coordinate ascent → welfare-maximizing equity allocation curve (accumulation + decumulation). Compares optimized glide vs best constant allocation. Methodology: `docs/glide-path/methodology.md`.

## Files

- `Main.tsx` — state container, persists via `src/utils/glide-path/storage.ts`
- `GlidePathApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `InputForm.tsx` — user inputs (age, savings, guaranteed income, risk aversion)
- `Result.tsx` — renders optimized vs constant comparison (decision logic lives in `src/utils/glide-path/recommendation.ts`); shows one card when the glide is itself the constant weight, and dims a result whose inputs have changed
- `GlidePathChart.tsx` — equity allocation curve chart (Recharts)
- `Methodology.tsx` — static explainer (how it works, reading the result, findings); keep its numbers in line with `docs/glide-path/methodology.md`

## Engine (`src/utils/glide-path/`)

- `engine.ts` — coordinate ascent optimizer, CRRA utility, forward-block bootstrap
- `blockBootstrap.ts` — stationary block bootstrap over JST history
- `jstData.ts` — **generated bundle** (JST pooled history; do not edit manually — regenerate via `python3 -m analysis.glide_path.generate_bundle`)
- `recommendation.ts` — glide vs constant pick (simplicity bias, degenerate-CE guard)
- `presets.ts`, `validation.ts`, `storage.ts`, `types.ts`; the seeded RNG is the shared `src/utils/rng.ts`

## Simplicity bias

`src/utils/glide-path/recommendation.ts` `SIMPLICITY_*` constants: the constant allocation is recommended unless the glide beats it by more than 3% on CE income (spending CE even with a bequest weight; welfare CE is unstable for rich plans) or by more than 1 point on full-path shortfall (CE gaps <3% are within model uncertainty). Over-funded plans (`result.overFunded`) tie on income, so the constant wins there too.
