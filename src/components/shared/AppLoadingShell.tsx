import { Container, Grid, Paper, Skeleton, Stack, Text } from "@mantine/core";

function LoadingPanel({ showLabel = false }: { showLabel?: boolean }) {
  return (
    <Paper withBorder radius="md" p="lg" mih={360}>
      <Stack gap="md">
        {showLabel && (
          <Text size="sm" c="dimmed">
            Loading calculator...
          </Text>
        )}
        <Skeleton height={32} width="55%" radius="sm" animate={false} />
        <Skeleton height={44} radius="sm" animate={false} />
        <Skeleton height={44} radius="sm" animate={false} />
        <Skeleton height={44} width="80%" radius="sm" animate={false} />
        <Skeleton height={88} radius="sm" animate={false} />
      </Stack>
    </Paper>
  );
}

export default function AppLoadingShell() {
  return (
    <Container
      size="xl"
      pb="xl"
      role="status"
      aria-label="Loading calculator"
      aria-busy="true"
      style={{ minHeight: "60vh" }}
    >
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <LoadingPanel showLabel />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 6 }}>
          <LoadingPanel />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
