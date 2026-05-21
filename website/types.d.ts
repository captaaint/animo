/// <reference types="vite/client" />

// Vite handles `import "./foo.css"` as a side-effect at build time; the
// triple-slash reference above should already cover this, but the xmlui
// CLI does not ship a tsconfig that picks vite/client up for every editor
// check — declare it explicitly so the IDE stops flagging the import.
declare module "*.css";
