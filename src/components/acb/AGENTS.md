# ACB Tool

Upload Wealthsimple CSV, Questrade XLSX, or IBKR CSV → compute adjusted cost basis for non-registered holdings.

Holdings pool across all uploaded brokerages and non-registered accounts (CRA identical-property rule). State is in-memory only — not persisted.

## Files

- `Main.tsx` — state container; per-account registration overrides (`accountOverrides`); builds dated adjustments and alerts (deemed gains, oversold, per-symbol FX)
- `AcbApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `FileUpload.tsx` — CSV/XLSX drag-drop input
- `FilePreviewModal.tsx` — preview parsed rows before processing
- `HoldingsTable.tsx` — per-symbol ACB table (pre-adjusted holdings) with lot tracking + deemed-gain / missing-history badges
- `YearlyACBTable.tsx` — year-by-year ACB breakdown (includes dated adjustments)
- `AccountView.tsx` — account-level summary (raw, unadjusted, for reconciliation)
- `AccountTypeMarker.tsx` — registered/non-registered toggle for IBKR consolidated sub-accounts whose type can't be detected
- `SummaryBar.tsx` — top-level summary stats
- `T3Modal.tsx` — phantom/reinvested + ROC input (never the full Box 21)

## Engine

- `src/utils/acb/parser.ts` — dispatches Wealthsimple CSV / Questrade rows / IBKR CSV → ACB calculation logic. Each tx carries a `broker` tag. `resolveRegistered()` decides registration: broker-scoped user override (by `overrideKey`) wins, else regex on `accountType` (TFSA/RRSP/FHSA/RESP/RRIF/RDSP/LIRA-family/PRPP).
- Time-ordered ledger: `buildAllDatedAdjustments()` pairs transfer lots with opening ACBs and folds T3 nets to Dec 31; `computeAdjustedHoldings()` interleaves them with trades so later sells allocate over the adjusted pool. ROC below zero → deemed gain (`deemedGainByYear`), except on zero-share positions or while transfer opening costs are unentered (`incompleteSymbols` — pool clamps, no gain asserted). Sales or transfer-out legs beyond recorded shares → `oversold` flag with pool/shares clamped at zero.
- `computeHoldings()` (raw, per-account view) sorts internally, clamps oversells, and reports null (not $0) for uncosted transfer shares. `transferLotsForSymbol()` lists transfer-in legs only. `symbolsWithMixedCurrencies()` names symbols needing FX conversion.
- `src/utils/acb/xlsx.ts` — zero-dep XLSX reader using `DecompressionStream` and a small ZIP parser

## Known limitations (by design, surface in UI copy where relevant)

- T3 Box 21 mixes cash and phantom gains — only the reinvested portion goes in.
- Superficial-loss rule, stock splits/mergers, and FX conversion are not handled.
- Transfer-out legs to accounts outside the uploads leave the pool unchanged (pro-rata removal is not inferred).

## IBKR account types

A consolidated IBKR statement (`Custom Consolidated` / multiple `Accounts Included`) spans sub-accounts with different registration, and its header only describes the _primary_ account — so each trade's `accountType` is left empty and the user marks each sub-account via `AccountTypeMarker`. A single-account IBKR export auto-classifies from its `Customer Type`.
