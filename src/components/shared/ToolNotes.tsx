import type { ReactNode } from "react";
import { Container, Title } from "@mantine/core";
import classes from "./Ledger.module.css";

/** Ruled "notes" section under a tool: methodology, assumptions, acknowledgements. */
export default function ToolNotes({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Container size="xl" className={classes.notes} component="section">
      <Title order={2} className={classes.notesHeading}>
        {title}
      </Title>
      {children}
    </Container>
  );
}
