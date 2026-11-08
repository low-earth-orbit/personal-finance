# analysis/glide_path

Python engine and research scripts for the Lifetime Allocation Optimizer (`/glide-path`). Method and results: [`docs/glide-path/methodology.md`](../../docs/glide-path/methodology.md). The web app's TypeScript engine (`src/utils/glide-path/engine.ts`) implements the same model.

## Modules

| Module | Role |
| --- | --- |
| `markets.py` | Capital-market curve (nominal geometric → real arithmetic), `IidMarket`, `HistoricalMarket`, `build_market` |
| `simulate.py` | `Lifecycle` inputs (incl. guaranteed-income delay and bequest weight), cash-flow rules, CRRA utility, `expected_utility`, `path_outcomes`, `drawdown_outcomes`, `tie_middle_argmax` |
| `recommender.py` | Public API: `recommend_glide_path`, `evaluate_path`; `optimize_blocks` (coordinate ascent); over-funded flag |
| `report.py` | `format_summary`, `plot_glide_path`, `run_demo` |
| `interactive.py` | Prompt flow (`-i`): builds a CLI argument list, runs it, prints the reproduction command |
| `cli.py` | Flag CLI behind `analysis/recommend_glide.py`, incl. `--compare-modes` |
| `research.py` | iid research sweep (methodology §2) |
| `research_history.py` | History, bond-persistence decomposition, bond-menu, short-TIPS stress, sleeve-blend, regime-mixture, CPI-basis and GIC-ladder, regret and funding sections (methodology §3–§4) |
| `doc_figures.py` | Methodology Figures 1–3 as light/dark SVGs in `docs/glide-path/img/` (needs matplotlib) |
| `generate_bundle.py` | Writes `src/utils/glide-path/jstData.ts` (forward-rescaled JST history) |

Shared helpers live in `analysis/shared/` (`jst_history.py` for JST loading, rescaling, block sampling and variance ratios; `returns.py` for geometric ↔ arithmetic conversion).

Dependency direction: `markets` / `simulate` → `recommender` → `report` / `interactive` / `cli` / `research*`.

## Run

```bash
python3 analysis/recommend_glide.py --help               # one recommendation from flags
python3 analysis/recommend_glide.py -i                   # interactive prompts, then the equivalent command
python3 analysis/recommend_glide.py --compare-modes      # iid-mc, forward-block, historical-block (full + 1990-2020) side by side
python3 analysis/recommend_glide.py --start-age 35 --accum 25 --retire 35 \
    --guaranteed-start-age 65 --bequest-weight 0.25      # CPP/OAS bridge from 60 to 65, some bequest
python3 -m analysis.glide_path.interactive --demo        # lever sweep (writes figures)
python3 -m analysis.glide_path.research                  # §2 sweep (~5 min)
python3 -m analysis.glide_path.research_history --quick  # all history sections, low fidelity
python3 -m analysis.glide_path.research_history --sections tips-stress  # one section
python3 -m analysis.glide_path.doc_figures                # regenerate methodology SVGs
python3 -m unittest discover -s analysis -p 'test_*.py'
```

Research experiments that need a custom return series or sampler pass `history=` / `sampler=` to `recommend_glide_path` (see `research_history.split_sampler`) rather than patching internals.
