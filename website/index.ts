import { startApp } from "xmlui";
import { tonePersist, centerRow } from "animo-blocks";
import downloadGridExt from "./src/extensions/DownloadGrid";

const extensions = [tonePersist, centerRow, downloadGridExt];

export const runtime = import.meta.glob(`/src/**`, { eager: true });

startApp(runtime, extensions);

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    startApp(newModule?.runtime ?? runtime, extensions);
  });
}
