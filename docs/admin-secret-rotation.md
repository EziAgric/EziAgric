# Admin Secret Rotation Policy & Playbook

This policy documents the procedure for safely rotating the `ADMIN_SECRET_KEY` in production, staging, and development environments without causing downtime or disrupting operational signers.

---

## 1. Overview & Scope

The `ADMIN_SECRET_KEY` is a critical credential used by the Amana backend to sign Soroban contract invocations, execute administrative clawbacks, and process stream terminations.

### Rotation Frequency
- **Scheduled**: Every 90 days.
- **Unscheduled / Emergency**: Immediately upon suspected compromise, team member offboarding, or credential exposure alert.

---

## 2. Zero-Downtime Infrastructure Design

Kubernetes deployments are configured with a `RollingUpdate` strategy to ensure zero-downtime secret replacement:

```yaml
spec:
  replicas: 2
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1
      maxUnavailable: 0
```

When `amana-secrets` is updated and `kubectl rollout restart deployment/backend` is issued:
1. Kubernetes launches new backend pod replicas configured with the updated `ADMIN_SECRET_KEY`.
2. Old pods continue serving existing requests using the previous secret until new pods pass `readinessProbe` checks (`/health`).
3. Once new pods are confirmed ready, old pods are gracefully terminated.

---

## 3. Step-by-Step Rotation Procedure

### Step 1: Generate New Keypair
Generate a new Stellar keypair in an isolated, secure terminal environment:

```bash
# Using Stellar CLI or Node.js
node -e "const { Keypair } = require('@stellar/stellar-sdk'); const k = Keypair.random(); console.log('Secret:', k.secret()); console.log('Public:', k.publicKey());"
```

Record the new public key and store the secret key in AWS Secrets Manager / HashiCorp Vault.

### Step 2: Update Infrastructure Secret Manifest
Update the Kubernetes secret or environment configuration:

```bash
# Update K8s secret in cluster
kubectl create secret generic amana-secrets \
  --from-literal=ADMIN_SECRET_KEY="S..." \
  --dry-run=client -o yaml | kubectl apply -f -
```

### Step 3: Zero-Downtime Rollout Restart
Trigger a rolling update of the backend deployment:

```bash
kubectl rollout restart deployment/backend -n default
kubectl rollout status deployment/backend -n default --timeout=2m
```

### Step 4: Post-Rotation Validation
Execute the validation script to verify key format, public key derivation, and backend health status:

```bash
ADMIN_SECRET_KEY="S..." ./scripts/validate-admin-secret.sh http://api.amanavault.com
```

Confirm health check response:
```json
{
  "status": "up",
  "checks": {
    "adminSigningKey": {
      "status": "up",
      "message": "Admin signing key valid"
    }
  }
}
```

---

## 4. Rollback Procedure

If post-rotation validation fails or the backend health check returns `"status": "down"`:

1. **Immediate Rollback Command**:
   ```bash
   kubectl rollout undo deployment/backend -n default
   ```
2. **Restore Previous Secret**:
   Re-apply the previous `ADMIN_SECRET_KEY` in `amana-secrets` and verify backend health status:
   ```bash
   ./scripts/validate-admin-secret.sh http://api.amanavault.com
   ```
3. **Incident Log**:
   Log an operational incident report documenting the reason for rotation failure and error trace.
