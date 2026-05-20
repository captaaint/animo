// Entry script for `node --import`: registers the .css→empty-module ESM
// loader hook for the rest of the process. Chained alongside tsx's hooks.

import { register } from "node:module";

register("./ssg-css-noop-loader.mjs", import.meta.url);
