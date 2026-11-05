# Glide-Path Tool

MC coordinate ascent → welfare-maximizing equity allocation curve (accumulation + decumulation). Compares optimized glide vs best constant allocation. Methodology: `docs/glide-path/methodology.md`.

## Files

- `Main.tsx` — state container, persists via `src/utils/glide-path/storage.ts`
- `GlidePathApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `InputForm.tsx` — user inputs (age, savings, guaranteed income, risk aversion)
- `Result.tsx` — renders optimized vs constant comparison (decision logic lives in `src/utils/glide-path/recommendation.ts`)
- `GlidePathChart.tsx` — equity allocation curve chart (Recharts)
- `Methodology.tsx` — static methodology note

## Engine (`src/utils/glide-path/`)

- `engine.ts` — coordinate ascent optimizer, CRRA utility, forward-block bootstrap
- `blockBootstrap.ts` — stationary block bootstrap over JST history
- `jstData.ts` — **generated bundle** (JST pooled history; do not edit manually — regenerate via `python3 -m analysis.glide_path.generate_bundle`)
- `recommendation.ts` — glide vs constant pick (simplicity bias, degenerate-CE guard)
- `presets.ts`, `validation.ts`, `storage.ts`, `types.ts`, `rng.ts`

## Simplicity bias

`src/utils/glide-path/recommendation.ts` `SIMPLICITY_*` constants: constant allocation wins when CE income outright OR within 3% CE + within 0.5pp/1.5pp shortfall rates (CE gaps <3% are within model uncertainty; the shortfall gates carry the veto).
