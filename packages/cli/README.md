# @trevormil/beacon

CLI client for [Beacon](https://github.com/trevormil/beacon) — the embeddable feedback widget that pipes submissions into your repo as tickets and (optionally) draft MRs.

```bash
# Poll new feedback as NDJSON
bunx @trevormil/beacon poll \
  --project my-app \
  --secret  sec_… \
  --endpoint https://beacon.example.com

# Run an agent per item; mark each processed on exit 0
bunx @trevormil/beacon process \
  --project my-app \
  --secret  sec_… \
  --repo    ~/code/my-app \
  --command 'codex exec -C {repo} "/ticket {feedback.message}\n/pr-creation"'

# Admin (requires ADMIN_TOKEN)
bunx @trevormil/beacon admin create-project \
  --slug my-app \
  --origins https://my.app,http://localhost:3000 \
  --admin-token $ADMIN_TOKEN
```

To run a Beacon API server, use the companion package:

```bash
bunx @trevormil/beacon-server
```

Full docs: **https://github.com/trevormil/beacon**

MIT.
