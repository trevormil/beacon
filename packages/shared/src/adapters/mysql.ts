import mysql from "mysql2/promise";
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

export class MysqlDal implements BeaconDal {
  private pool: mysql.Pool;

  constructor(url: string) {
    this.pool = mysql.createPool({ uri: url, connectionLimit: 10, namedPlaceholders: false });
  }

  async init(): Promise<void> {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS beacon_projects (
        id VARCHAR(64) PRIMARY KEY,
        slug VARCHAR(191) NOT NULL UNIQUE,
        public_key VARCHAR(191) NOT NULL UNIQUE,
        allowed_origins TEXT NOT NULL,
        target_repo VARCHAR(255),
        target_forge VARCHAR(64),
        meta TEXT NOT NULL,
        created_at BIGINT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS beacon_project_secrets (
        id VARCHAR(64) PRIMARY KEY,
        project_id VARCHAR(64) NOT NULL,
        secret_hash VARCHAR(128) NOT NULL,
        label VARCHAR(128) NOT NULL,
        created_at BIGINT NOT NULL,
        revoked_at BIGINT,
        INDEX beacon_secrets_proj_hash (project_id, secret_hash)
      )`,
      `CREATE TABLE IF NOT EXISTS beacon_feedback (
        id VARCHAR(64) PRIMARY KEY,
        project_id VARCHAR(64) NOT NULL,
        message TEXT NOT NULL,
        email VARCHAR(255),
        url VARCHAR(2048),
        user_agent VARCHAR(1024),
        viewport VARCHAR(32),
        status VARCHAR(32) NOT NULL DEFAULT 'new',
        created_at BIGINT NOT NULL,
        processed_at BIGINT,
        INDEX beacon_feedback_proj_status (project_id, status, created_at)
      )`,
    ];
    for (const stmt of ddl) await this.pool.query(stmt);
  }

  async close(): Promise<void> {
    await this.pool.end();
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
    await this.pool.query(
      `INSERT INTO beacon_projects
       (id, slug, public_key, allowed_origins, target_repo, target_forge, meta, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.id,
        p.slug,
        p.publicKey,
        JSON.stringify(p.allowedOrigins),
        p.targetRepo,
        p.targetForge,
        JSON.stringify(p.meta),
        p.createdAt,
      ],
    );
    return p;
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const [rows] = await this.pool.query(`SELECT * FROM beacon_projects WHERE slug = ?`, [slug]);
    const row = (rows as ProjectRow[])[0];
    return row ? this.rowToProject(row) : null;
  }

  async getProjectByPublicKey(publicKey: string): Promise<Project | null> {
    const [rows] = await this.pool.query(`SELECT * FROM beacon_projects WHERE public_key = ?`, [
      publicKey,
    ]);
    const row = (rows as ProjectRow[])[0];
    return row ? this.rowToProject(row) : null;
  }

  async listProjects(): Promise<Project[]> {
    const [rows] = await this.pool.query(`SELECT * FROM beacon_projects ORDER BY created_at DESC`);
    return (rows as ProjectRow[]).map((r) => this.rowToProject(r));
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
    await this.pool.query(
      `INSERT INTO beacon_project_secrets (id, project_id, secret_hash, label, created_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [s.id, s.projectId, s.secretHash, s.label, s.createdAt],
    );
    return s;
  }

  async listSecretsForProject(projectId: string): Promise<ProjectSecret[]> {
    const [rows] = await this.pool.query(
      `SELECT * FROM beacon_project_secrets WHERE project_id = ? ORDER BY created_at DESC`,
      [projectId],
    );
    return (rows as SecretRow[]).map(this.rowToSecret);
  }

  async revokeSecret(secretId: string): Promise<void> {
    await this.pool.query(`UPDATE beacon_project_secrets SET revoked_at = ? WHERE id = ?`, [
      Date.now(),
      secretId,
    ]);
  }

  async findActiveSecretByHash(
    projectId: string,
    secretHash: string,
  ): Promise<ProjectSecret | null> {
    const [rows] = await this.pool.query(
      `SELECT * FROM beacon_project_secrets
       WHERE project_id = ? AND secret_hash = ? AND revoked_at IS NULL LIMIT 1`,
      [projectId, secretHash],
    );
    const row = (rows as SecretRow[])[0];
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
    await this.pool.query(
      `INSERT INTO beacon_feedback
       (id, project_id, message, email, url, user_agent, viewport, status, created_at, processed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'new', ?, NULL)`,
      [fb.id, fb.projectId, fb.message, fb.email, fb.url, fb.userAgent, fb.viewport, fb.createdAt],
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
    params.push(limit);
    const [rows] = await this.pool.query(
      `SELECT * FROM beacon_feedback
       WHERE ${clauses.join(" AND ")}
       ORDER BY created_at ASC
       LIMIT ?`,
      params,
    );
    return (rows as FeedbackRow[]).map((r) => this.rowToFeedback(r));
  }

  async getFeedback(id: string): Promise<Feedback | null> {
    const [rows] = await this.pool.query(`SELECT * FROM beacon_feedback WHERE id = ?`, [id]);
    const row = (rows as FeedbackRow[])[0];
    return row ? this.rowToFeedback(row) : null;
  }

  async markFeedbackStatus(
    id: string,
    status: Exclude<FeedbackStatus, "new">,
  ): Promise<Feedback | null> {
    await this.pool.query(
      `UPDATE beacon_feedback SET status = ?, processed_at = ? WHERE id = ?`,
      [status, Date.now(), id],
    );
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
    revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
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
      processedAt: row.processed_at === null ? null : Number(row.processed_at),
    };
  }
}
