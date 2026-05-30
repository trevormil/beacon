import { Database } from "bun:sqlite";
import type { BeaconDal } from "../dal";
import { randomId } from "../keys";
import type {
  CreateProjectInput,
  CreateSecretInput,
  Feedback,
  FeedbackStatus,
  InsertFeedbackInput,
  ListFeedbackOpts,
  Project,
  ProjectSecret,
} from "../types";

type ProjectRow = {
  id: string;
  slug: string;
  public_key: string;
  allowed_origins: string;
  target_repo: string | null;
  target_forge: string | null;
  meta: string;
  created_at: number;
};

type SecretRow = {
  id: string;
  project_id: string;
  secret_hash: string;
  label: string;
  created_at: number;
  revoked_at: number | null;
};

type FeedbackRow = {
  id: string;
  project_id: string;
  message: string;
  email: string | null;
  url: string | null;
  user_agent: string | null;
  viewport: string | null;
  status: string;
  created_at: number;
  processed_at: number | null;
};

export class SqliteDal implements BeaconDal {
  private db: Database;

  constructor(url: string) {
    const path = url.replace(/^sqlite:\/\//, "").replace(/^file:/, "") || ":memory:";
    this.db = new Database(path);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  async init(): Promise<void> {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS beacon_projects (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL UNIQUE,
        allowed_origins TEXT NOT NULL,
        target_repo TEXT,
        target_forge TEXT,
        meta TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS beacon_project_secrets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS beacon_feedback (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        message TEXT NOT NULL,
        email TEXT,
        url TEXT,
        user_agent TEXT,
        viewport TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at INTEGER NOT NULL,
        processed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS beacon_feedback_proj_status
        ON beacon_feedback(project_id, status, created_at);
      CREATE INDEX IF NOT EXISTS beacon_secrets_proj_hash
        ON beacon_project_secrets(project_id, secret_hash);
    `);
  }

  async close(): Promise<void> {
    this.db.close();
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const project: Project = {
      id: randomId(),
      slug: input.slug,
      publicKey: input.publicKey,
      allowedOrigins: input.allowedOrigins,
      targetRepo: input.targetRepo ?? null,
      targetForge: input.targetForge ?? null,
      meta: input.meta ?? {},
      createdAt: Date.now(),
    };
    this.db
      .prepare(
        `INSERT INTO beacon_projects
         (id, slug, public_key, allowed_origins, target_repo, target_forge, meta, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        project.id,
        project.slug,
        project.publicKey,
        JSON.stringify(project.allowedOrigins),
        project.targetRepo,
        project.targetForge,
        JSON.stringify(project.meta),
        project.createdAt,
      );
    return project;
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const row = this.db
      .prepare(`SELECT * FROM beacon_projects WHERE slug = ?`)
      .get(slug) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : null;
  }

  async getProjectByPublicKey(publicKey: string): Promise<Project | null> {
    const row = this.db
      .prepare(`SELECT * FROM beacon_projects WHERE public_key = ?`)
      .get(publicKey) as ProjectRow | undefined;
    return row ? this.rowToProject(row) : null;
  }

  async listProjects(): Promise<Project[]> {
    const rows = this.db
      .prepare(`SELECT * FROM beacon_projects ORDER BY created_at DESC`)
      .all() as ProjectRow[];
    return rows.map((r) => this.rowToProject(r));
  }

  async createSecret(input: CreateSecretInput): Promise<ProjectSecret> {
    const sec: ProjectSecret = {
      id: randomId(),
      projectId: input.projectId,
      secretHash: input.secretHash,
      label: input.label,
      createdAt: Date.now(),
      revokedAt: null,
    };
    this.db
      .prepare(
        `INSERT INTO beacon_project_secrets
         (id, project_id, secret_hash, label, created_at, revoked_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
      )
      .run(sec.id, sec.projectId, sec.secretHash, sec.label, sec.createdAt);
    return sec;
  }

  async listSecretsForProject(projectId: string): Promise<ProjectSecret[]> {
    const rows = this.db
      .prepare(
        `SELECT * FROM beacon_project_secrets WHERE project_id = ? ORDER BY created_at DESC`,
      )
      .all(projectId) as SecretRow[];
    return rows.map(this.rowToSecret);
  }

  async revokeSecret(secretId: string): Promise<void> {
    this.db
      .prepare(`UPDATE beacon_project_secrets SET revoked_at = ? WHERE id = ?`)
      .run(Date.now(), secretId);
  }

  async findActiveSecretByHash(
    projectId: string,
    secretHash: string,
  ): Promise<ProjectSecret | null> {
    const row = this.db
      .prepare(
        `SELECT * FROM beacon_project_secrets
         WHERE project_id = ? AND secret_hash = ? AND revoked_at IS NULL
         LIMIT 1`,
      )
      .get(projectId, secretHash) as SecretRow | undefined;
    return row ? this.rowToSecret(row) : null;
  }

  async insertFeedback(input: InsertFeedbackInput): Promise<Feedback> {
    const fb: Feedback = {
      id: randomId(),
      projectId: input.projectId,
      message: input.message,
      email: input.email ?? null,
      url: input.url ?? null,
      userAgent: input.userAgent ?? null,
      viewport: input.viewport ?? null,
      status: "new",
      createdAt: Date.now(),
      processedAt: null,
    };
    this.db
      .prepare(
        `INSERT INTO beacon_feedback
         (id, project_id, message, email, url, user_agent, viewport, status, created_at, processed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, NULL)`,
      )
      .run(
        fb.id,
        fb.projectId,
        fb.message,
        fb.email,
        fb.url,
        fb.userAgent,
        fb.viewport,
        fb.createdAt,
      );
    return fb;
  }

  async listFeedback(opts: ListFeedbackOpts): Promise<Feedback[]> {
    const clauses = ["project_id = ?"];
    const params: (string | number)[] = [opts.projectId];
    if (opts.status) {
      clauses.push("status = ?");
      params.push(opts.status);
    }
    if (opts.sinceMs !== undefined) {
      clauses.push("created_at >= ?");
      params.push(opts.sinceMs);
    }
    const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000));
    const rows = this.db
      .prepare(
        `SELECT * FROM beacon_feedback
         WHERE ${clauses.join(" AND ")}
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(...params, limit) as FeedbackRow[];
    return rows.map(this.rowToFeedback);
  }

  async getFeedback(id: string): Promise<Feedback | null> {
    const row = this.db
      .prepare(`SELECT * FROM beacon_feedback WHERE id = ?`)
      .get(id) as FeedbackRow | undefined;
    return row ? this.rowToFeedback(row) : null;
  }

  async markFeedbackStatus(
    id: string,
    status: Exclude<FeedbackStatus, "new">,
  ): Promise<Feedback | null> {
    const now = Date.now();
    this.db
      .prepare(`UPDATE beacon_feedback SET status = ?, processed_at = ? WHERE id = ?`)
      .run(status, now, id);
    return this.getFeedback(id);
  }

  private rowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      slug: row.slug,
      publicKey: row.public_key,
      allowedOrigins: JSON.parse(row.allowed_origins) as string[],
      targetRepo: row.target_repo,
      targetForge: row.target_forge,
      meta: JSON.parse(row.meta) as Record<string, unknown>,
      createdAt: row.created_at,
    };
  }

  private rowToSecret = (row: SecretRow): ProjectSecret => ({
    id: row.id,
    projectId: row.project_id,
    secretHash: row.secret_hash,
    label: row.label,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  });

  private rowToFeedback = (row: FeedbackRow): Feedback => ({
    id: row.id,
    projectId: row.project_id,
    message: row.message,
    email: row.email,
    url: row.url,
    userAgent: row.user_agent,
    viewport: row.viewport,
    status: row.status as FeedbackStatus,
    createdAt: row.created_at,
    processedAt: row.processed_at,
  });
}
