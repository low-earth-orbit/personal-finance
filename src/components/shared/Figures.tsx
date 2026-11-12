import type { ReactNode } from "react";
import classes from "./Ledger.module.css";

/** Mono uppercase label used above headlines, figures, and table-like groups. */
export function Eyebrow({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className={classes.eyebrow}>
      {children}
    </span>
  );
}

interface FigureProps {
  label: ReactNode;
  value: ReactNode;
  note?: ReactNode;
  /** Extra control beside the label, e.g. an info button. */
  info?: ReactNode;
  tone?: "accent" | "warn";
}

/** One cell of a `FigureStrip`: a labelled key number with an optional note. */
export function Figure({ label, value, note, info, tone }: FigureProps) {
  return (
    <div className={classes.figure}>
      <span className={classes.eyebrow}>
        {label}
        {info}
      </span>
      <span
        className={classes.figureValue}
        data-accent={tone === "accent" || undefined}
        data-warn={tone === "warn" || undefined}
      >
        {value}
      </span>
      {note && <span className={classes.figureNote}>{note}</span>}
    </div>
  );
}

/** A ruled row of key figures. */
export function FigureStrip({ children }: { children: ReactNode }) {
  return (
    <div className={classes.figures}>
      <div className={classes.figuresGrid}>{children}</div>
    </div>
  );
}
