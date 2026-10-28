// Test-only ESM resolver (no production effect). Maps the project's `@/`
// alias to `src/` and probes TypeScript extensions so Node can execute the
// real TS sources directly. Used by `npm test`.
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, next) {
  let candidate = null;
  if (specifier.startsWith("@/")) {
    candidate = path.join(ROOT, "src", specifier.slice(2));
  } else if (specifier.startsWith("./") || specifier.startsWith("../")) {
    candidate = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
  }
  if (candidate) {
    for (const ext of [".ts", ".tsx", ".js", ".mjs"]) {
      const full = candidate.endsWith(ext) ? candidate : candidate + ext;
      if (existsSync(full)) {
        return { url: pathToFileURL(full).href, shortCircuit: true };
      }
    }
  }
  return next(specifier, context);
}
