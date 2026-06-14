import { useState } from "react";
import {
  Accordion,
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { IconPlus, IconRotate, IconX } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import UserInputFormItem from "@/components/shared/UserInputFormItem";
import UserInputRangeItem from "@/components/shared/UserInputRangeItem";
import { FIELD_CONSTRAINTS } from "@/utils/validation";
import type {
  FieldErrors,
  FieldValue,
  Preset,
  SigmaKey,
  UserInput,
  UserInputKey,
} from "@/types";
import { formatCAD, formatPercentage } from "@/utils/format";
import {
  calculateMonthlyMortgagePayment,
  calculateMortgagePrincipal,
} from "@/utils/math";

interface UserInputFormProps {
  userInput: UserInput;
  handleChange: (field: UserInputKey, value: FieldValue) => void;
  handlePreset: (preset: Preset) => void;
  handleReset: () => void;
  expandedFields: UserInputKey[];
  toggleFieldExpanded: (baseField: UserInputKey, sigmaField?: SigmaKey) => void;
  errors: FieldErrors;
  activePreset: Preset | null;
  visibleBuiltins: Preset[];
  customPresets: Preset[];
  onSavePreset: (name: string) => void;
  onDeletePreset: (preset: Preset) => void;
}

interface PerturbedOptions {
  label: string;
  helperText?: string;
  disabled?: boolean;
}

export default function UserInputForm({
  userInput,
  handleChange,
  handlePreset,
  handleReset,
  expandedFields,
  toggleFieldExpanded,
  errors,
  activePreset,
  visibleBuiltins,
  customPresets,
  onSavePreset,
  onDeletePreset,
}: UserInputFormProps) {
  const [saveOpen, { open: openSave, close: closeSave }] = useDisclosure(false);
  const [resetOpen, { open: openReset, close: closeReset }] =
    useDisclosure(false);
  const [presetName, setPresetName] = useState("");

  const confirmReset = () => {
    handleReset();
    closeReset();
  };

  const variantFor = (preset: Preset) =>
    activePreset?.id === preset.id ? "filled" : "light";

  const submitSave = () => {
    const trimmed = presetName.trim();
    if (!trimmed) return;
    onSavePreset(trimmed);
    setPresetName("");
    closeSave();
  };

  const bind = (id: UserInputKey) => (value: FieldValue) =>
    handleChange(id, value);
  const c = (id: UserInputKey) => FIELD_CONSTRAINTS[id];

  // Perturbed variables: base value always, plus an inline ±2σ input + range
  // readout when the field's "± add uncertainty" affordance is expanded.
  const perturbed = (
    baseField: UserInputKey,
    sigmaField: SigmaKey,
    { label, helperText, disabled }: PerturbedOptions,
  ) => (
    <UserInputRangeItem
      baseField={baseField}
      sigmaField={sigmaField}
      label={label}
      helperText={helperText}
      baseValue={userInput[baseField]}
      sigma={userInput[sigmaField]}
      baseConstraint={c(baseField)}
      sigmaConstraint={c(sigmaField)}
      onBaseChange={bind(baseField)}
      onSigmaChange={bind(sigmaField)}
      baseError={errors[baseField]}
      expanded={expandedFields.includes(baseField)}
      onToggleExpand={() => toggleFieldExpanded(baseField, sigmaField)}
      disabled={disabled}
    />
  );

  const rentalYield = formatPercentage(
    (userInput.monthlyRent * 12) / userInput.initialHomePrice,
  );

  // While a field is mid-edit it can transiently be "" or 0. Show a placeholder
  // rather than a misleading "$0/mo" (empty amortization) or "NaN" (empty price).
  // calculateMonthlyMortgagePayment itself soft-fails, so this is display-only.
  const monthlyMortgage =
    userInput.amortization > 0 && userInput.initialHomePrice > 0
      ? formatCAD(
          calculateMonthlyMortgagePayment(
            calculateMortgagePrincipal(
              userInput.initialHomePrice,
              userInput.downPaymentPercentage,
            ),
            userInput.annualMortgageInterestRate,
            userInput.amortization,
          ),
        )
      : "—";

  return (
    <Stack>
      <Stack>
        <Group gap="xs" role="group" aria-label="Scenario presets">
          {[...visibleBuiltins, ...customPresets].map((preset) => (
            <Group key={preset.id} gap={0} wrap="nowrap">
              <Button
                variant={variantFor(preset)}
                size="xs"
                radius="lg"
                aria-pressed={activePreset?.id === preset.id}
                onClick={() => handlePreset(preset)}
              >
                {preset.label}
              </Button>
              <ActionIcon
                variant="transparent"
                color="gray"
                size="xs"
                onClick={() => onDeletePreset(preset)}
                aria-label={`Delete ${preset.label}`}
              >
                <IconX size={12} />
              </ActionIcon>
            </Group>
          ))}
          <Button
            variant="subtle"
            size="xs"
            color="gray"
            leftSection={<IconPlus size={12} />}
            onClick={openSave}
          >
            Save as preset
          </Button>
        </Group>
      </Stack>

      <Modal
        opened={resetOpen}
        onClose={closeReset}
        title="Reset everything?"
        size="sm"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This will remove all custom presets, restore any deleted built-in
            presets, and discard your edits.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={closeReset}>
              Cancel
            </Button>
            <Button color="red" onClick={confirmReset}>
              Reset all
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Modal
        opened={saveOpen}
        onClose={closeSave}
        title="Save as preset"
        size="sm"
        centered
      >
        <Stack gap="md">
          <TextInput
            label="Name"
            placeholder="e.g. My place"
            value={presetName}
            onChange={(e) => setPresetName(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submitSave();
              }
            }}
            data-autofocus
          />
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={closeSave}>
              Cancel
            </Button>
            <Button onClick={submitSave} disabled={!presetName.trim()}>
              Save
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Accordion
        multiple
        defaultValue={["rent", "property"]}
        variant="contained"
      >
        <Accordion.Item value="rent">
          <Accordion.Control>Rent</Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <UserInputFormItem
                id="monthlyRent"
                label="Monthly rent"
                additionalText={`Annual rent / purchase price: ${rentalYield}`}
                value={userInput.monthlyRent}
                onChange={bind("monthlyRent")}
                error={errors.monthlyRent}
                prefix="$"
                thousandSeparator
                {...c("monthlyRent")}
              />
              {perturbed("rentIncreaseRate", "rentIncreaseSigma", {
                label: "Rent growth",
                helperText:
                  "Expected annual growth in rent payments. Typically at or slightly above inflation (2–2.5%).",
              })}
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="property">
          <Accordion.Control>Property</Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <UserInputFormItem
                id="initialHomePrice"
                label="Purchase price"
                value={userInput.initialHomePrice}
                onChange={bind("initialHomePrice")}
                error={errors.initialHomePrice}
                prefix="$"
                thousandSeparator
                {...c("initialHomePrice")}
              />

              {perturbed("homePriceGrowthRate", "homePriceGrowthSigma", {
                label: "Home price growth",
                helperText:
                  "Expected annual growth in the home's market value. Long-run world historical average is 0–2% above inflation (2–4% nominal).",
              })}

              <UserInputFormItem
                id="propertyTaxRate"
                label="Property tax"
                labelHelperText="Current annual property tax. Switch between dollar amount and rate (% of today's home value). Typical range: 0.5–1.5% depending on municipality."
                value={userInput.propertyTaxRate}
                onChange={bind("propertyTaxRate")}
                error={errors.propertyTaxRate}
                {...c("propertyTaxRate")}
                percentToggle={{
                  base: userInput.initialHomePrice,
                  defaultUnit: "$",
                  unitAriaLabel: "Property Tax input unit",
                }}
              />

              <UserInputFormItem
                id="maintPct"
                label="Maintenance & insurance"
                labelHelperText="Annual repairs and insurance. Toggle % of today's home price or $/yr. Excludes condo fees. Typically 0.5–1% for condos and 1–2% for detached homes."
                value={userInput.maintPct}
                onChange={bind("maintPct")}
                error={errors.maintPct}
                {...c("maintPct")}
                percentToggle={{
                  base: userInput.initialHomePrice,
                  defaultUnit: "%",
                  unitAriaLabel: "Maintenance and Insurance input unit",
                }}
              />

              <UserInputFormItem
                id="condoFeesPerMonth"
                label="Condo fees"
                labelHelperText="Monthly condo or strata fees in today's dollars. Set to $0 for detached homes."
                value={userInput.condoFeesPerMonth}
                onChange={bind("condoFeesPerMonth")}
                error={errors.condoFeesPerMonth}
                prefix="$"
                suffix=" /mo"
                thousandSeparator
                {...c("condoFeesPerMonth")}
              />

              {perturbed("ownerCostGrowthRate", "ownerCostGrowthSigma", {
                label: "Owner cost growth",
                helperText:
                  "Expected annual growth in maintenance, property tax, insurance, and condo fees. Slightly above inflation or follows home price.",
              })}

              <UserInputFormItem
                id="holdingPeriod"
                label="Holding period"
                labelHelperText="How long until you sell. The simulation compares net worth at this year. Canadian homeowners sell after ~10–13 years on average, even with a 25-year mortgage."
                value={userInput.holdingPeriod}
                onChange={bind("holdingPeriod")}
                error={errors.holdingPeriod}
                suffix=" Years"
                {...c("holdingPeriod")}
              />
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="mortgage">
          <Accordion.Control>Mortgage</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                {`Down payment amount ${formatCAD((userInput.downPaymentPercentage / 100) * userInput.initialHomePrice)}. Est. mortgage payment: ${monthlyMortgage} /mo.`}
              </Text>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                <UserInputFormItem
                  id="downPaymentPercentage"
                  label="Down payment"
                  labelHelperText="Minimum is 20%. This calculator only models conventional mortgages."
                  value={userInput.downPaymentPercentage}
                  onChange={bind("downPaymentPercentage")}
                  error={errors.downPaymentPercentage}
                  suffix="%"
                  {...c("downPaymentPercentage")}
                />
                <UserInputFormItem
                  id="amortization"
                  label="Amortization period"
                  labelHelperText="Total length of the mortgage. This calculator caps amortization at 25 years."
                  value={userInput.amortization}
                  onChange={bind("amortization")}
                  error={errors.amortization}
                  suffix=" Years"
                  disabled={userInput.downPaymentPercentage === 100}
                  {...c("amortization")}
                />
                {perturbed("annualMortgageInterestRate", "mortgageRateSigma", {
                  label: "Mortgage rate",
                  helperText:
                    "Annual mortgage interest rate. The default reflects the Bank of Canada's neutral policy rate (2.75%) plus a typical lender spread (1.75%).",
                  disabled: userInput.downPaymentPercentage === 100,
                })}
              </SimpleGrid>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="investment">
          <Accordion.Control>Investment</Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Alert variant="default" color="gray">
                Total Return is split into two parts: Annual Yield (taxed each
                year) and deferred capital gains (taxed at sale). Use Annual
                Yield Tax to set a blended rate that reflects your mix of
                interest, dividends and realized capital gains.
              </Alert>
              <SimpleGrid cols={{ base: 1, sm: 2 }}>
                {perturbed("investmentReturnRate", "investmentReturnSigma", {
                  label: "Total return",
                  helperText:
                    "Expected pre-tax annualized return, including dividends and capital gains. The default is based on long-term capital market assumptions for a diversified growth portfolio (XGRO).",
                })}
                {perturbed("dividendYield", "dividendYieldSigma", {
                  label: "Annual yield",
                  helperText:
                    "Portion of the return distributed each year, taxed annually. The remainder accrues as deferred capital gains, taxed only when the portfolio is sold. Capped at the portfolio return.",
                })}
                <UserInputFormItem
                  id="capitalGainTaxRate"
                  label="Capital gain tax"
                  labelHelperText="Tax rate on capital gains when the portfolio is sold. In Canada, 50% of gains are included in taxable income — multiply your marginal rate by 50% to get this number."
                  value={userInput.capitalGainTaxRate}
                  onChange={bind("capitalGainTaxRate")}
                  error={errors.capitalGainTaxRate}
                  suffix="%"
                  {...c("capitalGainTaxRate")}
                />
                <UserInputFormItem
                  id="dividendTaxRate"
                  label="Annual yield tax"
                  labelHelperText="Blended effective tax rate on your annual yield. Canadian eligible dividends are taxed at a lower rate than interest or foreign dividends — set this as a weighted average based on your expected yield mix."
                  value={userInput.dividendTaxRate}
                  onChange={bind("dividendTaxRate")}
                  error={errors.dividendTaxRate}
                  suffix="%"
                  {...c("dividendTaxRate")}
                />
              </SimpleGrid>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="costs">
          <Accordion.Control>Transaction costs</Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              <UserInputFormItem
                id="buyerClosingCostsPct"
                label="Buyer closing costs"
                labelHelperText="Closing costs for home buyers as a percentage of home price, including land transfer tax, legal fees, and inspections. Typically 1–4% nationally; higher in provinces with larger land transfer taxes."
                value={userInput.buyerClosingCostsPct}
                onChange={bind("buyerClosingCostsPct")}
                error={errors.buyerClosingCostsPct}
                suffix="%"
                {...c("buyerClosingCostsPct")}
              />
              <UserInputFormItem
                id="sellerClosingCostsPct"
                label="Seller closing costs"
                labelHelperText="Closing costs for home sellers as a percentage of home price, primarily realtor commission and legal fees. Typically 4–7% nationally."
                value={userInput.sellerClosingCostsPct}
                onChange={bind("sellerClosingCostsPct")}
                error={errors.sellerClosingCostsPct}
                suffix="%"
                {...c("sellerClosingCostsPct")}
              />
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Button
        variant="transparent"
        size="xs"
        color="red"
        onClick={openReset}
        leftSection={<IconRotate size={14} />}
        style={{ alignSelf: "flex-start" }}
      >
        Reset all
      </Button>
    </Stack>
  );
}
