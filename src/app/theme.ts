import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  FileInput,
  List,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Table,
  createTheme,
  defaultVariantColorsResolver,
  virtualColor,
  type CSSVariablesResolver,
  type MantineColorsTuple,
  type VariantColorsResolver,
} from "@mantine/core";
import classes from "./theme.module.css";

// "Ledger" design system: ink on paper, hairline rules instead of boxes, one green accent for
// figures and gains, rust for shortfalls and warnings. The shared --pf-* tokens live in
// globals.css; these palettes feed Mantine's color props.

/** Accent green — figures, gains, and the lead series in charts (`c="ledger"`). */
const ledger: MantineColorsTuple = [
  "#e9f4f0",
  "#cde6dc",
  "#a0cdbc",
  "#71b29b",
  "#4a9a80",
  "#2f876c",
  "#1d775d",
  "#126950",
  "#0f5c45",
  "#0a4434",
];

/** Warnings, shortfalls, and "Preview" status (`c="rust"`). */
const rust: MantineColorsTuple = [
  "#fbf1e9",
  "#f4dcc8",
  "#eab993",
  "#df965f",
  "#d67b37",
  "#c9661f",
  "#b35714",
  "#a2500e",
  "#9a4a0b",
  "#6e3507",
];

/** Ink in light mode: shade 8 is the near-black used for text, rules, and filled controls. */
const inkLight: MantineColorsTuple = [
  "#f6f7f9",
  "#e6e8ec",
  "#dadde2",
  "#c9ced6",
  "#9aa2ae",
  "#6b7480",
  "#4f5866",
  "#2b313b",
  "#14181f",
  "#0b0e12",
];

/** Ink in dark mode: shade 4 (the dark primary shade) is the light ink on a dark ground. */
const inkDark: MantineColorsTuple = [
  "#0b0e12",
  "#14181f",
  "#2b313b",
  "#4f5866",
  "#e6e9ee",
  "#d3d8df",
  "#c0c6cf",
  "#adb4be",
  "#9aa2ae",
  "#87909c",
];

/** Cool near-black surfaces for the dark color scheme. */
const dark: MantineColorsTuple = [
  "#e6e9ee",
  "#c9ced6",
  "#9aa2ae",
  "#6b7480",
  "#363d47",
  "#262c34",
  "#1b2027",
  "#12161c",
  "#0d1014",
  "#08090c",
];

const INK_TEXT_VARIANTS = new Set(["subtle", "transparent", "light", "outline"]);

/**
 * Ink flips between schemes (near-black in light, near-white in dark), but Mantine derives a
 * variant's text colour from fixed shades: filled ink gets light-mode contrast text, and text-only
 * variants get a shade that vanishes on the dark ground. Point both at scheme-aware tokens.
 */
const variantColorResolver: VariantColorsResolver = (input) => {
  const resolved = defaultVariantColorsResolver(input);
  if (input.color !== "ink") return resolved;
  if (input.variant === "filled") return { ...resolved, color: "var(--pf-on-ink)" };
  if (INK_TEXT_VARIANTS.has(input.variant)) {
    return {
      ...resolved,
      color: "var(--pf-ink)",
      ...(input.variant === "outline" ? { border: "1px solid var(--pf-ink)" } : {}),
    };
  }
  return resolved;
};

export const theme = createTheme({
  primaryColor: "ink",
  primaryShade: { light: 8, dark: 4 },
  autoContrast: true,
  variantColorResolver,
  black: "#14181f",
  colors: {
    ledger,
    rust,
    inkLight,
    inkDark,
    ink: virtualColor({ name: "ink", light: "inkLight", dark: "inkDark" }),
    dark,
  },
  fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
  // Figures use the text face with tabular numerals; a monospace face made numbers and % look
  // like code. The token name is kept so existing `ff="monospace"` call sites stay valid.
  fontFamilyMonospace: "var(--font-plex-sans), system-ui, sans-serif",
  headings: {
    fontFamily: "var(--font-plex-sans), system-ui, sans-serif",
    fontWeight: "600",
  },
  defaultRadius: "sm",
  radius: { xs: "2px", sm: "4px", md: "6px", lg: "8px", xl: "12px" },
  components: {
    Accordion: Accordion.extend({
      classNames: {
        root: classes.accordion,
        item: classes.accordionItem,
        control: classes.accordionControl,
        label: classes.accordionLabel,
        content: classes.accordionContent,
      },
    }),
    Alert: Alert.extend({
      classNames: { root: classes.alert, title: classes.alertTitle },
    }),
    Badge: Badge.extend({
      defaultProps: { radius: "xs" },
      classNames: { root: classes.badge },
    }),
    Button: Button.extend({
      classNames: { root: classes.button },
    }),
    Card: Card.extend({
      classNames: { root: classes.card },
    }),
    FileInput: FileInput.extend({
      defaultProps: { size: "md" },
    }),
    List: List.extend({
      classNames: { root: classes.list, item: classes.listItem },
    }),
    Modal: Modal.extend({
      classNames: { title: classes.modalTitle },
    }),
    NumberInput: NumberInput.extend({
      defaultProps: { size: "md" },
      classNames: {
        input: classes.numberInput,
        controls: classes.controls,
        control: classes.control,
      },
    }),
    Paper: Paper.extend({
      classNames: { root: classes.paper },
    }),
    Select: Select.extend({
      defaultProps: { size: "md" },
      classNames: { input: classes.selectInput },
    }),
    SegmentedControl: SegmentedControl.extend({
      defaultProps: { color: "ink", withItemsBorders: false },
      classNames: {
        root: classes.segmented,
        label: classes.segmentedLabel,
        indicator: classes.segmentedIndicator,
      },
    }),
    Table: Table.extend({
      classNames: { table: classes.table, th: classes.th, td: classes.td },
    }),
  },
});

/** Darker dimmed text and borders than Mantine's defaults, so small grey labels pass AA. */
export const cssVariablesResolver: CSSVariablesResolver = () => ({
  variables: {},
  light: {
    "--mantine-color-dimmed": "#4f5866",
    "--mantine-color-default-border": "#c9ced6",
  },
  dark: {
    "--mantine-color-dimmed": "#9aa2ae",
    "--mantine-color-default-border": "#363d47",
    // With primaryShade.dark = 4, Mantine derives light/outline text from shade 0 (near-white),
    // which drops the hue from warnings and status badges. Restore it.
    "--mantine-color-ledger-light-color": "var(--pf-accent)",
    "--mantine-color-ledger-outline": "var(--pf-accent)",
    "--mantine-color-rust-light-color": "var(--pf-warn)",
    "--mantine-color-rust-outline": "var(--pf-warn)",
    "--mantine-color-red-light-color": "var(--mantine-color-red-4)",
    "--mantine-color-red-outline": "var(--mantine-color-red-4)",
  },
});
