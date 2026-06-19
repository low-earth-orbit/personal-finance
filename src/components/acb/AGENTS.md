# ACB Tool

Upload Wealthsimple CSV, Questrade XLSX, or IBKR CSV → compute adjusted cost basis for non-registered holdings.

Results are scoped to one brokerage at a time (auto-detected from each file; a `SegmentedControl` switches between brokers when more than one is uploaded). State is in-memory only — not persisted.

## Files

- `Main.tsx` — state container; broker scoping (`activeBroker`/`effectiveBroker`), per-account registration overrides (`accountOverrides`)
- `AcbApp.tsx` — `"use client"` wrapper, lazy-loads Main (`ssr:false`)
- `FileUpload.tsx` — CSV/XLSX drag-drop input
- `FilePreviewModal.tsx` — preview parsed rows before processing
- `HoldingsTable.tsx` — per-symbol ACB table with lot tracking
- `YearlyACBTable.tsx` — year-by-year ACB breakdown
- `AccountView.tsx` — account-level summary
- `AccountTypeMarker.tsx` — registered/non-registered toggle for IBKR consolidated sub-accounts whose type can't be detected
- `SummaryBar.tsx` — top-level summary stats
- `T3Modal.tsx` — T3 slip input for return-of-capital adjustments

## Engine

- `src/utils/acb/parser.ts` — dispatches Wealthsimple CSV / Questrade rows / IBKR CSV → ACB calculation logic. Each tx carries a `broker` tag. `resolveRegistered()` decides registration: user override (by `accountId`) wins, else regex on `accountType`.
- `src/utils/acb/xlsx.ts` — zero-dep XLSX reader using `DecompressionStream` and a small ZIP parser

## IBKR account types

A consolidated IBKR statement (`Custom Consolidated` / multiple `Accounts Included`) spans sub-accounts with different registration, and its header only describes the _primary_ account — so each trade's `accountType` is left empty and the user marks each sub-account via `AccountTypeMarker`. A single-account IBKR export auto-classifies from its `Customer Type`.
