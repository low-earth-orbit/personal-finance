import type { ReactNode } from "react";
import { Container, Title } from "@mantine/core";
import classes from "./Ledger.module.css";

/**
 * Ruled "notes" section under a tool: methodology, assumptions, acknowledgements.
 *
 * `columns` flows plain prose into two columns on wide screens. Paragraphs never split across the
 * columns (reading on from the bottom of one column to the top of the next mid-sentence is hard),
 * so give it two or more paragraphs of similar length. Leave it off when the children already lay
 * themselves out (a grid); flowing a grid into CSS columns strands content in the second column.
 */
export default function ToolNotes({
  title,
  children,
  columns = false,
}: {
  title: string;
  children: ReactNode;
  columns?: boolean;
}) {
  return (
    <Container size="xl" className={classes.notes} component="section">
      <Title order={2} className={classes.notesHeading}>
        {title}
      </Title>
      {columns ? <div className={classes.notesColumns}>{children}</div> : children}
    </Container>
  );
}
