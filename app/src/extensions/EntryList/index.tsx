import { createMetadata, wrapComponent } from "xmlui";

import { EntryList } from "./EntryList";

const metadata = createMetadata({
  status: "experimental",
  description:
    "The List screen's per-day time-entry list (desktop table or mobile " +
    "cards). Renders a pre-formatted view model — see `listViewDays` in " +
    "Globals.xs — in plain React for fast mounting.",
  props: {
    days: {
      description:
        "Day groups from `listViewDays(...)`: `{ date, datePart, dayPart, " +
        "totalText, totalCompact, entries[] }`.",
    },
    layout: {
      description: "`table` (desktop, one table per day) or `cards` (mobile timeline).",
      valueType: "string",
      availableValues: ["table", "cards"],
      defaultValue: "table",
    },
    rowTestId: {
      description: "`data-testid` of each entry row.",
      valueType: "string",
      defaultValue: "list-entry-row",
    },
    showAddButton: {
      description: "Cards layout: show the per-day add-entry button.",
      valueType: "boolean",
      defaultValue: true,
    },
  },
  events: {
    openEntry: { description: "Edit was chosen for an entry. Payload: the entry." },
    duplicateEntry: { description: "Duplicate was chosen for an entry. Payload: the entry." },
    deleteEntry: { description: "Delete was chosen for an entry. Payload: the entry." },
    addNew: { description: "The per-day add button was pressed (cards layout)." },
  },
});

export const entryListRenderer = wrapComponent("EntryList", EntryList, metadata, {
  strings: ["layout", "rowTestId"],
  booleans: ["showAddButton"],
  events: ["openEntry", "duplicateEntry", "deleteEntry", "addNew"],
});

export default {
  namespace: "XMLUIExtensions",
  components: [entryListRenderer],
};
