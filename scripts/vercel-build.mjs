// Builds the app into Vercel's Build Output API format (.vercel/output).
// Run by Vercel via the "vercel-build" npm script.
import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const run = (cmd, args) => {
  const result = spawnSync(cmd, args, { stdio: "inherit", env: { ...process.env, VERCEL: "1" } });
  if (result.status !== 0) process.exit(result.status ?? 1);
};

run("npx", ["vite", "build"]);

const out = ".vercel/output";
const fn = `${out}/functions/index.func`;

await rm(out, { recursive: true, force: true });
await mkdir(`${out}/functions`, { recursive: true });

await cp("dist/client", `${out}/static`, { recursive: true });
await cp("dist/server", fn, { recursive: true });

await writeFile(
  `${fn}/entry-src.mjs`,
  `import app from './server.js';\nexport default (request) => app.fetch(request);\n`,
);

// Vite leaves node_modules imports (react, react-dom, ...) external in the SSR
// output, but Vercel only ships the .func folder — bundle them in with esbuild.
const { build } = await import("esbuild");
await build({
  entryPoints: [`${fn}/entry-src.mjs`],
  outfile: `${fn}/entry.mjs`,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node22",
  banner: {
    js: [
      "import { createRequire as __vcCreateRequire } from 'node:module';",
      "import { fileURLToPath as __vcFileURLToPath } from 'node:url';",
      "import { dirname as __vcDirname } from 'node:path';",
      "const require = __vcCreateRequire(import.meta.url);",
      "const __filename = __vcFileURLToPath(import.meta.url);",
      "const __dirname = __vcDirname(__filename);",
    ].join("\n"),
  },
  logLevel: "info",
});
await rm(`${fn}/entry-src.mjs`, { force: true });
await writeFile(`${fn}/package.json`, JSON.stringify({ type: "module" }, null, 2));
await writeFile(
  `${fn}/.vc-config.json`,
  JSON.stringify(
    {
      runtime: "nodejs22.x",
      handler: "entry.mjs",
      launcherType: "Nodejs",
      shouldAddHelpers: false,
      supportsResponseStreaming: true,
    },
    null,
    2,
  ),
);

await writeFile(
  `${out}/config.json`,
  JSON.stringify(
    {
      version: 3,
      routes: [
        { src: "/assets/(.*)", headers: { "cache-control": "public, max-age=31536000, immutable" }, continue: true },
        { handle: "filesystem" },
        { src: "/(.*)", dest: "/index" },
      ],
    },
    null,
    2,
  ),
);

console.log("Vercel build output ready in .vercel/output");
