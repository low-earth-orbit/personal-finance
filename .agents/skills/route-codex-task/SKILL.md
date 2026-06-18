---
name: route-codex-task
description: Classify personal-finance repository work as trivial, standard, or complex so Codex uses an appropriate model, reasoning effort, and verification scope. Use when choosing how to launch Codex, estimating task risk, or deciding whether finance/modeling work needs stronger planning and review.
---

# Route Codex Task

Classify by risk and ambiguity, not by expected line count. Recommend one tier and briefly state the reason.

## Tiers

- `trivial`: Mechanical, localized, low-risk work such as formatting, lint fixes, typos, labels, and straightforward renames. Use `gpt-5.4-mini` with low effort.
- `standard`: Normal features, multi-file UI work, bug fixes, tests, and refactors with clear semantics. Use `gpt-5.4` with medium effort.
- `complex`: Finance-engine or methodology changes, Monte Carlo behavior, retirement or glide-path semantics, architecture, migrations, security, or ambiguous cross-cutting work. Use `gpt-5.5` with high effort.

When uncertain, choose `standard`. Promote to `complex` when a plausible mistake could silently change financial meaning or methodology.

## Workflow

1. Read the task and inspect named files when classification depends on them.
2. Return the tier, one-sentence rationale, and targeted verification scope.
3. For execution, use `scripts/codex-run.sh <tier> "<task>"`.
4. Use `scripts/codex-run.sh auto "<task>"` only when deterministic keyword routing is sufficient.
5. Keep one writer in the worktree. Use reviewers or subagents primarily for read-only exploration and review.

Do not launch another Codex process unless the user explicitly asks you to run or delegate the task.
