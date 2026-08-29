# Loading states & skeletons

One skeleton language across the app, driven by design tokens. No bare spinners
for content areas, no unstyled gaps, no layout shift when real data arrives.

## Primitives

| Component | Use for |
| --- | --- |
| `Skeleton` (`@/components/ui`) | The atom. `variant="text" \| "rect" \| "circle"`, explicit `width`/`height` sized from real layout metrics |
| `SkeletonText` | Multi-line paragraph placeholder |
| `SkeletonCard` | Card-shaped surface (icon + title + N lines) |
| `SkeletonList` | Repeated row list (dashboard feeds, trade lists) |
| `LoadingState` | Route-segment / panel placeholder (`variant="card" \| "row" \| "inline"`) |
| `Spinner` | **Only** for in-button / inline affordances, never a content region |

### Tokens

| Token | Value | Role |
| --- | --- | --- |
| `bg-skeleton-base` | `#1A3D2C` (surface-2) | Resting fill |
| `bg-skeleton-sheen` | `rgba(240,245,241,0.08)` | Shimmer highlight |
| `animate-skeleton-pulse` | 1.6s opacity pulse | Resting motion (no reflow) |
| `animate-skeleton-shimmer` | 1.6s translateX sweep | Highlight sweep |

`motion-reduce` disables both animations automatically.

## CLS rules

1. A skeleton must occupy the **same box** its content will. Pass pixel
   `width`/`height` measured from the rendered component, not guesses.
2. Reserve space for async images/media with an aspect-ratio box.
3. Skeleton → content swap must not change container height. Match line counts
   and row counts to the typical payload.
4. Animations are opacity/transform only — never animate width/height/margin.

## Data-surface inventory

| Route / surface | Pattern | Boundary |
| --- | --- | --- |
| `/dashboard` header + stat cards | `Skeleton` header + 3× `SkeletonCard` | page-level `loading.tsx` |
| `/dashboard` activity feed | `SkeletonList rows={4}` | inline (client fetch) |
| `/trades` table | `TradesTableSkeleton` (rows of `Skeleton`) | inline (`loading` flag) |
| `/trades/[id]` detail | `LoadingState variant="card"` ×2 | route `loading.tsx` |
| `/trades/create` review totals | inline text `Skeleton` | inline |
| `/vault` + `/vault/manage` | 4× `LoadingState variant="card"` | inline (`isLoading`) |
| `/assets`, `/assets/[id]` | `LoadingState` | route segment |
| `/reputation` | `Skeleton` header + `RepScoreRing` placeholder | inline |
| `/mediator/disputes` list | `SkeletonList` | inline |
| `/admin/streams`, `/admin/audit` | `LoadingState variant="row"` list | inline |
| Wallet balance widget | inline `Skeleton width={80} height={16}` | inline |

> Any surface not listed here that fetches async data needs a row added and a
> skeleton wired before merge.

## Suspense boundary convention

- **Route-level** (`app/<segment>/loading.tsx`): first paint of a navigation —
  use `LoadingState` matching the page's primary layout.
- **Component-level** (`<Suspense>` / `isLoading` branch): secondary data that
  streams in after the shell — use the matching primitive from the inventory.

## CLS budget / Lighthouse CI

`frontend/lighthouserc.json` asserts `cumulative-layout-shift ≤ 0.02` (Web Vitals
"good" is ≤ 0.1; we hold a tighter internal budget) on the key routes. Wire into
CI:

```yaml
- run: pnpm build && npx --yes @lhci/cli@0.13.x autorun
```

A regression above budget fails the job.

## Slow-network manual pass

Chrome DevTools → Network → **Slow 4G** + CPU 4× throttle, then walk every route
in the inventory:

- [ ] Skeleton appears within 100ms of navigation (no blank flash)
- [ ] No layout jump when content replaces the skeleton (record with the
      Performance panel, confirm CLS ≈ 0)
- [ ] `prefers-reduced-motion` disables shimmer/pulse
- [ ] No spinner used where a skeleton belongs

Document date + build SHA of each pass in the PR.
