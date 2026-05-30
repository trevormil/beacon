<p align="center">
  <img src="./logo.png" alt="Beacon" width="160" />
</p>

<h1 align="center">Beacon</h1>

<p align="center">
  <em>Embeddable feedback widget that pipelines user feedback straight into tickets and merge requests.</em>
</p>

---

## What this is

Beacon is an open-source, self-hostable alternative to Crisp / Intercom feedback widgets — with one critical addition. Beacon doesn't just collect feedback; it **pipes every submission into your engineering workflow**:

```
user clicks the bubble  →  POST /v1/feedback
                            (Beacon API + DB)
                                  │
              `bunx beacon process` polls on a schedule
                                  │
                            for each item:
                run `codex` / `claude` / any agent CLI
                            in your repo
                                  │
                  → opens a ticket
                  → opens an MR / PR
                  → marks the feedback processed
```

The result: end users speak in plain English; an agent translates it into a properly-scoped ticket and a branch with a draft fix.

## Three pieces

1. **Widget** — `<script src=".../beacon.js" data-project="pub_xxx">` drops a bottom-right chat bubble into any web app. ~10 KB.
2. **Server** — Hono + Bun. Stores feedback, scoped per project, with public/secret key auth.
3. **CLI** — `bunx beacon poll | mark | process | admin`. Polls the API and runs your agent of choice.

## Database support

Pick one — Beacon detects the dialect from `DATABASE_URL`:

| Dialect    | URL scheme                  | Driver                     |
| ---------- | --------------------------- | -------------------------- |
| Postgres   | `postgres://…`              | `drizzle-orm/postgres-js`  |
| MySQL      | `mysql://…`                 | `drizzle-orm/mysql2`       |
| SQLite     | `file:./data.db` or `sqlite://…` | `drizzle-orm/bun-sqlite` |
| MongoDB    | `mongodb://…`               | `mongodb` (native driver)  |

## Quickstart — embed the widget

```html
<script
  src="https://cdn.jsdelivr.net/npm/@trevormil/beacon-widget/dist/beacon.js"
  data-project="pub_your_public_key"
  data-endpoint="https://beacon.example.com"
  defer
></script>
```

That's it. The bubble appears bottom-right; submissions go to your Beacon API.

## Quickstart — self-host

```bash
git clone https://github.com/trevormil/beacon
cd beacon && bun install

# simplest: SQLite, single file, no compose
DATABASE_URL=file:./data.db ADMIN_TOKEN=$(openssl rand -hex 32) \
  bun run dev:server

# then create your first project
bunx beacon admin create-project \
  --slug my-app \
  --origins https://my.app,https://staging.my.app
# → prints pub_xxx and sec_xxx (sec is shown once)
```

Or use docker-compose for Postgres / MySQL / Mongo profiles — see `docker/`.

## Quickstart — pipe feedback into your repo

```bash
bunx beacon process \
  --project pub_xxx \
  --secret sec_xxx \
  --repo ~/code/my-app \
  --command 'codex exec -C {repo} "
    /ticket {feedback.message}
    /pr-creation
  "'
```

`{repo}` and `{feedback.*}` are substituted per item. Each item is marked processed on exit 0.

## TerMinal integration

If you use [TerMinal](https://github.com/trevormil/TerMinal), `beacon` ships as a core agent by default with a 15-min poll schedule and a cockpit widget showing unprocessed-feedback count.

## License

MIT
