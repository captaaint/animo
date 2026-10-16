import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom/server";

import { App, PAGE_TITLES } from "./App";

/** Server render used by scripts/prerender.mjs to emit static HTML per route. */
export function render(url: string): { html: string; title: string } {
  const html = renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  );
  return { html, title: PAGE_TITLES[url] ?? PAGE_TITLES["/"] };
}

export const routes = Object.keys(PAGE_TITLES);
