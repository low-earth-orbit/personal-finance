# personal-finance

A small collection of free, sensible personal finance calculators for Canadians.

Latest deployed version: [Click Me](https://low-earth-orbit.github.io/personal-finance/)

## Tools

| Tool                                                                            | Route          | Status |
| ------------------------------------------------------------------------------- | -------------- | ------ |
| **Rent vs Buy** — compare renting vs owning a home                              | `/rent-vs-buy` | Live   |
| **When can I retire?** — quick retirement reality check                         | `/retirement`  | Live   |
| **Lifetime Allocation Optimizer** — find your optimal lifetime stock allocation | `/glide-path`  | Live   |
| **Lump-sum Allocation Optimizer** — split a lump sum across account types       | `/allocator`   | Live   |

The site is a single statically-exported Next.js app: a hub landing page at `/`
links to each tool, which lives at its own route.

The Lifetime Allocation Optimizer finds the optimal stock allocation across your lifetime. It
also compares that path with the best constant allocation and reports drawdown-only depletion
separately from full-path shortfall so the trade-offs between both choices remain visible.

## Disclaimer

An educational tool, **not financial advice**. Results are estimates from your assumptions, not predictions. Canada-specific and provided as-is — consult a professional before acting.

## Development

Built with Next.js (App Router), React 19 (with React Compiler), TypeScript, Mantine, Tailwind CSS and Recharts. Statically exported and deployed to GitHub Pages. Tested with Vitest + React Testing Library (unit/component) and Playwright (e2e/UI).

```bash
npm install
npm run dev        # dev server at http://localhost:3000
npm run build      # static export to ./out
npm run format     # Prettier
npm run lint       # ESLint
npm run typecheck  # tsc --noEmit
npm test           # Vitest unit + component tests
npm run test:e2e   # Playwright end-to-end tests
```

## Layout

```
src/
  app/
    page.tsx              # hub landing page (lists tools)
    rent-vs-buy/page.tsx  # rent-vs-buy tool route
    glide-path/page.tsx   # Lifetime Allocation Optimizer route
    allocator/page.tsx    # Lump-sum Allocation Optimizer route
  components/
    shared/               # reusable chrome + form primitives (Header, Footer, inputs)
    rent-vs-buy/          # rent-vs-buy-specific components
    glide-path/           # Lifetime Allocation Optimizer components
    allocator/            # Lump-sum Allocation Optimizer components
  utils/                  # math, formatting, Monte Carlo (shared) + tool-specific logic
  types.ts                # shared domain types
analysis/                 # Python research, validation, and recommender tools
docs/                     # calculator methodology notes, grouped by domain
```

Cross-folder imports use the `@/` path alias (`@/* → ./src/*`).

Research and methodology:

- [`analysis/README.md`](./analysis/README.md) — Python commands and folder ownership
- [`docs/README.md`](./docs/README.md) — methodology index
