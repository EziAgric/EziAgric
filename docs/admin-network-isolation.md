# Admin Network Isolation Policy & Architecture

This document describes the network isolation topology, security policy, and infrastructure manifests used to isolate admin endpoints (`/api/admin/*`) from unauthorized public access in the Amana infrastructure.

---

## 1. Intended Network Topology

Public exposure of administrative APIs introduces significant attack surface risks, including brute-force authentication attacks, replay attacks, and potential zero-day exploit vulnerabilities.

To neutralize these risks, Amana enforces strict **Network Isolation**:

```
[ Public Internet ] ───► [ Public Ingress ] ───► [ Frontend Service (80) ]
                               │
                       (Blocks /api/admin/*)
                               │
[ Corporate VPN / Mgmt ] ──► [ Internal Ingress ] ──► [ K8s NetworkPolicy ] ──► [ Backend Pods (:4000) ]
  (10.0.0.0/16, 172.16.0.0/12)   (admin.internal.amanavault.com)
```

1. **Public Edge**: The public ingress controller (`infra/k8s/ingress.yaml`) exposes `/` to frontend services and public API routes (`/api/auth`, `/api/trades`), while blocking external access to administrative routes (`/api/admin/*`).
2. **Internal Ingress**: Dedicated internal ingress (`infra/k8s/admin-ingress.yaml`) serves `admin.internal.amanavault.com` and enforces IP source range whitelisting (`10.0.0.0/16, 172.16.0.0/12`).
3. **Kubernetes NetworkPolicy**: Pod-level network isolation (`infra/k8s/admin-network-policy.yaml`) blocks non-whitelisted pod-to-pod and external traffic on port 4000.
4. **VPC Security Groups**: AWS Terraform security groups (`infra/terraform/modules/admin_isolation/main.tf`) restrict port 4000 / 443 ingress traffic strictly to management VPC CIDR blocks (`10.0.0.0/16`).

---

## 2. Infrastructure Manifests Summary

| Manifest File | Policy / Control | Scope |
|---------------|------------------|-------|
| `infra/k8s/admin-network-policy.yaml` | Kubernetes `NetworkPolicy` (`amana-admin-isolation`) | Enforces pod ingress filtering to trusted pods & CIDRs |
| `infra/k8s/admin-ingress.yaml` | Internal Ingress with `whitelist-source-range` | Restricts HTTP ingress to internal VPN / corporate subnets |
| `infra/terraform/modules/admin_isolation/main.tf` | AWS Security Group (`amana-staging-admin-sg`) | Restricts cloud VPC ingress for admin ports |
| `infra/terraform/environments/staging/main.tf` | Environment module attachment | Applies isolation module to staging VPC |

---

## 3. Security Review & Compliance

### Threat Vectors Mitigated
- **Public Endpoint Exposure**: Public internet scanners cannot hit or probe administrative routes (`/api/admin/*`).
- **Credential Harvesting / Brute Force**: Admin login and audit routes are invisible to unauthenticated external actors.
- **DDoS & Amplification**: Rate limiting (`RATE_LIMIT_CONFIG.admin`) paired with network level filtering prevents resource exhaustion on management workloads.

### Residual Risk & Safeguards
- **VPN Compromise**: If an attacker gains internal VPN access, JWT authentication (`authMiddleware`) and wallet signature verification (`adminMiddleware`) enforce mandatory identity authorization.
- **Audit Logging**: All admin route access attempts (both successful and denied) are logged to immutable audit streams via `adminAuditService`.

### Operational Audit Commands
To verify network policy active status in Kubernetes:
```bash
kubectl get netpol amana-admin-isolation -n default
kubectl describe ingress amana-admin-ingress -n default
```
