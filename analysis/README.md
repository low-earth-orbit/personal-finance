# Analysis tools

Python research and validation code is grouped by calculator domain:

| Folder | Purpose |
| --- | --- |
| [`glide_path/`](./glide_path/) | Reusable glide-path recommender, CLI implementation, and iid research sweep |
| [`retirement/`](./retirement/) | Retirement-model validation and JST safe-withdrawal-rate analysis |
| [`shared/`](./shared/) | Shared JST loading, CPI deflation, aggregation, and bootstrap utilities |
| [`tests/`](./tests/) | Network-free unit tests for the Python analysis tools |

Downloaded JST data is cached in gitignored `analysis/.data/`. Generated figures are written to gitignored `analysis/artifacts/`.

## Ownership

- `glide_path/recommender.py` owns the reusable recommendation model and historical-market adapter.
- `glide_path/cli.py` owns flag parsing and terminal output; `recommend_glide.py` is only a stable launcher.
- `glide_path/research.py` is the larger iid-only research sweep used by the methodology note.
- `glide_path/research_history.py` is the historical-vs-iid sweep (factorial × world/pooled dataset, block-length and γ sweeps, CE-vs-constant curves, variance-ratio diagnostic); it reports the raw optimized glide (no simplicity bias).
- `shared/jst_history.py` is the only place that should load, deflate, aggregate, or bootstrap JST return history.
- `retirement/jst_swr_bootstrap.py` validates retirement SWR behavior against JST history.

## Commands

```bash
# Stable glide-path CLI
python3 analysis/recommend_glide.py --help

# Interactive glide-path recommender
python3 -m analysis.glide_path.recommender

# Glide-path research sweep (iid-only)
python3 -m analysis.glide_path.research

# Historical-vs-iid glide-path sweep (add --quick for a fast look)
python3 -m analysis.glide_path.research_history

# Retirement JST/SWR validation
python3 -m analysis.retirement.jst_swr_bootstrap

# Python analysis tests
python3 -m unittest discover -s analysis/tests -p 'test*.py'
```
