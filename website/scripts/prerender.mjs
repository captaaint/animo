#!/usr/bin/env node
// Static prerender: renders every route with the server bundle (.ssr/) and
// writes it into the client build's HTML shell (dist-ssg/), one
// `<route>/index.html` per page. The client then hydrates.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const websiteDir = resolve(here, "..");
const outDir = join(websiteDir, "dist-ssg");
const ssrDir = join(websiteDir, ".ssr");

const { render, routes } = await import(pathToFileURL(join(ssrDir, "entry-server.js")).href);
const template = readFileSync(join(outDir, "index.html"), "utf8");

for (const route of routes) {
  const { html, title } = render(route);
  const page = template
    .replace("<!--app-html-->", html)
    .replace(/<title>.*?<\/title>/, `<title>${title}</title>`);
  const file = route === "/" ? join(outDir, "index.html") : join(outDir, route, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, page);
  console.log(`prerendered ${route} → ${file.slice(websiteDir.length + 1)}`);
}

rmSync(ssrDir, { recursive: true, force: true });
