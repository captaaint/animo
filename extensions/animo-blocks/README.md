# animo-blocks

Shared XMLUI extension components used by `animo/web` and `animo/website`.

Consumed via a local `file:` dependency. The package exports source `.tsx`
files directly — Vite (which XMLUI uses) follows the `file:` symlink and
transpiles them through the normal pipeline.

## Components

- `tonePersist` — persists the active theme tone (light/dark) to
  `localStorage` and restores it without flashing the default tone.
- `keyListener` — non-visual window-level keyboard listener.
- `windowEvent` — non-visual window-level `CustomEvent` listener.
- `viewport` — headless viewport probe exposing
  `value.{isMobile,isDesktop,width,height}`.
- `centerRow` — horizontal flex container that centers wrapped items.

## Usage

```ts
import { animoBlocks } from "animo-blocks";

startApp(runtime, [...animoBlocks, ...otherExtensions]);
```

Or import one extension at a time:

```ts
import { tonePersist, viewport } from "animo-blocks";
```
