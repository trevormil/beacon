import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { createDal, detectDialect } from "./create-dal";
import { generatePublicKey, generateSecret, hashSecret, safeEqual } from "./keys";
import type { BeaconDal } from "./dal";

describe("detectDialect", () => {
  test("postgres", () => {
    expect(detectDialect("postgres://u:p@h:5432/db")).toBe("postgres");
    expect(detectDialect("postgresql://u:p@h/db")).toBe("postgres");
  });
  test("mysql", () => {
    expect(detectDialect("mysql://u:p@h:3306/db")).toBe("mysql");
  });
  test("mongo", () => {
    expect(detectDialect("mongodb://h:27017/db")).toBe("mongo");
    expect(detectDialect("mongodb+srv://h/db")).toBe("mongo");
  });
  test("sqlite", () => {
    expect(detectDialect("file:./data.db")).toBe("sqlite");
    expect(detectDialect("sqlite:///tmp/data.db")).toBe("sqlite");
    expect(detectDialect("./local.sqlite")).toBe("sqlite");
    expect(detectDialect(":memory:")).toBe("sqlite");
  });
  test("unknown throws", () => {
    expect(() => detectDialect("xyz://nope")).toThrow();
  });
});

describe("keys", () => {
  test("public key has pub_ prefix and is unique", () => {
    const a = generatePublicKey();
    const b = generatePublicKey();
    expect(a.startsWith("pub_")).toBe(true);
    expect(b.startsWith("pub_")).toBe(true);
    expect(a).not.toBe(b);
  });
  test("secret has sec_ prefix and hash is deterministic", async () => {
    const s = generateSecret();
    expect(s.startsWith("sec_")).toBe(true);
    const h1 = await hashSecret(s);
    const h2 = await hashSecret(s);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  test("safeEqual returns true for equal, false otherwise", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

describe("SqliteDal end-to-end", () => {
  let dal: BeaconDal;
  beforeAll(async () => {
    dal = await createDal(":memory:");
    await dal.init();
  });
  afterAll(async () => {
    await dal.close();
  });

  test("create project + lookup by slug and key", async () => {
    const pub = generatePublicKey();
    const p = await dal.createProject({
      slug: "demo",
      publicKey: pub,
      allowedOrigins: ["https://example.com"],
      targetRepo: "trevormil/demo",
      targetForge: "github",
      meta: { theme: { primary: "#3b82f6" } },
    });
    expect(p.id).toBeDefined();
    expect(p.slug).toBe("demo");
    expect(p.publicKey).toBe(pub);
    expect(p.allowedOrigins).toEqual(["https://example.com"]);
    expect(p.meta).toEqual({ theme: { primary: "#3b82f6" } });

    const bySlug = await dal.getProjectBySlug("demo");
    expect(bySlug?.id).toBe(p.id);
    const byKey = await dal.getProjectByPublicKey(pub);
    expect(byKey?.id).toBe(p.id);
  });

  test("create secret + lookup by hash + revoke", async () => {
    const proj = await dal.createProject({
      slug: "secret-test",
      publicKey: generatePublicKey(),
      allowedOrigins: [],
    });
    const sec = generateSecret();
    const hash = await hashSecret(sec);
    const s = await dal.createSecret({
      projectId: proj.id,
      secretHash: hash,
      label: "cli",
    });
    const found = await dal.findActiveSecretByHash(proj.id, hash);
    expect(found?.id).toBe(s.id);

    await dal.revokeSecret(s.id);
    const afterRevoke = await dal.findActiveSecretByHash(proj.id, hash);
    expect(afterRevoke).toBeNull();
  });

  test("insert feedback + list new + mark processed", async () => {
    const proj = await dal.createProject({
      slug: "feedback-test",
      publicKey: generatePublicKey(),
      allowedOrigins: [],
    });
    const fb = await dal.insertFeedback({
      projectId: proj.id,
      message: "site is broken on mobile",
      email: "user@example.com",
      url: "https://example.com/home",
      userAgent: "Mozilla/5.0",
    });
    expect(fb.status).toBe("new");

    const news = await dal.listFeedback({ projectId: proj.id, status: "new" });
    expect(news.length).toBe(1);
    expect(news[0]!.id).toBe(fb.id);

    const updated = await dal.markFeedbackStatus(fb.id, "processed");
    expect(updated?.status).toBe("processed");
    expect(updated?.processedAt).not.toBeNull();

    const remaining = await dal.listFeedback({ projectId: proj.id, status: "new" });
    expect(remaining.length).toBe(0);
  });
});
