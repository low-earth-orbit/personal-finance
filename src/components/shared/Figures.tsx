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
  /** "sm" fits long values (full dollar amounts) when four or more figures share a row. */
  size?: "md" | "sm";
}

/** One cell of a `FigureStrip`: a labelled key number with an optional note. */
export function Figure({ label, value, note, info, tone, size = "md" }: FigureProps) {
  return (
    <div className={classes.figure}>
      <span className={`${classes.eyebrow} ${classes.figureLabel}`}>
        <span>{label}</span>
        {info}
      </span>
      <span
        className={classes.figureValue}
        data-accent={tone === "accent" || undefined}
        data-warn={tone === "warn" || undefined}
        data-size={size}
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

interface NoticeProps {
  /** Leading icon; inherits the tone colour. */
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  tone?: "ink" | "accent" | "warn";
}

/** An in-flow notice: a toned rule, a titled line, and optional supporting text. */
export function Notice({ icon, title, children, tone = "ink" }: NoticeProps) {
  return (
    <div className={classes.notice} data-tone={tone}>
      <span className={classes.noticeIcon} aria-hidden>
        {icon}
      </span>
      <div className={classes.noticeTitle}>{title}</div>
      {children && <div className={classes.noticeBody}>{children}</div>}
    </div>
  );
}
