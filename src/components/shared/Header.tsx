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

type HeaderProps = {
  title: string;
  subtitle?: string;
  /** Show a "← All tools" link back to the hub landing page. */
  showHomeLink?: boolean;
};

const Header = ({ title, subtitle, showHomeLink = false }: HeaderProps) => {
  const { colorScheme, setColorScheme } = useMantineColorScheme();

  const toggle = () => setColorScheme(colorScheme === "dark" ? "light" : "dark");

  return (
    <Container component="header" size="xl" pt="xl" pb="xs">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <Stack gap={4}>
          {showHomeLink && (
            <Anchor component={Link} href="/" size="sm" c="dimmed">
              <Group gap={4} wrap="nowrap" component="span">
                <IconArrowLeft size={14} />
                All tools
              </Group>
            </Anchor>
          )}
          <Title order={1}>{title}</Title>
          {subtitle && <Text c="dimmed">{subtitle}</Text>}
        </Stack>
        <ActionIcon variant="default" size="lg" onClick={toggle} aria-label="Toggle color scheme">
          <Box component="span" darkHidden>
            <IconMoon size={18} />
          </Box>
          <Box component="span" lightHidden>
            <IconSun size={18} />
          </Box>
        </ActionIcon>
      </Group>
    </Container>
  );
};

export default Header;
