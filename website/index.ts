import { startApp } from "xmlui";
import animoBlocks from "animo-blocks";
import downloadGridExt from "./src/extensions/DownloadGrid";

const extensions = [animoBlocks, downloadGridExt];

export const runtime = import.meta.glob(`/src/**`, { eager: true });

startApp(runtime, extensions);

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    startApp(newModule?.runtime ?? runtime, extensions);
  });
}
