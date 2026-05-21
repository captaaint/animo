// Extension registration file for the xmlui SSG runtime. It scans the
// project root for an extensions.[ts|tsx|mts|mjs|cjs|js] file and pulls
// every import specifier through its parser, so listing the modules
// here is enough to register them during SSR. Keep this list in sync
// with the extensions array in index.ts.

import tonePersistExt from "./src/extensions/TonePersist";
import centerRowExt from "./src/extensions/CenterRow";

export default [tonePersistExt, centerRowExt];
