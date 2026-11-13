"use client";

import {
  ActionIcon,
  Anchor,
  Box,
  Container,
  Group,
  Stack,
  Text,
  Title,
  useMantineColorScheme,
} from "@mantine/core";
import { IconSun, IconMoon, IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import StatusBadge, { type AppStatus } from "./StatusBadge";
import classes from "./Header.module.css";

type HeaderProps = {
  title: string;
  subtitle?: string;
  /** Show an "All tools" link back to the hub landing page. */
  showHomeLink?: boolean;
  /** Small mono line above the title, e.g. "01 / Rent vs Buy". */
  eyebrow?: string;
  /** Short facts about the model, shown at the right of the title block. */
  tags?: string[];
  status?: AppStatus;
  /** Landing-page layout: a large headline beside the subtitle. */
  hero?: boolean;
};

const Header = ({
  title,
  subtitle,
  showHomeLink = false,
  eyebrow,
  tags,
  status,
  hero = false,
}: HeaderProps) => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const toggle = () => setColorScheme(colorScheme === "dark" ? "light" : "dark");

  return (
    <Container component="header" size="xl">
      <Group justify="space-between" wrap="nowrap" gap="md" className={classes.topBar}>
        <Group gap="lg" wrap="wrap">
          {showHomeLink && (
            <Anchor component={Link} href="/" className={classes.homeLink}>
              <IconArrowLeft size={14} aria-hidden="true" />
              All tools
            </Anchor>
          )}
          <Text fw={700} fz="lg">
            Personal Finance
          </Text>
        </Group>
        <ActionIcon variant="default" size={44} onClick={toggle} aria-label="Toggle color scheme">
          <Box component="span" darkHidden>
            <IconMoon size={18} />
          </Box>
          <Box component="span" lightHidden>
            <IconSun size={18} />
          </Box>
        </ActionIcon>
      </Group>

      {hero ? (
        <div className={classes.hero}>
          <Title order={1} className={classes.heroTitle}>
            {title}
          </Title>
          {subtitle && <Text className={classes.heroSubtitle}>{subtitle}</Text>}
        </div>
      ) : (
        <Group justify="space-between" align="flex-end" gap="lg" className={classes.titleBlock}>
          <Stack gap="xs">
            {(eyebrow || status) && (
              <Group gap="sm">
                {eyebrow && <Text className={classes.eyebrow}>{eyebrow}</Text>}
                {status && <StatusBadge status={status} />}
              </Group>
            )}
            <Title order={1} className={classes.title}>
              {title}
            </Title>
            {subtitle && <Text className={classes.subtitle}>{subtitle}</Text>}
          </Stack>
          {tags && tags.length > 0 && (
            <Group gap="lg" className={classes.tags}>
              {tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </Group>
          )}
        </Group>
      )}
    </Container>
  );
};

export default Header;
