"use client";

import { useState } from "react";
import { Container, Grid } from "@mantine/core";
import ColumnHeader from "@/components/shared/ColumnHeader";
import JumpToResult from "@/components/shared/JumpToResult";
import layout from "@/components/shared/TwoColumn.module.css";
import InputForm from "./InputForm";
import Result from "./Result";
import { computeExpectedReturn } from "@/utils/expected-return/engine";
import { formatRate } from "@/utils/expected-return/format";
import { DEFAULTS_AS_OF } from "@/utils/expected-return/presets";
import { clearInput, cloneDefaults, loadInput, saveInput } from "@/utils/expected-return/storage";
import { isValid, validateExpectedReturnInput } from "@/utils/expected-return/validation";
import type {
  ExpectedReturnInput,
  GlobalKey,
  RegionId,
  RegionKey,
} from "@/utils/expected-return/types";
import type { FieldValue } from "@/types";

const RESULT_ID = "expected-return-result";

/** Form values stay as typed ("" while clearing a field); everything else becomes a number. */
const coerce = (value: FieldValue) => (value === "" || value == null ? value : Number(value));

export default function Main() {
  const [input, setInput] = useState<ExpectedReturnInput>(() => loadInput());
  // The result tracks the last valid inputs, so an invalid edit pauses it rather than blanking it.
  const [lastValid, setLastValid] = useState<ExpectedReturnInput | null>(() =>
    isValid(input) ? input : null,
  );

  const errors = validateExpectedReturnInput(input);
  const valid = Object.keys(errors).length === 0;
  if (valid && lastValid !== input) setLastValid(input);

  // The engine is plain arithmetic, so it runs on every render without a worker or debounce.
  const result = lastValid ? computeExpectedReturn(lastValid) : null;

  function update(next: ExpectedReturnInput) {
    setInput(next);
    saveInput(next);
  }

  function handleRegionChange(region: RegionId, key: RegionKey, value: FieldValue) {
    update({
      ...input,
      regions: { ...input.regions, [region]: { ...input.regions[region], [key]: coerce(value) } },
    });
  }

  function handleChange(key: GlobalKey, value: FieldValue) {
    update({ ...input, [key]: coerce(value) });
  }

  function handleReset() {
    clearInput();
    setInput(cloneDefaults());
  }

  return (
    <Container size="xl" pb="xl">
      <Grid gap="xl">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <ColumnHeader title="Inputs" note={`Defaults as of ${DEFAULTS_AS_OF}`} />
          <InputForm
            input={input}
            errors={errors}
            onRegionChange={handleRegionChange}
            onChange={handleChange}
            onReset={handleReset}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }} className={layout.result} id={RESULT_ID}>
          <ColumnHeader title="Result" />
          <Result result={result} input={lastValid ?? input} paused={!valid && result != null} />
        </Grid.Col>
      </Grid>
      {result && (
        <JumpToResult targetId={RESULT_ID}>
          {`${formatRate(result.realGeometric)} real a year after costs`}
        </JumpToResult>
      )}
    </Container>
  );
}
