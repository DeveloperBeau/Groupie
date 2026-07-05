// Build the extension into dist/: bundle the TypeScript entry points and copy
// static assets. Load dist/ as the unpacked extension.
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "dist");
const watch = process.argv.includes("--watch");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

for (const file of ["manifest.json", "manager.html", "manager.css"]) {
  fs.copyFileSync(path.join(root, file), path.join(dist, file));
}
fs.cpSync(path.join(root, "icons"), path.join(dist, "icons"), {
  recursive: true,
});

const options = {
  entryPoints: {
    background: path.join(root, "src", "background.ts"),
    manager: path.join(root, "src", "manager", "main.ts"),
  },
  outdir: dist,
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: false,
  logLevel: "info",
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
} else {
  await esbuild.build(options);
}
