# TerMinal integration

[TerMinal](https://github.com/trevormil/TerMinal) ships **Beacon as a core agent by default** — no install step, no per-repo opt-in needed. Click "Process Beacon feedback" in the TerMinal agents panel and the running session drains your Beacon queue into backlog tickets.

## What the agent does

For each unprocessed feedback item in your Beacon project:

1. Reads the message, captured URL, user-agent, and (if provided) the user's email.
2. Files **one backlog ticket** via the project's `/ticket` skill — title, type, priority, full description including the raw feedback and follow-up email.
3. Groups several related feedback items into one ticket when they rhyme into the same underlying bug.
4. Marks each item processed via `bunx @beacon/cli mark` so the next run won't re-file it.

It **does not** edit code or open PRs. The `/factory` agent picks up the tickets it files and turns them into MRs.

## Connecting a repo to Beacon

The TerMinal agent resolves your Beacon connection in this order:

1. Env vars: `BEACON_ENDPOINT`, `BEACON_PROJECT`, `BEACON_SECRET`
2. `~/.config/beacon/config.json` (global default — your personal projects)
3. `.beacon/config.json` in the repo root (shared per-project config; gitignore the secret)

Pick whichever fits — env vars for CI, `~/.config/beacon/config.json` for a personal default, in-repo for explicit per-project pinning.

### One-time setup per project

```bash
# Spin up your Beacon instance (or use a hosted one)
DATABASE_URL=file:./data.db \
ADMIN_TOKEN=$(openssl rand -hex 32) \
  bunx @beacon/cli serve

# In another shell — create the project for this repo
bunx @beacon/cli admin create-project \
  --slug my-app \
  --origins https://my.app,https://staging.my.app \
  --repo trevormil/my-app \
  --forge github \
  --primary "#2b8fdb" \
  --admin-token $ADMIN_TOKEN

# Output prints pub_xxx + sec_xxx — save them:
mkdir -p ~/.config/beacon
cat > ~/.config/beacon/config.json <<EOF
{
  "endpoint": "http://localhost:4747",
  "project":  "my-app",
  "secret":   "sec_xxx"
}
EOF
```

### Embed the widget in your app

```html
<script
  src="https://cdn.jsdelivr.net/npm/@beacon/widget/dist/beacon.js"
  data-project="pub_xxx"
  data-endpoint="http://localhost:4747"
  defer
></script>
```

## Default schedule (optional)

To run the agent on a 15-min cron without clicking, add a schedule via TerMinal's `~/.config/TerMinal/schedules.json`:

```json
{
  "schedules": [
    {
      "id": "beacon-drain",
      "agentId": "beacon",
      "engine": "codex",
      "cadenceCron": "*/15 * * * *",
      "repoRoot": "/Users/you/code/my-app"
    }
  ]
}
```

Or use TerMinal's schedule UI to wire it via the Beacon-feedback agent's "Schedule" button.

## Cockpit widget — unprocessed-feedback counter

Add to `~/.config/TerMinal/widgets.json`:

```json
{
  "widgets": [
    {
      "id": "beacon-pending",
      "title": "Pending feedback",
      "icon": "RadioTower",
      "command": "bunx @beacon/cli poll --project my-app --secret $BEACON_SECRET --status new --limit 200 | wc -l",
      "intervalMs": 30000,
      "mode": "big"
    }
  ]
}
```

The cockpit will show a live count of unprocessed feedback items.
