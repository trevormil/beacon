import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createDal, type BeaconDal } from "@beacon/shared";
import { createApp } from "./app";
import type { Config } from "./config";

const ADMIN = "test-admin-token-do-not-use-in-prod";
const config: Config = {
  DATABASE_URL: ":memory:",
  ADMIN_TOKEN: ADMIN,
  PORT: 0,
  HOST: "127.0.0.1",
  RATE_LIMIT_WINDOW_MS: 60_000,
  RATE_LIMIT_MAX: 3,
};

let dal: BeaconDal;
let app: ReturnType<typeof createApp>;

beforeAll(async () => {
  dal = await createDal(":memory:");
  await dal.init();
  app = createApp(dal, config);
});
afterAll(async () => {
  await dal.close();
});

async function createProject(input: Record<string, unknown>) {
  const res = await app.request("/v1/admin/projects", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ADMIN}`,
    },
    body: JSON.stringify(input),
  });
  return { res, body: (await res.json()) as Record<string, unknown> };
}

describe("healthcheck", () => {
  test("/healthz returns ok", async () => {
    const res = await app.request("/healthz");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("admin createProject", () => {
  test("rejects without bearer", async () => {
    const res = await app.request("/v1/admin/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slug: "x", allowedOrigins: ["https://x.com"] }),
    });
    expect(res.status).toBe(401);
  });

  test("creates a project and returns public + secret once", async () => {
    const { res, body } = await createProject({
      slug: "demo-app",
      allowedOrigins: ["https://demo.example.com"],
      theme: { primary: "#3b82f6", title: "Tell us anything" },
    });
    expect(res.status).toBe(201);
    expect(body.publicKey).toMatch(/^pub_/);
    expect(body.secret).toMatch(/^sec_/);
    const proj = body.project as { id: string; slug: string; meta: Record<string, unknown> };
    expect(proj.slug).toBe("demo-app");
    expect((proj.meta.theme as { primary: string }).primary).toBe("#3b82f6");
  });

  test("rejects duplicate slug", async () => {
    await createProject({ slug: "dup", allowedOrigins: ["https://dup.example.com"] });
    const second = await createProject({
      slug: "dup",
      allowedOrigins: ["https://dup.example.com"],
    });
    expect(second.res.status).toBe(409);
  });
});

describe("public widget submission flow", () => {
  let publicKey = "";
  let secret = "";
  beforeAll(async () => {
    const { body } = await createProject({
      slug: "widget-flow",
      allowedOrigins: ["https://wf.example.com"],
    });
    publicKey = body.publicKey as string;
    secret = body.secret as string;
  });

  test("config endpoint returns theme + slug", async () => {
    const res = await app.request(`/v1/projects/${publicKey}/config`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { slug: string };
    expect(body.slug).toBe("widget-flow");
  });

  test("rejects missing public-key header", async () => {
    const res = await app.request("/v1/feedback", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://wf.example.com" },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(401);
  });

  test("rejects disallowed origin", async () => {
    const res = await app.request("/v1/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beacon-public-key": publicKey,
        origin: "https://evil.example.com",
      },
      body: JSON.stringify({ message: "hi" }),
    });
    expect(res.status).toBe(403);
  });

  test("accepts valid submission and persists it", async () => {
    const res = await app.request("/v1/feedback", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-beacon-public-key": publicKey,
        origin: "https://wf.example.com",
        "user-agent": "TestBot/1.0",
      },
      body: JSON.stringify({
        message: "the export button is busted",
        email: "user@example.com",
        url: "https://wf.example.com/dashboard",
      }),
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { id: string; status: string };
    expect(body.status).toBe("new");
  });

  test("rate-limit kicks in after RATE_LIMIT_MAX", async () => {
    const headers = {
      "content-type": "application/json",
      "x-beacon-public-key": publicKey,
      origin: "https://wf.example.com",
      "x-forwarded-for": "10.0.0.42",
    };
    const body = JSON.stringify({ message: "spam" });
    // RATE_LIMIT_MAX is 3 — first 3 succeed, 4th gets 429.
    for (let i = 0; i < 3; i++) {
      const ok = await app.request("/v1/feedback", { method: "POST", headers, body });
      expect(ok.status).toBe(201);
    }
    const blocked = await app.request("/v1/feedback", { method: "POST", headers, body });
    expect(blocked.status).toBe(429);
  });

  test("listFeedback with secret returns new items, mark-processed empties the queue", async () => {
    const list1 = await app.request(`/v1/projects/widget-flow/feedback?status=new`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    expect(list1.status).toBe(200);
    const body1 = (await list1.json()) as { items: { id: string }[] };
    expect(body1.items.length).toBeGreaterThan(0);

    for (const item of body1.items) {
      const mark = await app.request(
        `/v1/projects/widget-flow/feedback/${item.id}/processed`,
        {
          method: "POST",
          headers: { authorization: `Bearer ${secret}` },
        },
      );
      expect(mark.status).toBe(200);
    }

    const list2 = await app.request(`/v1/projects/widget-flow/feedback?status=new`, {
      headers: { authorization: `Bearer ${secret}` },
    });
    const body2 = (await list2.json()) as { items: { id: string }[] };
    expect(body2.items.length).toBe(0);
  });

  test("rejects bad secret", async () => {
    const res = await app.request(`/v1/projects/widget-flow/feedback`, {
      headers: { authorization: `Bearer sec_invalidvalue` },
    });
    expect(res.status).toBe(401);
  });
});
