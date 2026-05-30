import { createDal } from "@beacon/shared";
import { createApp } from "./app";
import { loadConfig } from "./config";

const config = loadConfig();
const dal = await createDal(config.DATABASE_URL);
await dal.init();

const app = createApp(dal, config);

const server = Bun.serve({
  hostname: config.HOST,
  port: config.PORT,
  fetch: app.fetch,
});

console.log(`beacon: listening on http://${server.hostname}:${server.port}`);
console.log(`beacon: DATABASE_URL=${redact(config.DATABASE_URL)}`);
console.log(`beacon: admin=${config.ADMIN_TOKEN ? "enabled" : "disabled (set ADMIN_TOKEN to enable)"}`);

for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.on(sig, async () => {
    console.log(`beacon: received ${sig}, shutting down`);
    await dal.close();
    server.stop(true);
    process.exit(0);
  });
}

function redact(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//<redacted>@");
}
