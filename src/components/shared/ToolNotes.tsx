import type { ReactNode } from "react";
import { Container, Title } from "@mantine/core";
import classes from "./Ledger.module.css";

/**
 * Ruled "notes" section under a tool: methodology, assumptions, acknowledgements.
 *
 * `columns` flows plain prose into two columns on wide screens. Leave it off when the children
 * already lay themselves out (a grid); flowing a grid into CSS columns splits it at an arbitrary
 * point and strands content in the second column.
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
      {columns ? <div style={{ columns: "2 22rem", columnGap: "3rem" }}>{children}</div> : children}
    </Container>
  );
}
