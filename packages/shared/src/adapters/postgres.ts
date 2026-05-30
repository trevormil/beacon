import postgres from "postgres";
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
  created_at: string | number;
};

type SecretRow = {
  id: string;
  project_id: string;
  secret_hash: string;
  label: string;
  created_at: string | number;
  revoked_at: string | number | null;
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
  created_at: string | number;
  processed_at: string | number | null;
};

const toMs = (v: string | number | null): number | null =>
  v === null ? null : typeof v === "string" ? Number(v) : v;

export class PostgresDal implements BeaconDal {
  private sql: postgres.Sql;

  constructor(url: string) {
    this.sql = postgres(url, { max: 10, idle_timeout: 30 });
  }

  async init(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS beacon_projects (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        public_key TEXT NOT NULL UNIQUE,
        allowed_origins TEXT NOT NULL,
        target_repo TEXT,
        target_forge TEXT,
        meta TEXT NOT NULL DEFAULT '{}',
        created_at BIGINT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS beacon_project_secrets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        label TEXT NOT NULL,
        created_at BIGINT NOT NULL,
        revoked_at BIGINT
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
        created_at BIGINT NOT NULL,
        processed_at BIGINT
      );
      CREATE INDEX IF NOT EXISTS beacon_feedback_proj_status
        ON beacon_feedback(project_id, status, created_at);
      CREATE INDEX IF NOT EXISTS beacon_secrets_proj_hash
        ON beacon_project_secrets(project_id, secret_hash);
    `);
  }

  async close(): Promise<void> {
    await this.sql.end({ timeout: 5 });
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const p: Project = {
      id: randomId(),
      slug: input.slug,
      publicKey: input.publicKey,
      allowedOrigins: input.allowedOrigins,
      targetRepo: input.targetRepo ?? null,
      targetForge: input.targetForge ?? null,
      meta: input.meta ?? {},
      createdAt: Date.now(),
    };
    await this.sql`
      INSERT INTO beacon_projects (id, slug, public_key, allowed_origins, target_repo, target_forge, meta, created_at)
      VALUES (${p.id}, ${p.slug}, ${p.publicKey}, ${JSON.stringify(p.allowedOrigins)},
              ${p.targetRepo}, ${p.targetForge}, ${JSON.stringify(p.meta)}, ${p.createdAt})
    `;
    return p;
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const [row] =
      await this.sql<ProjectRow[]>`SELECT * FROM beacon_projects WHERE slug = ${slug}`;
    return row ? this.rowToProject(row) : null;
  }

  async getProjectByPublicKey(publicKey: string): Promise<Project | null> {
    const [row] =
      await this.sql<ProjectRow[]>`SELECT * FROM beacon_projects WHERE public_key = ${publicKey}`;
    return row ? this.rowToProject(row) : null;
  }

  async listProjects(): Promise<Project[]> {
    const rows =
      await this.sql<ProjectRow[]>`SELECT * FROM beacon_projects ORDER BY created_at DESC`;
    return rows.map((r) => this.rowToProject(r));
  }

  async createSecret(input: CreateSecretInput): Promise<ProjectSecret> {
    const s: ProjectSecret = {
      id: randomId(),
      projectId: input.projectId,
      secretHash: input.secretHash,
      label: input.label,
      createdAt: Date.now(),
      revokedAt: null,
    };
    await this.sql`
      INSERT INTO beacon_project_secrets (id, project_id, secret_hash, label, created_at, revoked_at)
      VALUES (${s.id}, ${s.projectId}, ${s.secretHash}, ${s.label}, ${s.createdAt}, NULL)
    `;
    return s;
  }

  async listSecretsForProject(projectId: string): Promise<ProjectSecret[]> {
    const rows = await this.sql<SecretRow[]>`
      SELECT * FROM beacon_project_secrets WHERE project_id = ${projectId} ORDER BY created_at DESC
    `;
    return rows.map(this.rowToSecret);
  }

  async revokeSecret(secretId: string): Promise<void> {
    await this.sql`UPDATE beacon_project_secrets SET revoked_at = ${Date.now()} WHERE id = ${secretId}`;
  }

  async findActiveSecretByHash(
    projectId: string,
    secretHash: string,
  ): Promise<ProjectSecret | null> {
    const [row] = await this.sql<SecretRow[]>`
      SELECT * FROM beacon_project_secrets
      WHERE project_id = ${projectId} AND secret_hash = ${secretHash} AND revoked_at IS NULL
      LIMIT 1
    `;
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
    await this.sql`
      INSERT INTO beacon_feedback (id, project_id, message, email, url, user_agent, viewport, status, created_at, processed_at)
      VALUES (${fb.id}, ${fb.projectId}, ${fb.message}, ${fb.email}, ${fb.url},
              ${fb.userAgent}, ${fb.viewport}, 'new', ${fb.createdAt}, NULL)
    `;
    return fb;
  }

  async listFeedback(opts: ListFeedbackOpts): Promise<Feedback[]> {
    const limit = Math.max(1, Math.min(opts.limit ?? 100, 1000));
    const status = opts.status ?? null;
    const since = opts.sinceMs ?? null;
    const rows = await this.sql<FeedbackRow[]>`
      SELECT * FROM beacon_feedback
      WHERE project_id = ${opts.projectId}
        AND (${status}::text IS NULL OR status = ${status})
        AND (${since}::bigint IS NULL OR created_at >= ${since})
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows.map((r) => this.rowToFeedback(r));
  }

  async getFeedback(id: string): Promise<Feedback | null> {
    const [row] =
      await this.sql<FeedbackRow[]>`SELECT * FROM beacon_feedback WHERE id = ${id}`;
    return row ? this.rowToFeedback(row) : null;
  }

  async markFeedbackStatus(
    id: string,
    status: Exclude<FeedbackStatus, "new">,
  ): Promise<Feedback | null> {
    const now = Date.now();
    await this.sql`UPDATE beacon_feedback SET status = ${status}, processed_at = ${now} WHERE id = ${id}`;
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
      createdAt: Number(row.created_at),
    };
  }

  private rowToSecret = (row: SecretRow): ProjectSecret => ({
    id: row.id,
    projectId: row.project_id,
    secretHash: row.secret_hash,
    label: row.label,
    createdAt: Number(row.created_at),
    revokedAt: toMs(row.revoked_at),
  });

  private rowToFeedback(row: FeedbackRow): Feedback {
    return {
      id: row.id,
      projectId: row.project_id,
      message: row.message,
      email: row.email,
      url: row.url,
      userAgent: row.user_agent,
      viewport: row.viewport,
      status: row.status as FeedbackStatus,
      createdAt: Number(row.created_at),
      processedAt: toMs(row.processed_at),
    };
  }
}
