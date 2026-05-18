import type { ThemeDefinition } from "xmlui";

export const TrackerTheme: ThemeDefinition = {
  id: "tracker-theme",
  name: "Tracker Theme",
  extends: "xmlui",
  color: "$color-primary-500",
  themeVars: {
    // =============================================================
    // Animo brand palette — these seven hexes are the only colors
    // surfacing in the UI; every shade in the scales below either is
    // one of them or is derived by varying lightness around the same
    // hue. Keep new components on the named scales (color-primary-*,
    // color-surface-*, color-warn-*, color-danger-*) instead of
    // sneaking in raw hex values, otherwise the brand drifts.
    //
    //   Sage Teal      #3F8F8C  — primary brand
    //   Soft Mint      #A7D0C9  — primary subtle accent / pale teal
    //   Mist           #EAF3F1  — primary tint surface
    //   Deep Charcoal  #1E2328  — text / dark surface
    //   Warm Amber     #F2A82F  — warning
    //   Soft Coral     #FF6F61  — danger / destructive
    //   Warm White     #FAF8F6  — page background / light surface
    //
    // We override the `const-color-X-N` atoms (not `color-X-N`) so
    // XMLUI's tone system keeps working — dark tone automatically
    // inverts the index (`color-X-50` → `const-color-X-950`), so the
    // same palette serves both light and dark modes after inversion.
    // =============================================================

    // Primary scale (Sage Teal hue ~177° anchored at 500)
    "const-color-primary-50": "#EAF3F1",
    "const-color-primary-100": "#D5E7E3",
    "const-color-primary-200": "#A7D0C9",
    "const-color-primary-300": "#7AB8AE",
    "const-color-primary-400": "#5DA39D",
    "const-color-primary-500": "#3F8F8C",
    "const-color-primary-600": "#357773",
    "const-color-primary-700": "#2A5F5B",
    "const-color-primary-800": "#1F4744",
    "const-color-primary-900": "#162F2D",
    "const-color-primary-950": "#0F1F1D",

    // Surface scale (warm neutrals, Warm White → Deep Charcoal).
    // In dark mode the indices invert: -950/-1000 become page bg,
    // -50/-100 become text — so the 950/1000 entries are pushed
    // darker than #1E2328 to keep a clear "raised vs page" hierarchy.
    "const-color-surface-0": "#FFFFFF",
    "const-color-surface-50": "#FAF8F6",
    "const-color-surface-100": "#F0EDEA",
    "const-color-surface-200": "#E0DCD7",
    "const-color-surface-300": "#C2BDB7",
    "const-color-surface-400": "#9D9893",
    "const-color-surface-500": "#76716D",
    "const-color-surface-600": "#544F4B",
    "const-color-surface-700": "#3D3934",
    "const-color-surface-800": "#2C2925",
    "const-color-surface-900": "#1E2328",
    "const-color-surface-950": "#14181C",
    "const-color-surface-1000": "#0A0C0F",

    // Warn scale (Warm Amber as 500)
    "const-color-warn-50": "#FEF6E6",
    "const-color-warn-100": "#FCEBC8",
    "const-color-warn-200": "#F9CE8C",
    "const-color-warn-300": "#F6B95C",
    "const-color-warn-400": "#F4AE45",
    "const-color-warn-500": "#F2A82F",
    "const-color-warn-600": "#D49118",
    "const-color-warn-700": "#A36F0E",
    "const-color-warn-800": "#7C5408",
    "const-color-warn-900": "#553905",
    "const-color-warn-950": "#3B2604",

    // Danger scale (Soft Coral as 500)
    "const-color-danger-50": "#FFE7E5",
    "const-color-danger-100": "#FFCFCB",
    "const-color-danger-200": "#FFB0A8",
    "const-color-danger-300": "#FF9485",
    "const-color-danger-400": "#FF8170",
    "const-color-danger-500": "#FF6F61",
    "const-color-danger-600": "#E8554A",
    "const-color-danger-700": "#C8412F",
    "const-color-danger-800": "#9C2F22",
    "const-color-danger-900": "#6E2017",
    "const-color-danger-950": "#48140E",

    // Success scale (re-uses Sage Teal because the brand only ships
    // one positive accent; in practice rare — XMLUI just needs a value
    // for built-in semantic tokens like form-validation success).
    "const-color-success-50": "#EAF3F1",
    "const-color-success-100": "#D5E7E3",
    "const-color-success-200": "#A7D0C9",
    "const-color-success-300": "#7AB8AE",
    "const-color-success-400": "#5DA39D",
    "const-color-success-500": "#3F8F8C",
    "const-color-success-600": "#357773",
    "const-color-success-700": "#2A5F5B",
    "const-color-success-800": "#1F4744",
    "const-color-success-900": "#162F2D",
    "const-color-success-950": "#0F1F1D",

    // --- App layout
    "width-navPanel-App": "280px",
    "maxWidth-content-App": "100%",
    "maxWidth-App": "100%",
    "maxWidth-content-DocumentPageNoTOC": "700px",
    "paddingVertical-Pages": "$space-4",
    "paddingHorizontal-Pages": "$space-4",


    layout: "basic",
    tableOfContents: "false",
    tags: "false",

    "paddingVertical-NavPanel": "0",
    "marginBottom-logo-NavPanel": "0",
    "paddingHorizontal-NavPanel": "$space-4",
    "paddingHorizontal-md-NavPanel": "0",
    // Make the NavPanel share the AppHeader's surface so the sidebar
    // and the top bar read as one continuous chrome.
    "backgroundColor-NavPanel": "$backgroundColor-AppHeader",

    // WeekCalendar uses its own backgroundColor tokens (the extension
    // doesn't declare defaults). Pin all four surface zones — main
    // grid, top toolbar with the date-range controls, day-label header,
    // and the left hour-gutter — to the same raised surface Card uses
    // so the whole calendar reads as one sibling of the page Cards
    // instead of a sunken/transparent inset with mismatched strips.
    "backgroundColor-WeekCalendar": "$color-surface-raised",
    "backgroundColor-toolbar-WeekCalendar": "$color-surface-raised",
    "backgroundColor-header-WeekCalendar": "$color-surface-raised",
    "backgroundColor-gutter-WeekCalendar": "$color-surface-raised",

    // Every popover-style surface in the app shares the same tone-aware
    // page-background semantic token. That is also what ModalDialog
    // defaults to (`backgroundColor-ModalDialog` → `$backgroundColor-primary`
    // → `$color-surface-50`), so dropdowns, date pickers, row-action
    // menus, and the calendar's quick-edit popovers visually match the
    // modal editor. Avoid pointing at `$backgroundColor-ModalDialog`
    // directly — xmlui only defines that override in the light tone, so
    // dark mode would fall through to whatever default and break parity.
    "backgroundColor-menu-AutoComplete": "$backgroundColor-primary",
    "backgroundColor-menu-Select": "$backgroundColor-primary",
    "backgroundColor-menu-DatePicker": "$backgroundColor-primary",
    "backgroundColor-DropdownMenu": "$backgroundColor-primary",
    "backgroundColor-popover-WeekCalendar": "$backgroundColor-primary",
    "backgroundColor-popoverPrimary-WeekCalendar": "$backgroundColor-primary",

    // --- Colors & typography
    "color-surface": "$color-surface-500",
    backgroundColor: "$color-surface-50",
    fontSize: "15px",
    "fontFamily-monospace": "Menlo,Monaco,Consolas,Liberation Mono,Courier New,monospace",
    "font-feature-settings": "'cv03', 'ss03'",
    "fontSize-code": "13px",
    "textColor-Text": "$color-surface-600",

    // --- Navigation layout
    "iconAlignment-NavLink": "baseline",
    "fontSize-NavLink": "14px",
    "fontWeight-NavLink": "500",
    "backgroundColor-NavLink--active": "$color-surface-100",
    "textColor-NavLink": "$color-surface-500",
    "textColor-NavLink--active": "$color-surface-900",
    "textColor-NavLink--hover": "$color-surface-700",
    "textColor-NavLink--hover--active": "$color-surface-900",
    "textColor-NavLink--pressed": "$color-surface-900",
    "thickness-indicator-NavLink": "0",
    "backgroundColor-Text-code": "rgb(from $color-surface-200 r g b / 0.4)",
    "paddingHorizontal-Text-code": "$space-1",
    "marginTop-items-NavGroup": "$space-3",
    "marginBottom-items-NavGroup": "$space-3",
    "expandIconAlignment-NavGroup": "end",
    "paddingVertical-NavLink": "$space-1_5",
    "paddingLeft-level1-NavLink": "$space-0",
    "paddingLeft-level2-NavGroup": "$space-0",

    // --- Content layout
    "textColor-Heading": "$color-surface-900",
    "fontSize-H1-markdown": "clamp(1.75rem, 1rem + 2.5vw, 2.25rem)",
    "fontSize-H1": "clamp(1.75rem, 1rem + 2.5vw, 2.25rem)",
    "marginTop-H1-markdown": "$space-2",
    "marginBottom-H1-markdown": "$space-2",
    "fontSize-H2-markdown": "clamp(1.5rem, 1rem + 1.5vw, 1.875rem)",
    "fontSize-H2": "clamp(1.5rem, 1rem + 1.5vw, 1.875rem)",
    "marginTop-H2-markdown": "$space-6",
    "marginBottom-H2-markdown": "$space-1",
    "fontSize-H3-markdown": "clamp(1.125rem, 0.875rem + 0.75vw, 1.25rem)",
    "fontSize-H3": "clamp(1.125rem, 0.875rem + 0.75vw, 1.25rem)",
    "marginTop-H3-markdown": "$space-6",
    "marginBottom-H3-markdown": "$space-1",
    "marginTop-H4-markdown": "$space-6",
    "fontSize-H4-markdown": "clamp(1rem, 0.875rem + 0.5vw, 1.125rem)",
    "fontSize-H4": "clamp(1rem, 0.875rem + 0.5vw, 1.125rem)",
    "marginBottom-H4-markdown": "$space-1",
    "fontWeight-PrevNextLink": "500",
    "textColor-prevNextLink-DocumentLinks": "$color-surface-900",
    "padding-prevNextLink-DocumentLinks": "4px",
    "fontSize-prevNextText-DocumentLinks": "13px",
    "textColor-prevNextText-DocumentLinks": "$color-surface-500",
    "backgroundColor-CodeBlock": "$color-surface-100",
    "textColor-Link": "$color-surface-600",
    "textColor-Link--hover": "$color-surface-900",

    // --- Scroll to top
    "backgroundColor-ScrollToTop": "rgb(from $color-surface-100 r g b / 0.9)",
    "border-ScrollToTop": "1px solid $color-surface-200",
    "color-ScrollToTop": "$color-surface-900",

    // --- Drawer
    "maxWidth-Drawer": "100%",
    "top-CloseButton": "$space-3",
    "right-CloseButton": "$space-3",

    // --- Search
    "textColor-SearchToggleButton": "$color-surface-500",
    "textColor-SearchToggleButton--hover": "$color-surface-700",
    "backgroundColor-SearchItem--hover": "$color-surface-50",

    // --- Headlines
    "paddingTop-Headlines": "$space-14",
    "paddingTop-md-Headlines": "$space-20",
    "fontSize-heading-Headlines": "36px",
    "fontSize-md-heading-Headlines": "42px",
    "lineHeight-heading-Headlines": "1.2",
    "fontSize-sub-Headlines": "24px",
    "lineHeight-sub-Headlines": "1.3",

    // --- Benefit
    "marginTop-Benefit": "6px",
    "size-icon-Benefit": "24px",
    "maxWidth-md-Benefit": "600px",
    "maxWidth-Benefit": "400px",
  },
  tones: {
    // Tone-specific overrides where the same color reference doesn't
    // suit both modes equally. The const-color-* inversion handles most
    // tokens; these are the exceptions where the *semantic* color
    // should differ per tone.
    light: {
      themeVars: {
        // Header picker popovers (project + tag) sit on Mist so they
        // read as a soft branded panel instead of a stark white surface.
        // Dark mode keeps the modal-matching neutral (see below).
        "backgroundColor-popover-Picker": "$color-primary-50",
      },
    },
    dark: {
      themeVars: {
        // Header picker popovers in dark mode share the modal surface
        // so dropdown + edit modal read as one elevation family.
        "backgroundColor-popover-Picker": "$backgroundColor-primary",
      },
    },
  },
  resources: {},
};

export default TrackerTheme;
