#!/usr/bin/env bun
import { rm, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const root = import.meta.dir;
const out = join(root, "dist");
const args = new Set(process.argv.slice(2));
const watch = args.has("--watch");
const serve = args.has("--serve");

await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });

async function build(): Promise<void> {
  const result = await Bun.build({
    entrypoints: [join(root, "src/index.ts")],
    outdir: out,
    naming: "beacon.js",
    target: "browser",
    format: "iife",
    minify: !watch,
    sourcemap: watch ? "inline" : "none",
  });
  if (!result.success) {
    for (const log of result.logs) console.error(log);
    process.exitCode = 1;
    return;
  }
  const sz = (await stat(join(out, "beacon.js"))).size;
  console.log(`[beacon] built dist/beacon.js (${(sz / 1024).toFixed(1)} KB)${watch ? " — watching" : ""}`);
}

await build();

if (watch) {
  const fs = await import("node:fs");
  fs.watch(join(root, "src"), { recursive: true }, () => {
    void build();
  });
}

if (serve) {
  const port = 4848;
  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/" || url.pathname === "/demo.html") {
        return new Response(Bun.file(join(root, "demo.html")));
      }
      if (url.pathname === "/beacon.js") {
        return new Response(Bun.file(join(out, "beacon.js")), {
          headers: { "content-type": "application/javascript" },
        });
      }
      return new Response("not found", { status: 404 });
    },
  });
  console.log(`[beacon] demo at http://localhost:${port}`);
}
