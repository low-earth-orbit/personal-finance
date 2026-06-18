import { Anchor, Container, Stack, Text } from "@mantine/core";

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <Container component="footer" size="xl" pt="xl" pb="xl">
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          Not financial advice — general educational information, provided as-is.
        </Text>
        <Text size="sm" c="dimmed">
          © 2023–{currentYear} Leo Hong · Source on{" "}
          <Anchor
            href="https://github.com/low-earth-orbit/personal-finance"
            target="_blank"
            rel="noreferrer"
            c="dimmed"
          >
            GitHub
          </Anchor>
        </Text>
      </Stack>
    </Container>
  );
};

export default Footer;
