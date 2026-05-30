# @trevormil/beacon-server

Hono + Bun API server for [Beacon](https://github.com/trevormil/beacon) — the embeddable feedback widget that pipes submissions into your repo as tickets and MRs.

Three-tier auth:

- `POST /v1/feedback` — public-key + origin allowlist + rate limit (the widget surface)
- `GET /v1/projects/:id/feedback` — `Bearer sec_…` (the CLI surface)
- `POST /v1/admin/*` — `Bearer $ADMIN_TOKEN` (the admin surface)

```bash
export ADMIN_TOKEN=$(openssl rand -hex 32)
export DATABASE_URL=file:./data.db   # or postgres://, mysql://, mongodb://
bunx @trevormil/beacon-server
# beacon: listening on http://0.0.0.0:4747
```

Four database dialects, picked from the `DATABASE_URL` scheme:

| Dialect    | URL scheme                       |
| ---------- | -------------------------------- |
| **SQLite** | `file:./data.db` / `:memory:`    |
| **Postgres** | `postgres://…`                 |
| **MySQL**  | `mysql://…`                      |
| **MongoDB** | `mongodb://…` / `mongodb+srv://…` |

Full docs, self-host recipes, k8s manifests: **https://github.com/trevormil/beacon**

MIT.
