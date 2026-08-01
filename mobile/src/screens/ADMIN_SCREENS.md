# Admin Screens — Mobile

This document describes the admin-facing components and screens available in the mobile app.

---

## ClawbackHelpBanner

**Location:** `mobile/src/components/ClawbackHelpBanner.tsx`

A reusable, collapsible help banner designed for admin onboarding flows and token-stream management screens.

### Purpose

Provides in-context guidance about clawback semantics so admins understand the consequences of the action before confirming. The banner is collapsed by default to avoid UI clutter and can be toggled open with a single tap.

### Key behaviour

- **Collapsed by default** — only the "What is a clawback?" row is visible.
- **Press to expand/collapse** — the toggle button (`testID="clawback-help-toggle"`) cycles the panel.
- **Accessible** — `accessibilityRole="button"` and a descriptive `accessibilityLabel` update dynamically with state.

### Usage

```tsx
import { ClawbackHelpBanner } from '../components/ClawbackHelpBanner';

// Drop inside any admin screen, above the clawback action button:
<ClawbackHelpBanner />
```
