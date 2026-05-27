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
    "padding-footer-NavPanel": "0",
    "paddingHorizontal-footer-NavPanel": "0",
    "paddingVertical-footer-NavPanel": "$space-2",
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
    "backgroundColor-menu-AutoComplete": "$color-surface-raised",
    "backgroundColor-menu-Select": "$color-surface-raised",
    "backgroundColor-menu-DatePicker": "$color-surface-raised",
    "backgroundColor-DropdownMenu": "$color-surface-raised",
    "minWidth-DropdownMenu": "0",
    "borderColor-DropdownMenu-content": "$borderColor",
    "borderWidth-DropdownMenu-content": "1px",
    "backgroundColor-MenuItem--hover": "$color-surface-100",
    "backgroundColor-dropdown-item--hover": "$color-surface-100",
    "backgroundColor-item-AutoComplete--hover": "$color-surface-100",
    "backgroundColor-item-Select--hover": "$color-surface-100",
    "textColor-indicator-Select": "$color-primary-500",
    "borderColor-Input": "$color-surface-300",
    "borderColor-Input--hover": "$color-surface-400",
    "backgroundColor-Input": "$color-surface-0",
    "backgroundColor-ModalDialog": "$color-surface-0",
    "borderRadius-Input": "6px",
    "borderRadius-AutoComplete": "6px",
    "borderRadius-Select": "6px",
    "borderRadius-TextBox": "6px",
    "borderRadius-NumberBox": "6px",
    "borderRadius-TextArea": "6px",
    "borderRadius-DateInput": "6px",
    "borderRadius-Button": "6px",
    "borderRadius-Card": "16px",
    "backgroundColor-AutoComplete": "$color-surface-0",
    "backgroundColor-Select": "$color-surface-0",
    "backgroundColor-TextBox": "$color-surface-0",
    "backgroundColor-NumberBox": "$color-surface-0",
    "backgroundColor-TextArea": "$color-surface-0",
    "backgroundColor-DateInput": "$color-surface-0",
    "backgroundColor-checked-Checkbox": "$color-primary-500",
    "borderColor-checked-Checkbox": "$color-primary-500",
    "backgroundColor-indicator-Checkbox": "$color-surface-0",
    "backgroundColor-checked-Switch": "$color-primary-500",
    "borderColor-checked-Switch": "$color-primary-500",
    "backgroundColor-indicator-checked-Switch": "$color-surface-0",
    "backgroundColor-checked-RadioGroupOption": "$color-primary-500",
    "borderColor-checked-RadioGroupOption": "$color-primary-500",
    "backgroundColor-checked-selectionCheckbox-List": "$color-primary-500",
    "borderColor-checked-selectionCheckbox-List": "$color-primary-500",
    "backgroundColor-popover-WeekCalendar": "$backgroundColor-primary",
    "backgroundColor-popoverPrimary-WeekCalendar": "$backgroundColor-primary",

    // --- Colors & typography
    "color-surface": "$color-surface-500",
    backgroundColor: "$color-surface-50",
    fontFamily: "Sora,system-ui,-apple-system,Segoe UI,sans-serif",
    fontSize: "13px",
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
    "backgroundColor-Button-secondary-ghost--hover": "$color-surface-50",
    "backgroundColor-Button-secondary-ghost--active": "$color-surface-50",

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
    // Size drawers against the *visible* viewport (dvh), not the large
    // viewport (vh). On iOS Safari vh ignores the dynamic browser chrome, so a
    // bottom drawer sized in vh overflows the visible area and its pinned
    // header (with the save/delete buttons) gets pushed off-screen. dvh tracks
    // the currently-visible height; while a modal drawer is open the page
    // behind it is locked, so the toolbar doesn't toggle and dvh stays stable.
    // Set here once so every current and future Drawer inherits the cap.
    "height-Drawer": "auto",
    "maxHeight-Drawer": "92dvh",
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
      resources: {
        "clients-empty-list": "resources/clients-empty-list-light.svg",
        "projects-empty-list": "resources/projects-empty-list-light.svg",
        "tags-empty-list": "resources/tags-empty-list-light.svg",
        "time-entries-empty-list": "resources/time-entries-empty-list-light.svg",
      },
      themeVars: {
        // Header picker popovers (project + tag) sit on Mist so they
        // read as a soft branded panel instead of a stark white surface.
        // Dark mode keeps the modal-matching neutral (see below).
        "backgroundColor-popover-Picker": "$color-surface-0",
        "backgroundColor-Card--hover": "$color-surface-raised",
      },
    },
    dark: {
      resources: {
        "clients-empty-list": "resources/clients-empty-list.svg",
        "projects-empty-list": "resources/projects-empty-list-dark.svg",
        "tags-empty-list": "resources/tags-empty-list.svg",
        "time-entries-empty-list": "resources/time-entries-empty-list.svg",
      },
      themeVars: {
        backgroundColor: "#0A0C0F",
        "backgroundColor-primary": "#0A0C0F",
        "backgroundColor-AppHeader": "#1E2328",
        "backgroundColor-NavPanel": "#14181C",
        "backgroundColor-Card": "#1E2328",
        "backgroundColor-Card--hover": "#1E2328",
        "borderColor-Card": "rgba(255,255,255,0.04)",
        "boxShadow-Card": "0 18px 60px rgba(0,0,0,0.32)",
        "boxShadow-Card--hover": "0 18px 60px rgba(0,0,0,0.32)",
        "textColor-Text": "rgb(250 248 246 / 0.92)",
        "textColor-Heading": "#FAF8F6",
        "textColor-Text-secondary": "#E0DCD7",
        "textColor-NavLink": "#C2BDB7",
        "textColor-NavLink--active": "#FAF8F6",
        "textColor-NavLink--hover": "#FAF8F6",
        "textColor-NavLink--hover--active": "#FAF8F6",
        "backgroundColor-NavLink--active": "#162F2D",
        "backgroundColor-NavLink--hover": "#0F1F1D",
        "backgroundColor-NavLink--hover--active": "#162F2D",
        "color-icon-NavLink": "#9D9893",
        "color-indicator-NavLink--active": "#5DA39D",
        "color-indicator-NavLink--hover": "#5DA39D",
        "thickness-indicator-NavLink": "3px",
        "backgroundColor-Button-primary-solid": "#3F8F8C",
        "backgroundColor-Button-primary-solid--hover": "#5DA39D",
        "backgroundColor-Button-primary-solid--active": "#357773",
        "backgroundColor-Button-secondary-ghost--hover": "#0F1F1D",
        "backgroundColor-Button-secondary-ghost--active": "#162F2D",
        "backgroundColor-ModalDialog": "#14181C",
        "backgroundColor-Button-secondary-outlined--hover": "#2C2925",
        "backgroundColor-Button-secondary-outlined--active": "#3D3934",
        "backgroundColor-Button-primary-outlined--hover": "#162F2D",
        "backgroundColor-Button-primary-outlined--active": "#1F4744",
        "backgroundColor-Button-attention-outlined--hover": "#3B1614",
        "backgroundColor-Button-attention-outlined--active": "#5C2620",
        "backgroundColor-menu-AutoComplete": "#1E2328",
        "backgroundColor-menu-Select": "#1E2328",
        "backgroundColor-menu-DatePicker": "#1E2328",
        "backgroundColor-DropdownMenu": "#1E2328",
        "borderColor-DropdownMenu-content": "rgba(255,255,255,0.04)",
        "borderWidth-DropdownMenu-content": "1px",
        "borderColor-menu-Select": "rgba(255,255,255,0.04)",
        "borderColor-menu-AutoComplete": "rgba(255,255,255,0.04)",
        "borderColor-menu-DatePicker": "rgba(255,255,255,0.04)",
        "backgroundColor-MenuItem--hover": "#2A5F5B",
        "backgroundColor-dropdown-item--hover": "#2A5F5B",
        "backgroundColor-item-AutoComplete--hover": "#2A5F5B",
        "backgroundColor-item-Select--hover": "#2A5F5B",
        "backgroundColor-item-Select--active": "#1F4744",
        "backgroundColor-item-AutoComplete--active": "#1F4744",
        "backgroundColor-item-DatePicker--hover": "#2A5F5B",

        "backgroundColor-WeekCalendar": "#1E2328",
        "backgroundColor-toolbar-WeekCalendar": "#1E2328",
        "backgroundColor-header-WeekCalendar": "#1E2328",
        "backgroundColor-gutter-WeekCalendar": "#14181C",
        "backgroundColor-columnAlt-WeekCalendar": "rgb(15 31 29 / 0.36)",
        "backgroundColor-today-WeekCalendar": "rgb(31 71 68 / 0.42)",
        "borderColor-WeekCalendar": "rgba(255,255,255,0.05)",
        "borderColor-hour-WeekCalendar": "rgba(255,255,255,0.045)",
        "borderColor-halfHour-WeekCalendar": "rgba(255,255,255,0.025)",
        "textColor-WeekCalendar": "rgb(250 248 246 / 0.92)",
        "textColor-strong-WeekCalendar": "#FAF8F6",
        "textColor-secondary-WeekCalendar": "#C2BDB7",
        "textColor-today-WeekCalendar": "#A7D0C9",
        "backgroundColor-entry-WeekCalendar": "#3F8F8C",
        "borderColor-entry-WeekCalendar": "rgba(255,255,255,0.18)",
        "textColor-entry-WeekCalendar": "#FAF8F6",
        "boxShadow-entry-WeekCalendar": "0 8px 24px rgba(0,0,0,0.35)",
        "backgroundColor-create-WeekCalendar": "rgb(63 143 140 / 0.18)",
        "borderColor-create-WeekCalendar": "rgb(93 163 157 / 0.72)",
        "textColor-create-WeekCalendar": "#A7D0C9",
        "color-now-WeekCalendar": "#F4AE45",
        "backgroundColor-popover-WeekCalendar": "#1E2328",
        "backgroundColor-popoverPrimary-WeekCalendar": "#3F8F8C",
        "borderColor-popover-WeekCalendar": "rgba(255,255,255,0.06)",
        "boxShadow-popover-WeekCalendar": "0 24px 70px rgba(0,0,0,0.48)",
        "textColor-popover-WeekCalendar": "rgb(250 248 246 / 0.92)",
        "textColor-popover-secondary-WeekCalendar": "#C2BDB7",
        // Header picker popovers in dark mode share the modal surface
        // so dropdown + edit modal read as one elevation family.
        "backgroundColor-popover-Picker": "#1E2328",
      },
    },
  },
  resources: {
    "time-entries-empty-list": "resources/time-entries-empty-list.svg",
  },
};

export default TrackerTheme;
