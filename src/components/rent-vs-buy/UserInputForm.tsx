import type { ReactNode } from "react";
import { Accordion, Alert, Button, Group, Modal, Stack, Text } from "@mantine/core";
import { IconRotate } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import SectionSummary, { summaryValue } from "@/components/shared/SectionSummary";
import UserInputFormItem from "@/components/shared/UserInputFormItem";
import UserInputRangeItem from "@/components/shared/UserInputRangeItem";
import { FIELD_CONSTRAINTS } from "@/utils/validation";
import type { FieldErrors, FieldValue, SigmaKey, UserInput, UserInputKey } from "@/types";
import { formatCAD, formatPercentage } from "@/utils/format";
import {
  calculateMonthlyMortgagePayment,
  calculateMortgagePrincipal,
  calculateOpeningMortgageBalance,
  mortgageInsurancePremiumRate,
} from "@/utils/math";

interface UserInputFormProps {
  userInput: UserInput;
  handleChange: (field: UserInputKey, value: FieldValue) => void;
  handleReset: () => void;
  expandedFields: UserInputKey[];
  toggleFieldExpanded: (baseField: UserInputKey, sigmaField?: SigmaKey) => void;
  errors: FieldErrors;
  /** Scenario preset controls, rendered above the form. */
  presetBar?: ReactNode;
}

interface PerturbedOptions {
  label: string;
  helperText?: string;
  additionalText?: string;
  disabled?: boolean;
}

export default function UserInputForm({
  userInput,
  handleChange,
  handleReset,
  expandedFields,
  toggleFieldExpanded,
  errors,
  presetBar,
}: UserInputFormProps) {
  const [resetOpen, { open: openReset, close: closeReset }] = useDisclosure(false);

  const confirmReset = () => {
    handleReset();
    closeReset();
  };

  const bind = (id: UserInputKey) => (value: FieldValue) => handleChange(id, value);
  const c = (id: UserInputKey) => FIELD_CONSTRAINTS[id];

  // Perturbed variables: base value always, plus an inline ±2σ input + range
  // readout when the field's "± add uncertainty" affordance is expanded.
  const perturbed = (
    baseField: UserInputKey,
    sigmaField: SigmaKey,
    { label, helperText, additionalText, disabled }: PerturbedOptions,
  ) => (
    <UserInputRangeItem
      baseField={baseField}
      sigmaField={sigmaField}
      label={label}
      helperText={helperText}
      additionalText={additionalText}
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

  const rentalYield = formatPercentage((userInput.monthlyRent * 12) / userInput.initialHomePrice);

  // While a field is mid-edit it can transiently be "" or 0. Show a placeholder
  // rather than a misleading "$0/mo" (empty amortization) or "NaN" (empty price).
  // calculateMonthlyMortgagePayment itself soft-fails, so this is display-only.
  const monthlyMortgage =
    userInput.amortization > 0 && userInput.initialHomePrice > 0
      ? formatCAD(
          calculateMonthlyMortgagePayment(
            calculateOpeningMortgageBalance(
              userInput.initialHomePrice,
              userInput.downPaymentPercentage,
              userInput.amortization,
            ),
            userInput.annualMortgageInterestRate,
            userInput.amortization,
          ),
        )
      : "—";
  const premiumRate = mortgageInsurancePremiumRate(
    userInput.downPaymentPercentage,
    userInput.amortization,
  );
  const premiumText =
    premiumRate > 0 &&
    userInput.initialHomePrice > 0 &&
    Number.isFinite(userInput.downPaymentPercentage) &&
    String(userInput.downPaymentPercentage) !== ""
      ? ` Mortgage insurance premium ${formatCAD(
          calculateMortgagePrincipal(userInput.initialHomePrice, userInput.downPaymentPercentage) *
            premiumRate,
        )} (${(premiumRate * 100).toFixed(2)}% of the loan), added to the mortgage.`
      : "";

  return (
    <Stack>
      {presetBar}

      <Modal opened={resetOpen} onClose={closeReset} title="Reset everything?" size="sm" centered>
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            This will delete your saved presets, show any hidden scenarios, and restore the default
            inputs.
          </Text>
          <Group justify="flex-end" gap="xs">
            <Button variant="subtle" color="gray" onClick={closeReset}>
              Cancel
            </Button>
            <Button color="rust" onClick={confirmReset}>
              Reset all
            </Button>
          </Group>
        </Stack>
      </Modal>

      <Accordion multiple defaultValue={["rent", "property"]} variant="contained">
        <Accordion.Item value="rent">
          <Accordion.Control>
            Rent
            <SectionSummary>{`${summaryValue(userInput.monthlyRent, formatCAD)}/mo · +${summaryValue(userInput.rentIncreaseRate)}%/yr`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="property">
          <Accordion.Control>
            Property
            <SectionSummary>{`${summaryValue(userInput.initialHomePrice, formatCAD)} · ${summaryValue(userInput.holdingPeriod)} yr hold`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
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
                  "Expected compound annual growth in the home's market value. Long-run world historical average is 0–2% above inflation (2–4% nominal).",
              })}

              <UserInputFormItem
                id="propertyTaxRate"
                label="Property tax"
                labelHelperText={`Your annual property tax, in dollars or as a % of today's home value: typically 0.5–1.5%, lower in the big metros.`}
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
                id="condoFeesPerMonth"
                label="Condo fees"
                labelHelperText={`Monthly condo or strata fees in today's dollars; $0 for a house.`}
                value={userInput.condoFeesPerMonth}
                onChange={bind("condoFeesPerMonth")}
                error={errors.condoFeesPerMonth}
                prefix="$"
                suffix=" /mo"
                thousandSeparator
                {...c("condoFeesPerMonth")}
              />

              <UserInputFormItem
                id="maintPct"
                label="Maintenance"
                labelHelperText={`Yearly repairs and replacements (roof, furnace, appliances), in dollars or as a % of today's home value: about 1% for a house and 0.5% for a condo unit, less where land is expensive. Excludes condo fees and insurance.`}
                value={userInput.maintPct}
                onChange={bind("maintPct")}
                error={errors.maintPct}
                {...c("maintPct")}
                percentToggle={{
                  base: userInput.initialHomePrice,
                  defaultUnit: "%",
                  unitAriaLabel: "Maintenance input unit",
                }}
              />

              <UserInputFormItem
                id="insurancePct"
                label="Home insurance"
                labelHelperText={`Your yearly home insurance premium minus the tenant insurance you'd pay as a renter, in dollars or as a % of today's home value.`}
                value={userInput.insurancePct}
                onChange={bind("insurancePct")}
                error={errors.insurancePct}
                {...c("insurancePct")}
                percentToggle={{
                  base: userInput.initialHomePrice,
                  defaultUnit: "$",
                  unitAriaLabel: "Home insurance input unit",
                }}
              />

              {perturbed("ownerCostGrowthRate", "ownerCostGrowthSigma", {
                label: "Owner cost growth",
                helperText:
                  "How fast property tax, condo fees, maintenance and insurance rise each year. A little above inflation: repairs are mostly skilled labour, buildings age, and municipal budgets have grown faster than prices.",
                additionalText: "Applies to property tax, condo fees, maintenance and insurance.",
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="mortgage">
          <Accordion.Control>
            Mortgage
            <SectionSummary>{`${summaryValue(userInput.downPaymentPercentage)}% down · ${summaryValue(userInput.amortization)} yr · ${summaryValue(userInput.annualMortgageInterestRate)}%`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                {`Down payment amount ${formatCAD((userInput.downPaymentPercentage / 100) * userInput.initialHomePrice)}. Est. mortgage payment: ${monthlyMortgage} /mo.${premiumText}`}
              </Text>
              <Stack gap={0}>
                <UserInputFormItem
                  id="downPaymentPercentage"
                  label="Down payment"
                  labelHelperText="Under 20% down needs mortgage default insurance (CMHC, Sagen or Canada Guaranty), allowed on homes under $1.5M. Minimum: 5% of the first $500k plus 10% of the rest. The premium (2.8–4.0% of the loan) is added to the mortgage; Ontario, Quebec and Saskatchewan also charge sales tax on it at closing — add that to buyer closing costs."
                  value={userInput.downPaymentPercentage}
                  onChange={bind("downPaymentPercentage")}
                  error={errors.downPaymentPercentage}
                  suffix="%"
                  {...c("downPaymentPercentage")}
                />
                <UserInputFormItem
                  id="amortization"
                  label="Amortization period"
                  labelHelperText="Total length of the mortgage, up to 30 years. With under 20% down, 30 years is only for first-time buyers or new builds and adds 0.20% to the insurance premium."
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
                    "Your rate for the first 5-year term. Renewals vary around it. The default reflects the Bank of Canada's neutral policy rate (2.75%) plus a typical lender spread (1.75%).",
                  disabled: userInput.downPaymentPercentage === 100,
                })}
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="investment">
          <Accordion.Control>
            Investment
            <SectionSummary>{`${summaryValue(userInput.investmentReturnRate)}% return · ${summaryValue(userInput.taxShelteredPct)}% sheltered`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              <Alert variant="default" color="gray">
                Total Return is split into two parts: Annual Yield (taxed each year) and deferred
                capital gains (taxed at sale). Use Annual Yield Tax to set a blended rate that
                reflects your mix of interest, dividends and realized capital gains.
              </Alert>
              <Stack gap={0}>
                {perturbed("investmentReturnRate", "investmentReturnSigma", {
                  label: "Compound return",
                  helperText:
                    "Expected pre-tax compound annual return after fund fees, including dividends and capital gains. The default is based on long-term capital market assumptions for a diversified growth portfolio.",
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
                <UserInputFormItem
                  id="taxShelteredPct"
                  label="Tax-sheltered"
                  labelHelperText="Share of invested savings held in tax-sheltered accounts such as a TFSA or RRSP. That share is treated as tax-free: no tax on yield or gains. This is exact for a TFSA and approximate for an RRSP, which is only equivalent if you reinvest the tax refund and pay the same tax rate on withdrawal. Applies to whoever invests the monthly difference, renter or owner, and to the starting savings too, so keep it within your contribution room; leave at 0% if that room is already used. The default 50% assumes some, but not all, of your room is still free."
                  value={userInput.taxShelteredPct}
                  onChange={bind("taxShelteredPct")}
                  error={errors.taxShelteredPct}
                  suffix="%"
                  {...c("taxShelteredPct")}
                />
              </Stack>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="costs">
          <Accordion.Control>
            Transaction costs
            <SectionSummary>{`buy ${summaryValue(userInput.buyerClosingCostsPct)}% · sell ${summaryValue(userInput.sellerClosingCostsPct)}%`}</SectionSummary>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap={0}>
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
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      <Button
        variant="default"
        size="sm"
        onClick={openReset}
        leftSection={<IconRotate size={14} />}
        style={{ alignSelf: "flex-end" }}
      >
        Reset all
      </Button>
    </Stack>
  );
}
