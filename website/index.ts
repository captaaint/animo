import { startApp } from "xmlui";
import tonePersistExt from "./src/extensions/TonePersist";
import centerRowExt from "./src/extensions/CenterRow";
import downloadGridExt from "./src/extensions/DownloadGrid";

const extensions = [tonePersistExt, centerRowExt, downloadGridExt];

export const runtime = import.meta.glob(`/src/**`, { eager: true });

startApp(runtime, extensions);

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    startApp(newModule?.runtime ?? runtime, extensions);
  });
}
