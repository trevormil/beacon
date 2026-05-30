# Deploying Beacon on Kubernetes

The manifests under `k8s/` deploy Beacon to a single-node cluster with:

- `ingress-nginx` for HTTP routing
- `cert-manager` + `letsencrypt-prod` cluster issuer for TLS
- a 1 Gi block-storage PVC for SQLite (single replica, single-writer)
- a `ghcr-pull` secret in the `beacon` namespace for private image pulls

If your cluster has those four things, the deploy is one `kubectl apply -f k8s/` away.

## One-time setup

```bash
# 1. Build + push the image
docker buildx build \
  --platform linux/amd64 \
  -t ghcr.io/trevormil/beacon:latest \
  -f docker/Dockerfile \
  --push .

# 2. Create namespace
kubectl apply -f k8s/namespace.yaml

# 3. Create the GHCR pull secret (one-time; uses your existing GHCR PAT)
kubectl -n beacon create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username=$GH_USERNAME \
  --docker-password=$GH_PAT \
  --docker-email=$GH_EMAIL

# 4. Create the admin token secret
kubectl -n beacon create secret generic beacon-env \
  --from-literal=ADMIN_TOKEN=$(openssl rand -hex 32)

# 5. Apply the rest
kubectl apply -f k8s/pvc.yaml
kubectl apply -f k8s/deployment.yaml
kubectl apply -f k8s/service.yaml
kubectl apply -f k8s/ingress.yaml

# 6. Point DNS: beacon.trevormil.com A → ingress-nginx external IP
kubectl -n ingress-nginx get svc

# 7. Wait for the cert to issue
kubectl -n beacon get certificate beacon-trevormil-tls -w
```

## Re-deploying after a code change

```bash
docker buildx build --platform linux/amd64 -t ghcr.io/trevormil/beacon:latest -f docker/Dockerfile --push .
kubectl -n beacon rollout restart deployment beacon
kubectl -n beacon rollout status deployment beacon
```

## Verification

```bash
# Healthcheck
curl https://beacon.trevormil.com/healthz
# {"ok":true}

# Create your first project
ADMIN=$(kubectl -n beacon get secret beacon-env -o jsonpath='{.data.ADMIN_TOKEN}' | base64 -d)
bunx @beacon/cli admin create-project \
  --endpoint https://beacon.trevormil.com \
  --admin-token "$ADMIN" \
  --slug autopilot-harness \
  --origins https://autopilot.trevormil.com \
  --repo trevormil/autopilot-harness \
  --forge github
```

## Operational notes

- **Backup the PVC**: schedule a snapshot of the DO block-storage volume on a cadence that matches how much feedback loss you can tolerate.
- **Scale-up path**: change `DATABASE_URL` in `beacon-env` to a Postgres URL (Neon free tier or an in-cluster Postgres), then `replicas: 1 → 3` and switch strategy to `RollingUpdate`. SQLite scale-out is not supported.
- **CPU/memory headroom**: deployment requests 100m CPU / 128 Mi RAM; limits 500m / 256 Mi. Real load typically sits well under that — the heaviest path is the SHA-256 hash on secret verification.
- **Rate limit isolation**: the per-IP limiter is in-process. With a single replica that's fine; multi-replica deploys need an external (Redis-backed) limiter to be effective across pods.
