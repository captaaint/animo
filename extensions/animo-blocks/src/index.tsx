// Single default-export descriptor bundling every renderer in the package.
// xmlui ssg's Node-side SSR loader registers extensions by reading the
// consumer's `extensions.ts` and looking at the *default* export of each
// imported package — named exports get lost in the SSR bundling pipeline
// (verified empirically: named-export style produced "Unknown component"
// errors in the rendered HTML). This mirrors how xmlui-search and other
// first-party xmlui packages structure their entry point.
import { tonePersistRenderer } from "./TonePersist";
import { keyListenerRenderer } from "./KeyListener";
import { windowEventRenderer } from "./WindowEvent";
import { viewportRenderer } from "./Viewport";
import { centerRowRenderer } from "./CenterRow";
import { datePickerRenderer } from "./DatePicker";
import { descriptionAutocompleteRenderer } from "./DescriptionAutocomplete";
import { timePickerRenderer } from "./TimePicker";

export default {
  namespace: "XMLUIExtensions",
  components: [
    tonePersistRenderer,
    keyListenerRenderer,
    windowEventRenderer,
    viewportRenderer,
    centerRowRenderer,
    datePickerRenderer,
    descriptionAutocompleteRenderer,
    timePickerRenderer,
  ],
};
