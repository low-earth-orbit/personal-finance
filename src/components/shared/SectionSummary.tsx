import type { ReactNode } from "react";
import classes from "@/app/theme.module.css";

/**
 * One-line recap of a form section's values, shown in its `Accordion.Control` while the section is
 * collapsed (theme.module.css hides it when the item is open). Hidden from assistive tech: it
 * repeats the fields inside the panel and would otherwise lengthen every section button's name.
 */
export default function SectionSummary({ children }: { children: ReactNode }) {
  return (
    <span className={classes.sectionSummary} aria-hidden="true">
      {children}
    </span>
  );
}

/** Formats a possibly-empty field value for a section summary; empty fields read as "—". */
export function summaryValue(value: unknown, format: (n: number) => string = String): string {
  if (value === "" || value == null) return "—";
  const n = Number(value);
  return Number.isFinite(n) ? format(n) : "—";
}
