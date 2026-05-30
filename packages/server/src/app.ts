import { zValidator } from "@hono/zod-validator";
import {
  hashSecret,
  generatePublicKey,
  generateSecret,
  safeEqual,
  type BeaconDal,
  type Project,
} from "@beacon/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import type { Config } from "./config";
import { RateLimiter } from "./rate-limit";
import { CreateProjectInput, CreateSecretInput, FeedbackInput } from "./schemas";

type Env = {
  Variables: {
    project: Project;
  };
};

export function createApp(dal: BeaconDal, config: Config) {
  const app = new Hono<Env>();
  const feedbackLimiter = new RateLimiter(config.RATE_LIMIT_WINDOW_MS, config.RATE_LIMIT_MAX);

  app.use("*", logger());
  app.use(
    "/v1/*",
    cors({
      origin: (origin) => origin,
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["content-type", "authorization", "x-beacon-public-key"],
      maxAge: 600,
    }),
  );

  app.get("/healthz", (c) => c.json({ ok: true }));

  // ─── Public widget endpoints ───────────────────────────────────────────────

  app.get("/v1/projects/:publicKey/config", async (c) => {
    const pk = c.req.param("publicKey");
    const project = await dal.getProjectByPublicKey(pk);
    if (!project) return c.json({ error: "unknown project" }, 404);
    const meta = project.meta as { theme?: Record<string, unknown> };
    return c.json({
      slug: project.slug,
      theme: meta.theme ?? {},
      allowedOrigins: project.allowedOrigins,
    });
  });

  app.post("/v1/feedback", zValidator("json", FeedbackInput), async (c) => {
    const publicKey = c.req.header("x-beacon-public-key") ?? "";
    if (!publicKey.startsWith("pub_")) {
      return c.json({ error: "missing or malformed x-beacon-public-key" }, 401);
    }
    const project = await dal.getProjectByPublicKey(publicKey);
    if (!project) return c.json({ error: "unknown project" }, 401);

    if (project.allowedOrigins.length > 0) {
      const origin = c.req.header("origin") ?? "";
      const ok = project.allowedOrigins.some((allowed) => originMatches(origin, allowed));
      if (!ok) return c.json({ error: "origin not allowlisted" }, 403);
    }

    const ip = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
    const limit = feedbackLimiter.consume(`${project.id}:${ip}`);
    if (!limit.allowed) {
      c.header("retry-after", String(Math.ceil((limit.resetAt - Date.now()) / 1000)));
      return c.json({ error: "rate limited" }, 429);
    }

    const body = c.req.valid("json");
    const fb = await dal.insertFeedback({
      projectId: project.id,
      message: body.message,
      email: body.email ?? null,
      url: body.url ?? null,
      userAgent: c.req.header("user-agent") ?? null,
      viewport: body.viewport ?? null,
    });
    return c.json({ id: fb.id, status: fb.status, createdAt: fb.createdAt }, 201);
  });

  // ─── Secret-key auth'd project endpoints (for the CLI) ─────────────────────

  const projectAuth = async (
    c: import("hono").Context<Env>,
    next: () => Promise<void>,
  ): Promise<Response | void> => {
    const auth = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(sec_[A-Za-z0-9_\-]+)$/i.exec(auth);
    if (!m) return c.json({ error: "missing or malformed bearer secret" }, 401);
    const secret = m[1]!;
    const projectId = c.req.param("projectId");
    if (!projectId) return c.json({ error: "missing projectId" }, 400);
    const project = await dal.getProjectByPublicKey(projectId);
    const proj = project ?? (await dal.getProjectBySlug(projectId));
    if (!proj) return c.json({ error: "unknown project" }, 404);
    const hash = await hashSecret(secret);
    const found = await dal.findActiveSecretByHash(proj.id, hash);
    if (!found) return c.json({ error: "invalid or revoked secret" }, 401);
    c.set("project", proj);
    await next();
  };

  app.get("/v1/projects/:projectId/feedback", projectAuth, async (c) => {
    const project = c.get("project");
    const url = new URL(c.req.url);
    const status = url.searchParams.get("status") as
      | "new"
      | "processed"
      | "skipped"
      | null;
    const sinceMs = url.searchParams.get("since")
      ? Number(url.searchParams.get("since"))
      : undefined;
    const limit = url.searchParams.get("limit")
      ? Number(url.searchParams.get("limit"))
      : undefined;
    const items = await dal.listFeedback({
      projectId: project.id,
      status: status ?? "new",
      sinceMs,
      limit,
    });
    return c.json({ items });
  });

  app.post(
    "/v1/projects/:projectId/feedback/:id/processed",
    projectAuth,
    async (c) => {
      const id = c.req.param("id");
      const updated = await dal.markFeedbackStatus(id, "processed");
      if (!updated) return c.json({ error: "not found" }, 404);
      return c.json(updated);
    },
  );

  app.post(
    "/v1/projects/:projectId/feedback/:id/skipped",
    projectAuth,
    async (c) => {
      const id = c.req.param("id");
      const updated = await dal.markFeedbackStatus(id, "skipped");
      if (!updated) return c.json({ error: "not found" }, 404);
      return c.json(updated);
    },
  );

  // ─── Admin endpoints (ADMIN_TOKEN-gated) ───────────────────────────────────

  const adminAuth = async (
    c: import("hono").Context<Env>,
    next: () => Promise<void>,
  ): Promise<Response | void> => {
    if (!config.ADMIN_TOKEN) {
      return c.json({ error: "admin disabled (ADMIN_TOKEN not set)" }, 503);
    }
    const auth = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(auth);
    if (!m || !safeEqual(m[1]!, config.ADMIN_TOKEN)) {
      return c.json({ error: "invalid admin token" }, 401);
    }
    await next();
  };

  app.post("/v1/admin/projects", adminAuth, zValidator("json", CreateProjectInput), async (c) => {
    const input = c.req.valid("json");
    const existing = await dal.getProjectBySlug(input.slug);
    if (existing) return c.json({ error: "slug already exists" }, 409);
    const publicKey = generatePublicKey();
    const secret = generateSecret();
    const project = await dal.createProject({
      slug: input.slug,
      publicKey,
      allowedOrigins: input.allowedOrigins,
      targetRepo: input.targetRepo ?? null,
      targetForge: input.targetForge ?? null,
      meta: input.theme ? { theme: input.theme } : {},
    });
    await dal.createSecret({
      projectId: project.id,
      secretHash: await hashSecret(secret),
      label: "default",
    });
    return c.json({ project, publicKey, secret }, 201);
  });

  app.get("/v1/admin/projects", adminAuth, async (c) => {
    const items = await dal.listProjects();
    return c.json({ items });
  });

  app.post(
    "/v1/admin/projects/:projectId/secrets",
    adminAuth,
    zValidator("json", CreateSecretInput),
    async (c) => {
      const projectId = c.req.param("projectId");
      const project = await dal.getProjectBySlug(projectId);
      if (!project) return c.json({ error: "unknown project" }, 404);
      const secret = generateSecret();
      const stored = await dal.createSecret({
        projectId: project.id,
        secretHash: await hashSecret(secret),
        label: c.req.valid("json").label,
      });
      return c.json({ ...stored, secret }, 201);
    },
  );

  return app;
}

function originMatches(origin: string, allowed: string): boolean {
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const a = new URL(allowed);
    return o.protocol === a.protocol && o.host === a.host;
  } catch {
    return false;
  }
}
