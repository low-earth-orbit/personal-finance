# AGENTS.md

## Quick Start

```bash
npm run dev          # dev server http://localhost:3000
npm run build        # static export → ./out
npm run lint         # ESLint flat config
npm run typecheck    # tsc --noEmit
npm run format       # Prettier (format:check to verify)
npm test             # Vitest + RTL
npm run test:e2e     # Playwright (auto-starts dev server)
python3 -m unittest discover -s analysis -p 'test_*.py' -v
```

`dev`/`build` set `NODE_OPTIONS=--max-old-space-size=8192`. Turbopack dev server grows over session — restart on OOM. Always use `npm run …`.

The Turbopack on-disk dev cache is disabled in `next.config.ts` (`turbopackFileSystemCacheForDev: false`): a corrupt cache twice made `next dev` unusable (runaway worker processes; `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`). If dev ever misbehaves, stop it and `rm -rf .next`. Don't run `npm run build` against a `.next` that a dev server is using; build in a copy if you need both.

Types: **TypeScript** `.ts`/`.tsx`. Shared domain types: `src/types.ts`.

## Agent Workflow

**Claude plans, executes, and verifies.** One writer at a time.

**Scope discipline:** Match the user's requested surface. For narrow copy/UI/mechanical tasks, do not refactor adjacent code, update unrelated docs, or "fix" nearby stale tests unless needed to complete the request. Report unrelated failures separately.

**Worktree safety:** Start with `git status --short` before edits. Never revert or overwrite unrelated user changes. If touched files already contain user edits, work with them and keep the patch minimal.

### Task tiers

| Tier         | Examples                               | Planning                         |
| ------------ | -------------------------------------- | -------------------------------- |
| **trivial**  | lint fix, rename, label change         | none                             |
| **standard** | new feature, multi-file, test coverage | short plan (1 turn)              |
| **complex**  | finance engine, new tool, architecture | full plan + risks before editing |

No peer-review step: do not spawn reviewer/verifier subagents or second-opinion passes (token cost). Claude checks its own diff once and relies on the Definition of Done checks below; the user reviews the final diff.

## Definition of Done

- Run the narrowest relevant verification first: `npm run lint`, `npm run typecheck`, `npm test`, Python unittest, or targeted suites.
- Run `npm run format:check` before pushing or handing off a branch.
- For visible UI or interaction changes, run the dev server and verify in browser when feasible. If browser verification is blocked, say so explicitly.
- For build/export behavior, run `npm run build`.
- For e2e-sensitive flows, run `npm run test:e2e` or the relevant Playwright spec.
- Summarize changed files, verification run, and any known unrelated failures.

## CI/CD

- `ci.yml`: lint + typecheck + format + tests + build + Playwright on every PR and `main` push
- `deploy.yml`: same gates → build → publish `./out` to GitHub Pages

## Tools

| Route | Tool | Description |
| --- | --- | --- |
| `/rent-vs-buy` | Rent vs Buy | Year-by-year net worth comparison, MC bands, win probability |
| `/retirement` | When can I retire? | Portfolio projection in real $; grows to retirement, draws to target income |
| `/glide-path` | Lifetime Allocation | MC coordinate ascent, CRRA utility, optimized vs constant allocation |
| `/acb` | ACB Calculator | Computes adjusted cost basis from Wealthsimple activity CSV export |
| `/allocator` | Where to invest: TFSA, RRSP or Non-Reg? | Invests one lump sum now across TFSA, RRSP, and non-registered accounts |

**New tool pattern:** `src/app/<tool>/` + `src/components/<tool>/`. Reuse `src/components/shared/` and `src/utils/`. Import alias: `@/` → `./src/`.

**Glide-path detail:** Web + Python default to `iid-mc` (forward-CMA iid Monte Carlo — the no-recovery baseline); `forward-block` (JST pooled → forward-CMA rescaled → block bootstrap; bundle at `src/utils/glide-path/jstData.ts`) is the historical-sequencing scenario toggle. Python: `analysis/recommend_glide.py` also supports `historical-iid`/`historical-block`; `--dataset pooled|world`; `--exclude-countries/years`. Regenerate bundle: `python3 -m analysis.glide_path.generate_bundle`. Web fixes 5yr interval, no bequest weight, one equity ceiling for all years, 2.1% inflation (`withFixedSettings`), browser caps, ≥$10k guaranteed income. Python keeps research controls.

## Architecture

**App entry (`src/app/`):** `layout.tsx` (root HTML, Mantine, Source Sans 3) → `providers.tsx` (MantineProvider, Ledger theme from `theme.ts`, localStorage color scheme) → `page.tsx` (hub SimpleGrid). Tools use `next/dynamic({ ssr: false })` inside `"use client"` wrappers to avoid hydration mismatches with localStorage state.

**CSS:** Tailwind v4 + Mantine via `@layer(tailwind-base, mantine, tailwind-utilities)` — Tailwind preflight never overrides Mantine.

**Design system ("Ledger"):** ink on paper, rules instead of boxes — and few of them: one 1px ink rule opens each column (first form section, result block), later sections get a hairline or just whitespace, form rows are unruled, and alerts/`Notice` use a short side bar. Don't add full-width rules to separate things a heading already separates. `src/app/theme.ts` defines `ledger` (green accent), `rust` (warnings) and `ink` (virtual light/dark) palettes, primary color `ink`; `theme.module.css` restyles Card/Accordion/Alert/Table/NumberInput globally. Shared tokens (`--pf-ink`, `--pf-accent`, `--pf-warn`, `--pf-hairline`, …) live in `globals.css` with dark overrides — use them for chart strokes and inline styles, not Mantine `teal`/`indigo`. Figures, eyebrows and table cells use `--pf-font-figures` (the text face with tabular numerals) — set it with `ff="var(--pf-font-figures)"` or in CSS, and don't use `ff="monospace"`. Form fields render as label-left rows (`UserInputFormItem`, `fieldRowClassNames`); pass `layout="stacked"` inside popovers. Ink-coloured variants get scheme-aware text from `variantColorResolver` (`--pf-on-ink` on filled, `--pf-ink` on subtle/outline) — don't patch dark mode per component. Result building blocks live in `shared/Figures.tsx` (`Eyebrow`, `FigureStrip`/`Figure`, `Notice`), with `SectionSummary` for collapsed accordion recaps, `FieldHeader` + `fieldRowClasses.block` for full-width controls, and `ToolNotes` for the prose section under a tool.

**UI (`src/components/`):**

- `shared/`: `Header`, `Footer`, `DisclaimerModal`, `FieldLabel`, `UserInputFormItem` (Mantine NumberInput + optional `$`/`%` toggle), `UserInputRangeItem` (base + ±2σ expand)
- `rent-vs-buy/Main.tsx`: state container; persists all state to localStorage via `storage.ts`
- `Result.tsx` → `NetWorthChart.tsx`: dispatches MC to Web Worker, renders chart + Summary Alert + CSV

**Calc (`src/utils/`):** `math.ts`, `monteCarlo.ts` (`runMonteCarlo()` → P25/median/P75 + `medianGap` + `renterWinPct`), `presets.ts`, `validation.ts`, `format.ts`, `storage.ts`.

**Web Worker:** `src/workers/monteCarloWorker.ts`. `NetWorthChart` debounces 300ms, tracks `requestId` to drop stale responses. Retirement uses the same pattern (`src/workers/retirementWorker.ts`, 150ms debounce). All MC engines draw from the seeded `src/utils/rng.ts`.

**React Compiler on.** No `useMemo`/`useCallback`/`React.memo` — compiler handles memoization.

**Testing:** Vitest + RTL (unit `*.test.ts`, component `*.test.tsx`, render via `src/test-utils.tsx`). Playwright e2e in `e2e/`. Both mock `matchMedia`/`ResizeObserver`.

## Tool-Specific Methodology

See `docs/` for per-tool deep dives:

- [docs/rent-vs-buy/methodology.md](docs/rent-vs-buy/methodology.md) — MC architecture, modeling assumptions, summary tier logic
- [docs/retirement/swr-methodology.md](docs/retirement/swr-methodology.md) — SWR engine, safe withdrawal assumptions
- [docs/glide-path/methodology.md](docs/glide-path/methodology.md) — CRRA utility, coordinate ascent, forward-block bootstrap
