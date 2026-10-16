import { StrictMode } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import { App } from "./App";
import "./styles.css";

const root = document.getElementById("root")!;
const app = (
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Prerendered pages (scripts/prerender.mjs) hydrate; the dev server renders fresh.
if (root.hasChildNodes()) hydrateRoot(root, app);
else createRoot(root).render(app);
