// Extension registration file for the xmlui SSG runtime. It scans the
// project root for an extensions.[ts|tsx|mts|mjs|cjs|js] file and pulls
// every import specifier through its parser, so listing the modules
// here is enough to register them during SSR. Keep this list in sync
// with the extensions array in index.ts.

import { tonePersist, centerRow } from "animo-blocks";
import downloadGridExt from "./src/extensions/DownloadGrid";

export default [tonePersist, centerRow, downloadGridExt];
