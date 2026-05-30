import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDal, type BeaconDal } from "@trevormil/beacon-shared";
import { createApp } from "@trevormil/beacon-server/src/app";
import type { Config } from "@trevormil/beacon-server/src/config";
import { AdminClient, BeaconClient } from "./client";

const ADMIN = "test-admin-cli-token";
const config: Config = {
  DATABASE_URL: ":memory:",
  ADMIN_TOKEN: ADMIN,
  PORT: 0,
  HOST: "127.0.0.1",
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 100,
};

let dal: BeaconDal;
let server: ReturnType<typeof Bun.serve>;
let endpoint: string;

beforeAll(async () => {
  dal = await createDal(":memory:");
  await dal.init();
  const app = createApp(dal, config);
  server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: app.fetch });
  endpoint = `http://${server.hostname}:${server.port}`;
});
afterAll(async () => {
  server.stop(true);
  await dal.close();
});

describe("CLI clients end-to-end against live server", () => {
  let publicKey = "";
  let secret = "";

  test("admin createProject + listProjects", async () => {
    const admin = new AdminClient(endpoint, ADMIN);
    const created = await admin.createProject({
      slug: "cli-test",
      allowedOrigins: ["https://cli.example.com"],
      targetRepo: "trevormil/cli-test",
      targetForge: "github",
      theme: { primary: "#2b6fd1" },
    });
    expect(created.publicKey).toMatch(/^pub_/);
    expect(created.secret).toMatch(/^sec_/);
    publicKey = created.publicKey;
    secret = created.secret;

    const list = await admin.listProjects();
    expect(list.items.some((p) => p.slug === "cli-test")).toBe(true);
  });

  test("BeaconClient lists new feedback + marks processed", async () => {
    // seed two feedback items directly via the widget endpoint
    for (let i = 0; i < 2; i++) {
      const res = await fetch(`${endpoint}/v1/feedback`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-beacon-public-key": publicKey,
          origin: "https://cli.example.com",
        },
        body: JSON.stringify({ message: `feedback-${i}` }),
      });
      expect(res.status).toBe(201);
    }

    const client = new BeaconClient(endpoint, secret);
    const items = await client.listFeedback("cli-test", { status: "new" });
    expect(items.length).toBe(2);

    await client.markStatus("cli-test", items[0]!.id, "processed");
    const afterOne = await client.listFeedback("cli-test", { status: "new" });
    expect(afterOne.length).toBe(1);
    expect(afterOne[0]!.id).toBe(items[1]!.id);
  });

  test("bad secret throws", async () => {
    const bad = new BeaconClient(endpoint, "sec_invalid");
    await expect(bad.listFeedback("cli-test")).rejects.toThrow();
  });
});
