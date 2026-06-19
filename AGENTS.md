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

Types: **TypeScript** `.ts`/`.tsx`. Shared domain types: `src/types.ts`.

## Multi-Agent Workflow

**Roles:** Claude plans/reviews (conceptual risk: direction, UX, finance modeling, architecture). Codex executes/verifies (concrete risk: edits, refactors, tests, lint/build/checks). One writer at a time.

**Default split:** Codex handles scoped implementation directly. Use Claude planning when the task changes finance semantics, adds a tool/route, reshapes UX workflows, or crosses architecture boundaries. If the task is a narrow UI/copy/test fix, keep it with Codex unless Claude is already editing the same files.

**Scope discipline:** Match the user's requested surface. For narrow copy/UI/mechanical tasks, do not refactor adjacent code, update unrelated docs, or "fix" nearby stale tests unless needed to complete the request. Report unrelated failures separately.

**Worktree safety:** Start with `git status --short` before edits. Never revert or overwrite unrelated user changes. If touched files already contain user edits, work with them and keep the patch minimal.

### Task tiers

| Tier | Examples | Who plans | Who executes | Who reviews |
| --- | --- | --- | --- | --- |
| **trivial** | lint fix, rename, label change | nobody | Codex | human spot-check |
| **standard** | new feature, multi-file, test coverage | Claude (1 turn) | Codex | human reviews diff |
| **complex** | finance engine, new tool, architecture | Claude full plan + risks | Codex | Claude reviews diff |

For small 1-2 file edits where Claude already in context — Claude does it directly; no Codex handoff.

### Running Codex

Wrapper script picks model + effort from tier automatically:

```bash
scripts/codex-run.sh auto     "<task>"   # conservative keyword routing
scripts/codex-run.sh trivial  "<task>"   # gpt-5.4-mini, low
scripts/codex-run.sh standard "<task>"   # gpt-5.4,      medium
scripts/codex-run.sh complex  "<task>"   # gpt-5.5,      high
```

`auto` promotes finance/modeling, methodology, architecture, migration, and security work to `complex`; chooses `trivial` only for clearly mechanical tasks; and defaults uncertain work to `standard`. Prefer `trivial` for unambiguous small changes; promote when user-visible workflow, modeling semantics, architecture, or data migration risk is unclear. Preview routing without launching Codex using `scripts/codex-run.sh --dry-run auto "<task>"`.

Use `$route-codex-task` when classification needs judgment or file inspection. The repo-scoped skill recommends a tier and verification scope; the wrapper performs the actual model and effort selection.

Or raw:

```bash
codex exec -m <model> -c model_reasoning_effort=<level> -s workspace-write -C <repo> "<task>" < /dev/null
```

**Always review Codex diff.** Watch for: out-of-scope edits, logic changes in "mechanical" passes, glossed regressions.

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
| `/glide-path` | Lifetime Allocation (Glide Path) | MC coordinate ascent, CRRA utility, optimized vs constant allocation |
| `/acb` | ACB Calculator | Computes adjusted cost basis from Wealthsimple activity CSV export |
| `/allocator` | Where to invest: TFSA, RRSP or Non-Reg? | Invests one lump sum now across TFSA, RRSP, and non-registered accounts |

**New tool pattern:** `src/app/<tool>/` + `src/components/<tool>/`. Reuse `src/components/shared/` and `src/utils/`. Import alias: `@/` → `./src/`.

**Glide-path detail:** Web + Python default to `iid-mc` (forward-CMA iid Monte Carlo — the regime-robust mode); `forward-block` (JST pooled → forward-CMA rescaled → block bootstrap; bundle at `src/utils/glide-path/jstData.ts`) is the historical-sequencing scenario toggle. Python: `analysis/recommend_glide.py` also supports `historical-iid`/`historical-block`; `--dataset pooled|world`; `--exclude-countries/years`. Regenerate bundle: `python3 -m analysis.glide_path.generate_bundle`. Web fixes 5yr interval, browser caps, ≥$10k guaranteed income. Python keeps research controls.

## Architecture

**App entry (`src/app/`):** `layout.tsx` (root HTML, Mantine, Lato font) → `providers.tsx` (MantineProvider, teal theme, localStorage color scheme) → `page.tsx` (hub SimpleGrid). Tools use `next/dynamic({ ssr: false })` inside `"use client"` wrappers to avoid hydration mismatches with localStorage state.

**CSS:** Tailwind v4 + Mantine via `@layer(tailwind-base, mantine, tailwind-utilities)` — Tailwind preflight never overrides Mantine.

**UI (`src/components/`):**

- `shared/`: `Header`, `Footer`, `DisclaimerModal`, `FieldLabel`, `UserInputFormItem` (Mantine NumberInput + optional `$`/`%` toggle), `UserInputRangeItem` (base + ±2σ expand)
- `rent-vs-buy/Main.tsx`: state container; persists all state to localStorage via `storage.ts`
- `Result.tsx` → `NetWorthChart.tsx`: dispatches MC to Web Worker, renders chart + Summary Alert + data table + CSV

**Calc (`src/utils/`):** `math.ts`, `monteCarlo.ts` (`runMonteCarlo()` → P25/median/P75 + `renterWinPct`), `presets.ts`, `validation.ts`, `format.ts`, `storage.ts`.

**Web Worker:** `src/workers/monteCarloWorker.ts`. `NetWorthChart` debounces 150ms, tracks `requestId` to drop stale responses.

**React Compiler on.** No `useMemo`/`useCallback`/`React.memo` — compiler handles memoization.

**Testing:** Vitest + RTL (unit `*.test.ts`, component `*.test.tsx`, render via `src/test-utils.tsx`). Playwright e2e in `e2e/`. Both mock `matchMedia`/`ResizeObserver`.

## Tool-Specific Methodology

See `docs/` for per-tool deep dives:

- [docs/rent-vs-buy/methodology.md](docs/rent-vs-buy/methodology.md) — MC architecture, modeling assumptions, summary tier logic
- [docs/retirement/swr-methodology.md](docs/retirement/swr-methodology.md) — SWR engine, safe withdrawal assumptions
- [docs/glide-path/methodology.md](docs/glide-path/methodology.md) — CRRA utility, coordinate ascent, forward-block bootstrap
