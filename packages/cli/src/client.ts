import type { Feedback } from "@beacon/shared";

export class BeaconClient {
  constructor(
    private readonly endpoint: string,
    private readonly secret: string,
  ) {}

  private url(path: string): string {
    return new URL(path, this.endpoint).toString();
  }

  async listFeedback(projectId: string, opts: { status?: string; sinceMs?: number; limit?: number } = {}): Promise<Feedback[]> {
    const u = new URL(this.url(`/v1/projects/${projectId}/feedback`));
    if (opts.status) u.searchParams.set("status", opts.status);
    if (opts.sinceMs !== undefined) u.searchParams.set("since", String(opts.sinceMs));
    if (opts.limit !== undefined) u.searchParams.set("limit", String(opts.limit));
    const res = await fetch(u, { headers: { authorization: `Bearer ${this.secret}` } });
    if (!res.ok) throw new Error(`listFeedback failed: ${res.status} ${await res.text()}`);
    const body = (await res.json()) as { items: Feedback[] };
    return body.items;
  }

  async markStatus(projectId: string, id: string, status: "processed" | "skipped"): Promise<void> {
    const res = await fetch(this.url(`/v1/projects/${projectId}/feedback/${id}/${status}`), {
      method: "POST",
      headers: { authorization: `Bearer ${this.secret}` },
    });
    if (!res.ok) throw new Error(`markStatus failed: ${res.status} ${await res.text()}`);
  }
}

export class AdminClient {
  constructor(
    private readonly endpoint: string,
    private readonly adminToken: string,
  ) {}

  private url(path: string): string {
    return new URL(path, this.endpoint).toString();
  }

  async createProject(input: {
    slug: string;
    allowedOrigins: string[];
    targetRepo?: string;
    targetForge?: "github" | "gitlab";
    theme?: Record<string, unknown>;
  }): Promise<{ project: { id: string; slug: string }; publicKey: string; secret: string }> {
    const res = await fetch(this.url("/v1/admin/projects"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.adminToken}`,
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(`createProject failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{
      project: { id: string; slug: string };
      publicKey: string;
      secret: string;
    }>;
  }

  async listProjects(): Promise<{ items: Array<{ id: string; slug: string; publicKey: string }> }> {
    const res = await fetch(this.url("/v1/admin/projects"), {
      headers: { authorization: `Bearer ${this.adminToken}` },
    });
    if (!res.ok) throw new Error(`listProjects failed: ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ items: Array<{ id: string; slug: string; publicKey: string }> }>;
  }
}
