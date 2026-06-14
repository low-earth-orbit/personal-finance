"use client";

import Link from "next/link";
import {
  Card,
  Container,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import StatusBadge, { type AppStatus } from "@/components/shared/StatusBadge";

type Tool = {
  emoji: string;
  title: string;
  description: string;
  href?: string;
  status?: AppStatus;
};

const TOOLS: Tool[] = [
  {
    emoji: "🏠",
    title: "Rent vs Buy",
    description:
      "Compare the long-run net worth of renting versus owning a home.",
    href: "/rent-vs-buy",
    status: "updated",
  },
  {
    emoji: "🏖",
    title: "When can I retire?",
    description:
      "A quick reality check on the earliest age you could retire, based on your savings and target income.",
    href: "/retirement",
    status: "new",
  },
  {
    emoji: "🛤️",
    title: "Lifetime Allocation Optimizer",
    description:
      "Find your optimal stock allocation across your lifetime. FOR NERDS.",
    href: "/glide-path",
    status: "new",
  },
  {
    emoji: "🧾",
    title: "ACB Calculator",
    description:
      "Compute the adjusted cost basis of your non-registered holdings from a Wealthsimple activity export.",
    href: "/acb",
    status: "preview",
  },
  {
    emoji: "🧮",
    title: "Lump-sum Allocation Optimizer",
    description:
      "Optimize a lump sum across RRSP, TFSA, and taxable investments.",
    href: "/allocator",
    status: "new",
  },
];

function ToolCardBody({ tool }: { tool: Tool }) {
  const available = Boolean(tool.href);
  return (
    <Stack gap="xs">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Text fz={32}>{tool.emoji}</Text>
        <Group gap="xs" wrap="nowrap">
          {!available && <StatusBadge status="coming-soon" />}
          {tool.status && <StatusBadge status={tool.status} />}
        </Group>
      </Group>
      <Title order={2} fz="xl">
        {tool.title}
      </Title>
      <Text c="dimmed" size="sm">
        {tool.description}
      </Text>
    </Stack>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  if (tool.href) {
    return (
      <Card
        component={Link}
        href={tool.href}
        withBorder
        padding="lg"
        radius="md"
        style={{ height: "100%", cursor: "pointer" }}
      >
        <ToolCardBody tool={tool} />
      </Card>
    );
  }

  return (
    <Card
      withBorder
      padding="lg"
      radius="md"
      style={{ height: "100%", opacity: 0.65 }}
    >
      <ToolCardBody tool={tool} />
    </Card>
  );
}

export default function HomePage() {
  return (
    <>
      <Header title="Personal Finance" />
      <main>
        <Container size="xl" py="xl">
          <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
            {TOOLS.map((tool) => (
              <ToolCard key={tool.title} tool={tool} />
            ))}
          </SimpleGrid>
        </Container>
      </main>
      <Footer />
    </>
  );
}
