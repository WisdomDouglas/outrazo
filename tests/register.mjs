// Test-only loader registration (no production effect). Imported via
// `node --import` so the hooks below apply before test modules load.
import { register } from "node:module";

register("./hooks.mjs", import.meta.url);
