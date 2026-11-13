"use client";

import Link from "next/link";
import { Container, Group, Text } from "@mantine/core";
import { IconArrowRight } from "@tabler/icons-react";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import StatusBadge, { type AppStatus } from "@/components/shared/StatusBadge";
import classes from "./page.module.css";

type Tool = {
  title: string;
  description: string;
  href?: string;
  status?: AppStatus;
};

const TOOLS: Tool[] = [
  {
    title: "Rent vs Buy",
    description: "Compare the long-run net worth of renting versus owning a home.",
    href: "/rent-vs-buy",
  },
  {
    title: "When can I retire?",
    description:
      "A quick reality check on the earliest age you could retire, based on your savings and target income.",
    href: "/retirement",
  },
  {
    title: "Lifetime Allocation",
    description:
      "A research model of how stock allocation could change over a lifetime. For nerds.",
    href: "/glide-path",
    status: "new",
  },
  {
    title: "ACB Calculator",
    description:
      "Compute the adjusted cost basis of your non-registered holdings from a Wealthsimple activity export.",
    href: "/acb",
    status: "preview",
  },
  {
    title: "Where to invest: TFSA, RRSP or Non-Reg?",
    description: "Explore a tax-aware split across TFSA, RRSP, and non-registered accounts.",
    href: "/allocator",
    status: "preview",
  },
];

function ToolRow({ tool, index }: { tool: Tool; index: number }) {
  const body = (
    <>
      <span className={classes.number}>{String(index + 1).padStart(2, "0")}</span>
      <span className={classes.text}>
        <span className={classes.title}>{tool.title}</span>
        <span className={classes.description}>{tool.description}</span>
      </span>
      <Group gap="sm" wrap="nowrap" className={classes.meta}>
        {!tool.href && <StatusBadge status="coming-soon" />}
        {tool.status && <StatusBadge status={tool.status} />}
        {tool.href && <IconArrowRight size={20} aria-hidden="true" className={classes.arrow} />}
      </Group>
    </>
  );

  return (
    <li>
      {tool.href ? (
        <Link href={tool.href} className={classes.row}>
          {body}
        </Link>
      ) : (
        <div className={classes.row} data-disabled>
          {body}
        </div>
      )}
    </li>
  );
}

export default function HomePage() {
  return (
    <>
      <Header
        hero
        title="The numbers behind the big decisions."
        subtitle="Free, simple personal finance calculators for Canadians — compare renting vs buying, plan for retirement, and more."
      />
      <main>
        <Container size="xl">
          <section aria-labelledby="tools-heading">
            <div className={classes.listHeader}>
              <Text span className={classes.listHeaderCell}>
                No.
              </Text>
              <Text span id="tools-heading" className={classes.listHeaderCell}>
                Tools
              </Text>
              <Text span className={classes.listHeaderCell}>
                Status
              </Text>
            </div>
            <ol className={classes.list}>
              {TOOLS.map((tool, index) => (
                <ToolRow key={tool.title} tool={tool} index={index} />
              ))}
            </ol>
          </section>
        </Container>
      </main>
      <Footer />
    </>
  );
}
