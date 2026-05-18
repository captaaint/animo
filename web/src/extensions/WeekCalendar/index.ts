import { createMetadata, parseScssVar, wrapComponent } from "xmlui";
import WeekCalendar from "./WeekCalendar";

const COMP = "WeekCalendar";

// Component-scoped theme variables. Every visual aspect of the calendar
// resolves to one of these — no hard-coded colors anywhere in the renderer.
// Users can override any of them through a <Theme themeVars="..."> wrapper
// or in the global theme definition, the same way as for any core component.
const componentThemeVars = [
  // surfaces
  `backgroundColor-${COMP}`,
  `borderColor-${COMP}`,
  `borderRadius-${COMP}`,
  `backgroundColor-toolbar-${COMP}`,
  `backgroundColor-header-${COMP}`,
  `backgroundColor-gutter-${COMP}`,
  // grid
  `borderColor-hour-${COMP}`,
  `borderColor-halfHour-${COMP}`,
  `backgroundColor-today-${COMP}`,
  // text
  `textColor-${COMP}`,
  `textColor-secondary-${COMP}`,
  `textColor-strong-${COMP}`,
  `textColor-today-${COMP}`,
  // entry blocks
  `backgroundColor-entry-${COMP}`,
  `textColor-entry-${COMP}`,
  `borderRadius-entry-${COMP}`,
  `boxShadow-entry-${COMP}`,
  // drag-create ghost
  `backgroundColor-create-${COMP}`,
  `borderColor-create-${COMP}`,
  `textColor-create-${COMP}`,
  // current-time indicator
  `color-now-${COMP}`,
  // toolbar buttons
  `backgroundColor-button-${COMP}`,
  `backgroundColor-button-active-${COMP}`,
  `textColor-button-${COMP}`,
  `textColor-button-active-${COMP}`,
  `borderColor-button-${COMP}`,
  // popover
  `backgroundColor-popover-${COMP}`,
  `borderColor-popover-${COMP}`,
  `borderRadius-popover-${COMP}`,
  `boxShadow-popover-${COMP}`,
  `textColor-popover-${COMP}`,
  `textColor-popover-secondary-${COMP}`,
  `textColor-popover-danger-${COMP}`,
  `borderColor-popover-danger-${COMP}`,
  `backgroundColor-popoverPrimary-${COMP}`,
  `borderColor-popoverPrimary-${COMP}`,
  `textColor-popoverPrimary-${COMP}`,
];

const metadata = createMetadata({
  status: "experimental",
  description:
    "Toggl-style week calendar. Renders time entries on a day×hour grid, " +
    "supports click/drag to create, click to edit, drag-to-move, and edge-resize.",
  props: {
    entries: {
      description:
        "Array of time entries: { id, projectId, description, startTime, endTime } " +
        "(start/end as ISO timestamps).",
      valueType: "any",
    },
    projects: {
      description: "Array of projects: { id, name, color }.",
      valueType: "any",
    },
    currentDate: {
      description:
        "ISO date (YYYY-MM-DD) of the focused day. The visible range is derived from this.",
      valueType: "string",
    },
    viewMode: {
      description: "Calendar view mode.",
      valueType: "string",
      availableValues: ["day", "workweek", "week"],
      defaultValue: "week",
    },
    weekStartsOn: {
      description: "0 = Sunday, 1 = Monday.",
      valueType: "number",
      defaultValue: 1,
    },
    dayStartHour: {
      description: "First visible hour (0–23).",
      valueType: "number",
      defaultValue: 6,
    },
    dayEndHour: {
      description: "Last visible hour (0–24).",
      valueType: "number",
      defaultValue: 22,
    },
    pixelsPerHour: {
      description: "Vertical zoom — pixels per hour.",
      valueType: "number",
      defaultValue: 48,
    },
    snapMinutes: {
      description: "Snap step for create / move / resize, in minutes.",
      valueType: "number",
      defaultValue: 15,
    },
    defaultEntryMinutes: {
      description: "Length (in minutes) of a single click-to-create entry.",
      valueType: "number",
      defaultValue: 60,
    },
    inlinePopover: {
      description:
        "When true, clicking a block (or finishing a drag-create) opens an inline " +
        "popover for editing. When false, only events fire and the parent owns the modal.",
      valueType: "boolean",
      defaultValue: true,
    },
    selectedSlot: {
      description:
        "Controlled time-range highlight: { dateIso, startMin, endMin } or null. " +
        "Set this on `slotSelected` so the highlight stays visible while the " +
        "parent's create dialog is open; clear when the dialog closes.",
      valueType: "any",
    },
  },
  events: {
    createEntry: {
      description:
        "Fired when a new entry is being created. Payload: " +
        "{ startTime, endTime, description, projectId }.",
    },
    updateEntry: {
      description:
        "Fired after move, resize, or popover save. Payload: " +
        "{ id, startTime, endTime, description, projectId }.",
    },
    deleteEntry: {
      description: "Fired when the popover delete button is pressed. Payload: { id }.",
    },
    selectEntry: {
      description: "Fired when an existing entry block is clicked.",
    },
    slotSelected: {
      description:
        "Fired alongside createEntry on drag-create release with the chosen " +
        "{ dateIso, startMin, endMin }. The parent should mirror this into " +
        "`selectedSlot` to keep the highlight visible while its create dialog is open.",
    },
    dateChange: {
      description:
        "Fired when the user navigates with prev / next / today. Payload: ISO date string.",
    },
  },
  themeVars: parseScssVar(JSON.stringify(componentThemeVars)),
  defaultThemeVars: {
    // Surfaces & containers
    [`backgroundColor-${COMP}`]: "$backgroundColor-primary",
    [`borderColor-${COMP}`]: "$borderColor",
    [`borderRadius-${COMP}`]: "$borderRadius",
    [`backgroundColor-toolbar-${COMP}`]: "$color-surface-50",
    [`backgroundColor-header-${COMP}`]: "$color-surface-50",
    [`backgroundColor-gutter-${COMP}`]: "$color-surface-50",

    // Grid
    [`borderColor-hour-${COMP}`]: "$color-surface-100",
    [`borderColor-halfHour-${COMP}`]: "$color-surface-50",
    [`backgroundColor-today-${COMP}`]: "rgb(from $color-primary-500 r g b / 0.04)",

    // Text
    [`textColor-${COMP}`]: "$textColor-primary",
    [`textColor-secondary-${COMP}`]: "$textColor-secondary",
    [`textColor-strong-${COMP}`]: "$color-surface-900",
    [`textColor-today-${COMP}`]: "$color-primary-500",

    // Entry blocks
    [`backgroundColor-entry-${COMP}`]: "$color-primary-500",
    [`textColor-entry-${COMP}`]: "$const-color-surface-0",
    [`borderRadius-entry-${COMP}`]: "$borderRadius",
    [`boxShadow-entry-${COMP}`]: "$boxShadow-md",

    // Drag-create ghost
    [`backgroundColor-create-${COMP}`]: "rgb(from $color-primary-500 r g b / 0.22)",
    [`borderColor-create-${COMP}`]: "$color-primary-500",
    [`textColor-create-${COMP}`]: "$const-color-surface-0",

    // Current-time indicator
    [`color-now-${COMP}`]: "$color-danger-500",

    // Toolbar buttons. Default raises the button surface one shade
    // away from the toolbar so it stays visible in both tones — see
    // the per-tone overrides at the bottom of this object.
    [`backgroundColor-button-${COMP}`]: "$color-surface-0",
    [`backgroundColor-button-active-${COMP}`]: "$color-primary-500",
    [`textColor-button-${COMP}`]: "$textColor-secondary",
    [`textColor-button-active-${COMP}`]: "$const-color-surface-0",
    [`borderColor-button-${COMP}`]: "$borderColor",

    // Popover
    [`backgroundColor-popover-${COMP}`]: "$backgroundColor-primary",
    [`borderColor-popover-${COMP}`]: "$borderColor",
    [`borderRadius-popover-${COMP}`]: "$borderRadius",
    [`boxShadow-popover-${COMP}`]: "$boxShadow-md",
    [`textColor-popover-${COMP}`]: "$textColor-primary",
    [`textColor-popover-secondary-${COMP}`]: "$textColor-secondary",
    [`textColor-popover-danger-${COMP}`]: "$color-danger-500",
    [`borderColor-popover-danger-${COMP}`]: "$color-danger-200",
    [`backgroundColor-popoverPrimary-${COMP}`]: "$color-primary-500",
    [`borderColor-popoverPrimary-${COMP}`]: "$color-primary-600",
    [`textColor-popoverPrimary-${COMP}`]: "$const-color-surface-0",

    light: {
      // (no overrides — the base mappings already work in light tone)
    },
    dark: {
      // In dark tone surface-0 is darker than surface-50, so flip the
      // button background up to surface-200 for a clear contrast against
      // the surface-50 toolbar.
      [`backgroundColor-button-${COMP}`]: "$color-surface-200",
    },
  },
});

export const weekCalendarRenderer = wrapComponent(
  "WeekCalendar",
  WeekCalendar,
  metadata,
  {
    booleans: ["inlinePopover"],
    numbers: [
      "weekStartsOn",
      "dayStartHour",
      "dayEndHour",
      "pixelsPerHour",
      "snapMinutes",
      "defaultEntryMinutes",
    ],
    strings: ["currentDate", "viewMode"],
    events: [
      "createEntry",
      "updateEntry",
      "deleteEntry",
      "selectEntry",
      "slotSelected",
      "dateChange",
    ],
  },
);

// Default export is the XMLUI extension descriptor that the bootstrapper consumes.
// Use the `XMLUIExtensions` namespace so the framework's bare-name lookup
// (which only searches `#xmlui-core-ns`, `#app-ns`, and `XMLUIExtensions`)
// can resolve `<WeekCalendar />` without a namespace prefix.
export default {
  namespace: "XMLUIExtensions",
  components: [weekCalendarRenderer],
};
