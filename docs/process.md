# Processing feedback into tickets + MRs

The CLI's `process` command turns Beacon submissions into engineering work: it polls, runs your agent of choice per item, and marks items processed on success.

## Anatomy

```
bunx @trevormil/beacon process \
  --project <slug-or-public-key> \
  --secret  <sec_…>             # or $BEACON_SECRET
  --endpoint https://…          # or $BEACON_ENDPOINT (default: http://localhost:4747)
  --repo /absolute/path/to/repo
  --command '<shell-template>'  # {repo} and {feedback.*} are substituted
  [--limit 20]                  # max items per run
  [--dry-run]                   # show what would run; don't invoke or mark
```

Per item, Beacon:

1. Substitutes `{repo}`, `{feedback.id}`, `{feedback.message}`, `{feedback.email}`, `{feedback.url}`, `{feedback.userAgent}`, `{feedback.viewport}`, `{feedback.createdAt}` into the command template.
2. Runs the command via `/bin/sh -c …` with inherited stdio (so you see agent output live).
3. On exit 0 → marks the feedback processed.
4. On non-zero exit → leaves it as `new` so the next run retries it.

## Common patterns

### File a ticket per item (with the `/ticket` skill)

```bash
bunx @trevormil/beacon process \
  --project my-app \
  --repo ~/code/my-app \
  --command 'codex exec -C {repo} "/ticket {feedback.message}"'
```

### Ticket + draft MR via Claude Code

```bash
bunx @trevormil/beacon process \
  --project my-app \
  --repo ~/code/my-app \
  --command 'claude --cwd {repo} "/ticket {feedback.message}\n/pr-creation"'
```

### Group-then-process: dump the queue to JSON, hand-roll the loop

```bash
bunx @trevormil/beacon poll --project my-app --status new > queue.ndjson
jq -s . queue.ndjson | codex exec -C ~/code/my-app \
  "/triage-batch < batch.json — file one ticket per cluster"

# Then mark each item processed
while read id; do bunx @trevormil/beacon mark "$id" --project my-app; done < <(jq -r .id queue.ndjson)
```

### Email notification only (no agent)

```bash
bunx @trevormil/beacon process \
  --project my-app \
  --repo /tmp \
  --command 'echo "{feedback.message}" | mail -s "Beacon: {feedback.id}" you@example.com'
```

## Scheduling

Beacon doesn't include a scheduler — pick the tool that fits:

- **TerMinal**: built-in (`schedules.json`); the `beacon` core agent ships with a 15-min default cadence option.
- **launchd** (macOS): write a plist under `~/Library/LaunchAgents/`.
- **systemd** (Linux): a `.timer` unit calling a `.service` unit.
- **cron**: `*/15 * * * * cd ~/code/my-app && bunx @trevormil/beacon process …`
- **GitHub Actions**: a scheduled workflow that runs the CLI in the repo.

## Failure handling

- Network errors → exception, exit non-zero, processed count is reported in the summary.
- Agent fails on item → item stays `new`, next run retries. Use `--limit` so a stuck item doesn't block the whole queue.
- Want to give up on an item? `bunx @trevormil/beacon mark <id> --project … --skipped`.

## What this is NOT

- Not a queue with retry semantics. Items just stay `new` until you mark them. Build retry caps into your command if you need them.
- Not a webhook delivery system. Beacon is poll-only by design — the agent's pace, not the API's pace, controls the work rate.
