import { startApp } from "xmlui";
import tonePersistExt from "./src/extensions/TonePersist";

const extensions = [tonePersistExt];

export const runtime = import.meta.glob(`/src/**`, { eager: true });

startApp(runtime, extensions);

if (import.meta.hot) {
  import.meta.hot.accept((newModule) => {
    startApp(newModule?.runtime ?? runtime, extensions);
  });
}
