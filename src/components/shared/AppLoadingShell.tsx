import { Container, Grid, Paper, Skeleton, Stack } from "@mantine/core";

// Skeleton only: no visible text, so the placeholder can't be indexed as page copy.
function LoadingPanel() {
  return (
    <Paper withBorder radius="md" p="lg" mih={360}>
      <Stack gap="md">
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
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <LoadingPanel />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <LoadingPanel />
        </Grid.Col>
      </Grid>
    </Container>
  );
}
