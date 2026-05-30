# Amana — Open Source GitHub Issues
> Trust as a Service for Agricultural products · Stellar Network (Soroban)
> Frontend: Next.js + Tailwind CSS

---

## 🗂️ Issue Sequence Overview

| # | Layer | Title | Label | Milestone |
|---|-------|-------|-------|-----------|
| 1 | Tailwind Config | Configure Tailwind design tokens & colors | `design-system` | `Phase 1: MVP` |
| 2 | Tailwind Config | Configure global typography & `next/font` | `design-system` | `Phase 1: MVP` |
| 3 | Tailwind Config | Configure spacing, radius & shadow utilities | `design-system` | `Phase 1: MVP` |
| 4 | Atom | `<Button>` — Primary, Secondary, Ghost variants | `component` `atom` | `Phase 1: MVP` |
| 5 | Atom | `<Badge>` — Status badge component | `component` `atom` | `Phase 1: MVP` |
| 6 | Atom | `<InputField>` — Text input with label & validation | `component` `atom` | `Phase 1: MVP` |
| 7 | Atom | `<Avatar>` — User/entity avatar | `component` `atom` | `Phase 1: MVP` |
| 8 | Atom | `<Icon>` — Icon wrapper component | `component` `atom` | `Phase 1: MVP` |
| 9 | Atom | `<Spinner>` / `<LoadingState>` — Loading indicator | `component` `atom` | `Phase 1: MVP` |
| 10 | Atom | `<Divider>` — Horizontal and vertical divider | `component` `atom` | `Phase 1: MVP` |
| 11 | Molecule | `<StatusBadge>` — Trade status badge with icon | `component` `molecule` | `Phase 1: MVP` |
| 12 | Molecule | `<StepIndicator>` — Multi-step progress indicator | `component` `molecule` | `Phase 1: MVP` |
| 13 | Molecule | `<FormField>` — Label + Input + Error message group | `component` `molecule` | `Phase 1: MVP` |
| 14 | Molecule | `<TradeAmountRow>` — Amount display (NGN/USDC) | `component` `molecule` | `Phase 1: MVP` |
| 15 | Molecule | `<WalletAddressBadge>` — Truncated wallet address display | `component` `molecule` | `Phase 1: MVP` |
| 16 | Molecule | `<TimelineItem>` — Single step in a transaction timeline | `component` `molecule` | `Phase 1: MVP` |
| 19 | Organism | `<SideNavBar>` — Persistent sidebar navigation | `component` `organism` | `Phase 1: MVP` |
| 20 | Organism | `<TopAppBar>` — Top navigation bar with user profile | `component` `organism` | `Phase 1: MVP` |
| 21 | Organism | `<BentoCard>` — Reusable bento grid content card | `component` `organism` | `Phase 1: MVP` |
| 24 | Organism | `<PaymentOverviewCard>` — Escrow breakdown & 1% fee | `component` `organism` | `Phase 1: MVP` |
| 25 | Organism | `<TransactionTimeline>` — Chronological trade events | `component` `organism` | `Phase 1: MVP` |
| 26 | Organism | `<TradeListItem>` — Trade row in dashboard list | `component` `organism` | `Phase 1: MVP` |
| 27 | Organism | `<TradeDetailPanel>` — Full expanded trade detail view | `component` `organism` | `Phase 1: MVP` |
| 30 | Organism | `<SuccessState>` — Reusable success confirmation screen | `component` `organism` | `Phase 1: MVP` |
| 31 | Screen | `Amana Vault Dashboard` page | `page` `screen` | `Phase 1: MVP` |
| 32 | Screen | `Trade Dashboard` page | `page` `screen` | `Phase 1: MVP` |
| 33 | Screen | `Trade Detail View` page | `page` `screen` | `Phase 1: MVP` |
| 35 | Screen | `Create Trade` — 3-step agricultural escrow flow | `page` `flow` | `Phase 1: MVP` |
| 23 | Organism | `<ContractDetailsCard>` — Contract details & Loss Ratio | `component` `organism` | `Phase 2: Agreement` |
| 28 | Organism | `<LegalDisclaimerModal>` — Loss-Sharing terms modal | `component` `organism` | `Phase 2: Agreement` |
| 34 | Screen | `Mediator Resolution Panel` page | `page` `screen` | `Phase 2: Agreement` |
| 22 | Organism | `<VideoUploadCard>` — Video Evidence Upload / Verification | `component` `organism` | `Phase 3: Proof` |
| 29 | Organism | `<DriverManifestForm>` — Driver/Vehicle details | `component` `organism` | `Phase 3: Proof` |
| 36 | Screen | `Dispute / Verification` — Video Proof upload flow | `page` `flow` | `Phase 3: Proof` |
| 17 | Molecule | `<RepScoreRing>` — Trust Score ring/gauge | `component` `molecule` | `Phase 4: Launch` |
| 18 | Molecule | `<PartnerLogo>` — Institutional cooperative logo display | `component` `molecule` | `Phase 4: Launch` |
| 37 | Screen | `Reputation Profile` — Trust Score overview | `page` `screen` | `Phase 4: Launch`

---

## Phase 1: MVP

---

### Issue #1 — — Configure Tailwind design tokens & colors
**Labels:** `design-system` `good first issue`
**Milestone:** Phase 1: MVP

#### Description
Map the Amana design token colors into the `tailwind.config.ts` file. This allows all components to consume the Figma colors directly via Tailwind utility classes (e.g. `bg-primary`, `text-gold`). No raw hex values or raw CSS variables are permitted in component code.

#### Background
The Figma file defines a complete token set grouped into: colors (bg, accent, text, status, border, gradient).

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Extend the `colors` object in `tailwind.config.ts`
- **Background colors:** `bg-primary: #0B1A14`, `bg-card: #122A1F`, `bg-elevated: #1A3D2C`, `bg-input: #0F2219`, `bg-overlay: rgba(11,26,20,0.85)`
- **Accent colors:** `gold: #D4A853`, `gold-hover: #E0BA6A`, `gold-muted: rgba(212,168,83,0.15)`, `emerald: #34D399`, `emerald-muted: rgba(52,211,153,0.15)`, `teal: #14B8A6`
- **Text colors:** `text-primary: #F0F5F1`, `text-secondary: #8BA89A`, `text-muted: #5A7A6A`, `text-inverse: #0B1A14`
- **Status colors:** `status-success: #34D399`, `status-warning: #F59E0B`, `status-danger: #EF4444`, `status-info: #3B82F6`, `status-locked: #D4A853`, `status-draft: #6B7280`
- **Border colors:** `border-default: rgba(139,168,154,0.2)`, `border-hover: rgba(139,168,154,0.4)`, `border-focus: rgba(212,168,83,0.6)`
- Define **backgroundImage** gradients: `gradient-hero: linear-gradient(135deg, #0B1A14 0%, #122A1F 50%, #1A3D2C 100%)`, `gradient-gold-cta: linear-gradient(135deg, #D4A853 0%, #E0BA6A 100%)`, `gradient-card-glow: linear-gradient(135deg, rgba(52,211,153,0.05) 0%, rgba(212,168,83,0.05) 100%)`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b chore/issue-1-configure-tailwind-design-tokens-colors
  ```
- Implement changes

  - [ ] Extend the `colors` object in `tailwind.config.ts`
  - [ ] **Background colors:** `bg-primary: #0B1A14`, `bg-card: #122A1F`, `bg-elevated: #1A3D2C`, `bg-input: #0F2219`, `bg-overlay: rgba(11,26,20,0.85)`
  - [ ] **Accent colors:** `gold: #D4A853`, `gold-hover: #E0BA6A`, `gold-muted: rgba(212,168,83,0.15)`, `emerald: #34D399`, `emerald-muted: rgba(52,211,153,0.15)`, `teal: #14B8A6`
  - [ ] **Text colors:** `text-primary: #F0F5F1`, `text-secondary: #8BA89A`, `text-muted: #5A7A6A`, `text-inverse: #0B1A14`
  - [ ] **Status colors:** `status-success: #34D399`, `status-warning: #F59E0B`, `status-danger: #EF4444`, `status-info: #3B82F6`, `status-locked: #D4A853`, `status-draft: #6B7280`
  - [ ] **Border colors:** `border-default: rgba(139,168,154,0.2)`, `border-hover: rgba(139,168,154,0.4)`, `border-focus: rgba(212,168,83,0.6)`
  - [ ] Define **backgroundImage** gradients: `gradient-hero: linear-gradient(135deg, #0B1A14 0%, #122A1F 50%, #1A3D2C 100%)`, `gradient-gold-cta: linear-gradient(135deg, #D4A853 0%, #E0BA6A 100%)`, `gradient-card-glow: linear-gradient(135deg, rgba(52,211,153,0.05) 0%, rgba(212,168,83,0.05) 100%)`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
chore: setup — Configure Tailwind design tokens & colors
```

---

### Issue #2 — — Configure global typography & `next/font`
**Labels:** `design-system` `good first issue`
**Milestone:** Phase 1: MVP

#### Description
Set up the Amana typography system within Next.js using `next/font` for local/optimized loading. Map the font families, scale sizes, font weights, and line heights into `tailwind.config.ts`.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Load `Geist` and `Geist Mono` locally (or via Google Fonts if accessible) using Next.js `next/font/local` in `src/app/layout.tsx`.
- Apply the generated `className` attributes to the `<body>` tag.
- Extend Tailwind `fontFamily`: `sans` uses Geist fallback stack, `mono` uses Geist Mono stack.
- Extend Tailwind `fontSize` overrides: `xs: 12px`, `sm: 14px`, `base: 16px`, `lg: 18px`, `xl: 20px`, `2xl: 24px`, `3xl: 30px`, `4xl: 36px`, `5xl: 48px`, `display: 60px`
- Verify standard Tailwind line heights line up with design (`leading-tight: 1.2`, normal: 1.5, relaxed: 1.75).
- Verify Tailwind classes like `font-sans text-display font-bold leading-tight` render properly.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b chore/issue-2-configure-global-typography-next-font
  ```
- Implement changes

  - [ ] Load `Geist` and `Geist Mono` locally (or via Google Fonts if accessible) using Next.js `next/font/local` in `src/app/layout.tsx`.
  - [ ] Apply the generated `className` attributes to the `<body>` tag.
  - [ ] Extend Tailwind `fontFamily`: `sans` uses Geist fallback stack, `mono` uses Geist Mono stack.
  - [ ] Extend Tailwind `fontSize` overrides: `xs: 12px`, `sm: 14px`, `base: 16px`, `lg: 18px`, `xl: 20px`, `2xl: 24px`, `3xl: 30px`, `4xl: 36px`, `5xl: 48px`, `display: 60px`
  - [ ] Verify standard Tailwind line heights line up with design (`leading-tight: 1.2`, normal: 1.5, relaxed: 1.75).
  - [ ] Verify Tailwind classes like `font-sans text-display font-bold leading-tight` render properly.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
chore: setup — Configure global typography & next/font
```

---

### Issue #3 — — Configure spacing, radius & shadow utilities
**Labels:** `design-system` `good first issue`
**Milestone:** Phase 1: MVP

#### Description
Load the exact Figma design tokens for spacing, border-radius, custom shadows, and backdrop blurs into the Tailwind theme configuration.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Tailwind default spacing classes closely match 4,8,12,16,20,24,32,40px scales — verify alignment and extend if necessary.
- Extend Tailwind `borderRadius`: `none: 0`, `sm: 6px`, `md: 8px`, `lg: 12px`, `xl: 16px`, `2xl: 24px`, `full: 9999px`
- Extend Tailwind `boxShadow`:
- `card: 0 4px 24px rgba(0,0,0,0.3)`
- `card-hover: 0 8px 32px rgba(0,0,0,0.4)`
- `glow-gold: 0 0 20px rgba(212,168,83,0.2)`
- `glow-emerald: 0 0 20px rgba(52,211,153,0.15)`
- `modal: 0 16px 48px rgba(0,0,0,0.5)`
- All utilities become globally available via Tailwind classes (e.g. `shadow-card`, `rounded-xl`, `backdrop-blur-md`).

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b chore/issue-3-configure-spacing-radius-shadow-utilitie
  ```
- Implement changes

  - [ ] Tailwind default spacing classes closely match 4,8,12,16,20,24,32,40px scales — verify alignment and extend if necessary.
  - [ ] Extend Tailwind `borderRadius`: `none: 0`, `sm: 6px`, `md: 8px`, `lg: 12px`, `xl: 16px`, `2xl: 24px`, `full: 9999px`
  - [ ] Extend Tailwind `boxShadow`:
  - `card: 0 4px 24px rgba(0,0,0,0.3)`
  - `card-hover: 0 8px 32px rgba(0,0,0,0.4)`
  - `glow-gold: 0 0 20px rgba(212,168,83,0.2)`
  - `glow-emerald: 0 0 20px rgba(52,211,153,0.15)`
  - `modal: 0 16px 48px rgba(0,0,0,0.5)`
  - [ ] All utilities become globally available via Tailwind classes (e.g. `shadow-card`, `rounded-xl`, `backdrop-blur-md`).

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
chore: setup — Configure spacing, radius & shadow utilities
```

---

### Issue #4 — — `<Button>` component
**Labels:** `component` `atom`
**Milestone:** Phase 1: MVP

#### Description
Create a reusable `Button` component that supports all Amana button variants as seen across the Figma screens (primary CTA, secondary outlined, ghost/text, and danger variants).

#### Variants (from Figma)
| Variant | Tailwind mapping |
|---------|--------|
| `primary` | `bg-gradient-gold-cta text-inverse hover:shadow-glow-gold` |
| `secondary` | `bg-transparent border border-gold text-gold hover:bg-gold-muted` |
| `ghost` | No border/bg, `text-muted hover:bg-white/5` |
| `danger` | `bg-status-danger text-white` |

#### Props
```ts
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- All 4 variants map to Tailwind class strings (e.g., using `tailwind-merge` and `cva` or clsx)
- 3 sizes: `sm: h-8 text-sm`, `md: h-10 text-base`, `lg: h-12 text-lg`
- `loading` state shows `<Spinner>` and disables click natively
- `disabled` state applies `opacity-50 cursor-not-allowed`
- Border radius: `rounded-full` (pill shape)
- Smooth `transition-all duration-150` on hover/active
- Fully accessible: proper `aria-disabled`, `role="button"`, keyboard focus ring `focus-visible:ring-2 focus-visible:ring-gold`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-4-button-component
  ```
- Implement changes

  - [ ] All 4 variants map to Tailwind class strings (e.g., using `tailwind-merge` and `cva` or clsx)
  - [ ] 3 sizes: `sm: h-8 text-sm`, `md: h-10 text-base`, `lg: h-12 text-lg`
  - [ ] `loading` state shows `<Spinner>` and disables click natively
  - [ ] `disabled` state applies `opacity-50 cursor-not-allowed`
  - [ ] Border radius: `rounded-full` (pill shape)
  - [ ] Smooth `transition-all duration-150` on hover/active
  - [ ] Fully accessible: proper `aria-disabled`, `role="button"`, keyboard focus ring `focus-visible:ring-2 focus-visible:ring-gold`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <Button> component
```

---

### Issue #5 — — `<Badge>` component
**Labels:** `component` `atom`
**Milestone:** Phase 1: MVP

#### Description
Create a `Badge` component for displaying short labels, statuses, and tags throughout the application.

#### Variants
| Variant | Tailwind Class Mappings |
|---------|-------|
| `success` | `bg-emerald-muted text-emerald` |
| `warning` | `bg-status-warning/15 text-status-warning` |
| `danger` | `bg-status-danger/15 text-status-danger` |
| `locked` | `bg-gold-muted text-gold` |
| `draft` | `bg-status-draft/15 text-status-draft` |
| `info` | `bg-status-info/15 text-status-info` |
| `neutral` | `bg-border-default text-text-secondary` |

#### Props
```ts
interface BadgeProps {
  variant?: 'success' | 'warning' | 'danger' | 'locked' | 'draft' | 'info' | 'neutral';
  size?: 'sm' | 'md';
  dot?: boolean;       // show colored dot prefix
  children: React.ReactNode;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- All 7 variants styled correctly with Tailwind maps
- `dot` prop renders a `w-1.5 h-1.5 rounded-full` colored circle prefix
- Pill shape mapping: `rounded-full px-3 py-1`
- Text styles: `tracking-wide text-xs font-semibold`
- Accessible with `role="status"` where appropriate

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-5-badge-component
  ```
- Implement changes

  - [ ] All 7 variants styled correctly with Tailwind maps
  - [ ] `dot` prop renders a `w-1.5 h-1.5 rounded-full` colored circle prefix
  - [ ] Pill shape mapping: `rounded-full px-3 py-1`
  - [ ] Text styles: `tracking-wide text-xs font-semibold`
  - [ ] Accessible with `role="status"` where appropriate

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <Badge> component
```

---

### Issue #6 — — `<InputField>` component
**Labels:** `component` `atom`
**Milestone:** Phase 1: MVP

#### Description
Create a reusable input field component with label, placeholder, validation states, and optional left/right slot support (for icons or currency badges).

#### Props
```ts
interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftSlot?: React.ReactNode;   // icon or prefix label
  rightSlot?: React.ReactNode;  // currency badge, copy button
  fullWidth?: boolean;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Background: `bg-input`
- Default border: `border border-border-default`; focus: `focus-within:border-border-focus`
- Error state: `border-status-danger` border, error message rendered below
- Disabled state: `opacity-50 cursor-not-allowed bg-card`
- Left/right slots positioned using absolute positioning `absolute select-none` inside a relative wrapper
- Label uses `text-text-secondary text-sm font-medium`
- Border radius: `rounded-md`
- Focus pseudo-classes using tailwind `focus:ring-2 focus:ring-border-focus/50 outline-none`
- Accessible: `htmlFor`/`id` linking, `aria-invalid`, `aria-describedby` for errors

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-6-inputfield-component
  ```
- Implement changes

  - [ ] Background: `bg-input`
  - [ ] Default border: `border border-border-default`; focus: `focus-within:border-border-focus`
  - [ ] Error state: `border-status-danger` border, error message rendered below
  - [ ] Disabled state: `opacity-50 cursor-not-allowed bg-card`
  - [ ] Left/right slots positioned using absolute positioning `absolute select-none` inside a relative wrapper
  - [ ] Label uses `text-text-secondary text-sm font-medium`
  - [ ] Border radius: `rounded-md`
  - [ ] Focus pseudo-classes using tailwind `focus:ring-2 focus:ring-border-focus/50 outline-none`
  - [ ] Accessible: `htmlFor`/`id` linking, `aria-invalid`, `aria-describedby` for errors

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <InputField> component
```

---

### Issue #7 — — `<Avatar>` component
**Labels:** `component` `atom`
**Milestone:** Phase 1: MVP

#### Description
A circular avatar component for user and entity representation used in the TopAppBar and trade participant cards.

#### Props
```ts
interface AvatarProps {
  src?: string;
  alt: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  fallback?: string;    // 1-2 letter initials
  verified?: boolean;   // shows emerald checkmark badge
  online?: boolean;     // shows presence dot
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Sizes map to standard Tailwind utilities e.g. `xs: w-6 h-6`, `sm: h-8 w-8`, `md: h-10 w-10`, `lg: h-12 w-12`, `xl: h-16 w-16`
- Image fallback renders initials utilizing `bg-elevated text-text-secondary flex items-center justify-center font-medium`
- `verified` prop overlays an emerald checkmark badge absolutely positioned at bottom-right
- `online` prop overlays a `bg-emerald` dot
- Circular shape: `rounded-full overflow-hidden`
- Border: `border border-border-default`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-7-avatar-component
  ```
- Implement changes

  - [ ] Sizes map to standard Tailwind utilities e.g. `xs: w-6 h-6`, `sm: h-8 w-8`, `md: h-10 w-10`, `lg: h-12 w-12`, `xl: h-16 w-16`
  - [ ] Image fallback renders initials utilizing `bg-elevated text-text-secondary flex items-center justify-center font-medium`
  - [ ] `verified` prop overlays an emerald checkmark badge absolutely positioned at bottom-right
  - [ ] `online` prop overlays a `bg-emerald` dot
  - [ ] Circular shape: `rounded-full overflow-hidden`
  - [ ] Border: `border border-border-default`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <Avatar> component
```

---

### Issue #8 — — `<Icon>` wrapper component
**Labels:** `component` `atom`
**Milestone:** Phase 1: MVP

#### Description
A standardized icon wrapper that ensures consistent sizing and coloring across all icons used in the Amana interface (using Lucide React or similar).

#### Props
```ts
interface IconProps {
  name: string;         // icon identifier
  size?: 'xs' | 'sm' | 'md' | 'lg'; // 12, 16, 20, 24px
  className?: string;   // override via tailwind text-color
  'aria-label'?: string;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Sizes map cleanly: `xs=12px`, `sm=16px`, `md=20px`, `lg=24px` passed into lucide config
- Default color inherited via CSS context or explicit `text-text-secondary`
- Accepts `aria-label` for accessible icon-only buttons

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-8-icon-wrapper-component
  ```
- Implement changes

  - [ ] Sizes map cleanly: `xs=12px`, `sm=16px`, `md=20px`, `lg=24px` passed into lucide config
  - [ ] Default color inherited via CSS context or explicit `text-text-secondary`
  - [ ] Accepts `aria-label` for accessible icon-only buttons

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <Icon> wrapper component
```

---

### Issue #9 — — `<Spinner>` / `<LoadingState>` component
**Labels:** `component` `atom`
**Milestone:** Phase 1: MVP

#### Description
Loading indicator components used inside buttons, cards, and full-page loading states.

#### Variants
- `<Spinner>` — inline circular spinner (used inside `<Button loading>`)
- `<LoadingState>` — full-card skeleton placeholder with shimmer animation

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- `<Spinner>` renders an SVG circle using `border-t-gold animate-spin border-transparent rounded-full`
- `<Spinner>` sizes: `sm: h-4 w-4`, `md: h-6 w-6`, `lg: h-8 w-8`
- `<LoadingState>` renders skeleton rectangles using standard Tailwind `animate-pulse` utility
- Background renders as `bg-elevated text-transparent`
- Options to utilize `motion-reduce:animate-none` for users who disabled animations at OS level

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-9-spinner-loadingstate-component
  ```
- Implement changes

  - [ ] `<Spinner>` renders an SVG circle using `border-t-gold animate-spin border-transparent rounded-full`
  - [ ] `<Spinner>` sizes: `sm: h-4 w-4`, `md: h-6 w-6`, `lg: h-8 w-8`
  - [ ] `<LoadingState>` renders skeleton rectangles using standard Tailwind `animate-pulse` utility
  - Background renders as `bg-elevated text-transparent`
  - [ ] Options to utilize `motion-reduce:animate-none` for users who disabled animations at OS level

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <Spinner> / <LoadingState> component
```

---

### Issue #10 — — `<Divider>` component
**Labels:** `component` `atom`
**Milestone:** Phase 1: MVP

#### Description
A simple visual separator for use between sections and list items.

#### Props
```ts
interface DividerProps {
  orientation?: 'horizontal' | 'vertical';
  label?: string;        // optional center label (e.g., "OR")
  className?: string;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Horizontal: `h-px w-full bg-border-default`
- Vertical: `w-px h-full bg-border-default`
- Optional `label` overlaps the divider at absolute center, styled with `text-text-muted text-xs bg-bg-primary px-2`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-10-divider-component
  ```
- Implement changes

  - [ ] Horizontal: `h-px w-full bg-border-default`
  - [ ] Vertical: `w-px h-full bg-border-default`
  - [ ] Optional `label` overlaps the divider at absolute center, styled with `text-text-muted text-xs bg-bg-primary px-2`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <Divider> component
```

---

### Issue #11 — — `<StatusBadge>` — Trade status badge with icon
**Labels:** `component` `molecule`
**Milestone:** Phase 1: MVP

#### Description
A compound badge showing an agricultural trade's status — combines `<Icon>` + `<Badge>`. Used in Trade Dashboard list rows and Trade Detail panels.

#### Status Map
| Status | Badge Variant | Icon |
|--------|--------------|------|
| `Delivered` | `success` | CheckCircle |
| `In Transit` | `warning` | Truck |
| `Disputed` | `danger` | AlertTriangle |
| `Funds Locked` | `locked` | Lock |
| `Draft` | `draft` | FileText |
| `Pending` | `info` | Clock |

#### Props
```ts
interface StatusBadgeProps {
  status: 'delivered' | 'in-transit' | 'disputed' | 'locked' | 'draft' | 'pending';
  size?: 'sm' | 'md';
  showIcon?: boolean; // default true
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- All 6 statuses render with correct corresponding Tailwind variant + lucide icon
- Dot prop utilized correctly matching the status token
- `showIcon=false` hides icon (text-only view)

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-11-statusbadge-trade-status-badge-with-icon
  ```
- Implement changes

  - [ ] All 6 statuses render with correct corresponding Tailwind variant + lucide icon
  - [ ] Dot prop utilized correctly matching the status token
  - [ ] `showIcon=false` hides icon (text-only view)

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <StatusBadge> — Trade status badge with icon
```

---

### Issue #12 — — `<StepIndicator>` — Multi-step flow progress
**Labels:** `component` `molecule`
**Milestone:** Phase 1: MVP

#### Description
A horizontal step progress indicator used in the Create Trade (3-step) and Verification/Withdraw (4-step) flows.

#### Props
```ts
interface StepIndicatorProps {
  steps: { label: string; description?: string }[];
  currentStep: number;   // 0-indexed
  completedSteps?: number[];
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Completed steps: emerald circle (`bg-accent-emerald text-inverse`) with checkmark
- Current step: gold outlined (`border-2 border-gold font-bold text-gold`) circle with number
- Upcoming steps: `border-2 border-border-default text-text-muted` circle
- Connecting line between steps: `h-0.5 w-full bg-border-default`, mutating internally to `bg-accent-emerald` for completed segments
- Flexbox row, labels truncate on small screens. `aria-current="step"` on active element.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-12-stepindicator-multi-step-flow-progress
  ```
- Implement changes

  - [ ] Completed steps: emerald circle (`bg-accent-emerald text-inverse`) with checkmark
  - [ ] Current step: gold outlined (`border-2 border-gold font-bold text-gold`) circle with number
  - [ ] Upcoming steps: `border-2 border-border-default text-text-muted` circle
  - [ ] Connecting line between steps: `h-0.5 w-full bg-border-default`, mutating internally to `bg-accent-emerald` for completed segments
  - [ ] Flexbox row, labels truncate on small screens. `aria-current="step"` on active element.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <StepIndicator> — Multi-step flow progress
```

---

### Issue #13 — — `<FormField>` — Label + Input + Error group
**Labels:** `component` `molecule`
**Milestone:** Phase 1: MVP

#### Description
A complete form field unit combining a label, `<InputField>`, optional hint text, and error display. Used in Create Trade and Withdraw flows.

#### Props
```ts
interface FormFieldProps {
  label: string;
  name: string;
  required?: boolean;
  hint?: string;
  error?: string;
  className?: string;
  children: React.ReactElement; // the input/select inside
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Required fields show a gold asterisk `*` (`text-gold`) next to the label
- Hint text maps to `text-text-muted text-xs` below the input
- Error message configured to `text-status-danger text-xs mt-1` with an inline alert icon
- Prop validation chains `id` + `aria-describedby` correctly to nested inputs

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-13-formfield-label-input-error-group
  ```
- Implement changes

  - [ ] Required fields show a gold asterisk `*` (`text-gold`) next to the label
  - [ ] Hint text maps to `text-text-muted text-xs` below the input
  - [ ] Error message configured to `text-status-danger text-xs mt-1` with an inline alert icon
  - [ ] Prop validation chains `id` + `aria-describedby` correctly to nested inputs

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <FormField> — Label + Input + Error group
```

---

### Issue #14 — — `<TradeAmountRow>` — Amount display (NGN/USDC)
**Labels:** `component` `molecule`
**Milestone:** Phase 1: MVP

#### Description
Displays a trade's value. Integrates Path Payments displaying local currency (NGN) while locking the value in USDC to protect against inflation.

#### Props
```ts
interface TradeAmountRowProps {
  amountUsdc: string | number;
  amountLocal?: string | number;
  currencyLocal?: 'NGN' | 'XLM';
  label?: string;           // e.g., "Total Trade Value"
  highlighted?: boolean;    // gold text for primary amount
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Primary amount displays anchored USDC value: `font-mono text-3xl font-bold` combined via Tailwind
- Sublabel displays local equivalent (e.g. `≈ ₦2,450,000 NGN`) in `text-text-muted text-sm`
- `highlighted=true` passes `text-gold` overriding default
- Uses flexbox to correctly display Stellar Path Payment references.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-14-tradeamountrow-amount-display-ngn-usdc
  ```
- Implement changes

  - [ ] Primary amount displays anchored USDC value: `font-mono text-3xl font-bold` combined via Tailwind
  - [ ] Sublabel displays local equivalent (e.g. `≈ ₦2,450,000 NGN`) in `text-text-muted text-sm`
  - [ ] `highlighted=true` passes `text-gold` overriding default
  - [ ] Uses flexbox to correctly display Stellar Path Payment references.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <TradeAmountRow> — Amount display (NGN/USDC)
```

---

### Issue #15 — — `<WalletAddressBadge>` — Truncated wallet address display
**Labels:** `component` `molecule`
**Milestone:** Phase 1: MVP

#### Description
Displays a Stellar wallet address in truncated form with a copy-to-clipboard button. Used in Contract Details card and Trade Detail.

#### Props
```ts
interface WalletAddressBadgeProps {
  address: string;          // full wallet address
  truncate?: 'start' | 'middle' | 'end'; // default 'middle'
  showCopy?: boolean;
  showExplorer?: boolean;   // link to Stellar expert
  className?: string;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Middle truncation computes first 6 + `…` + last 4 chars natively via TS component layer
- Hover states trigger copy button view (Clipboard icon). On click triggers `navigator.clipboard.writeText` and renders brief emerald checkmark
- Font formatting via Tailwind class map: `font-mono text-sm inline-flex items-center`
- Custom Wrapper styles: `bg-elevated border border-border-default rounded-md px-2 py-1`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-15-walletaddressbadge-truncated-wallet-addr
  ```
- Implement changes

  - [ ] Middle truncation computes first 6 + `…` + last 4 chars natively via TS component layer
  - [ ] Hover states trigger copy button view (Clipboard icon). On click triggers `navigator.clipboard.writeText` and renders brief emerald checkmark
  - [ ] Font formatting via Tailwind class map: `font-mono text-sm inline-flex items-center`
  - [ ] Custom Wrapper styles: `bg-elevated border border-border-default rounded-md px-2 py-1`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <WalletAddressBadge> — Truncated wallet address display
```

---

### Issue #16 — — `<TimelineItem>` — Single transaction event
**Labels:** `component` `molecule`
**Milestone:** Phase 1: MVP

#### Description
A single entry in a transaction/event timeline logging the agricultural goods transit over time. Used in the `<TransactionTimeline>` organism.

#### Props
```ts
interface TimelineItemProps {
  event: string;            // "Funds Deposited"
  timestamp: string;        // ISO date string
  status: 'completed' | 'active' | 'pending';
  detail?: string;
  actor?: string;           // "Buyer" | "Seller" | "System"
  isLast?: boolean;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- `completed` — inner div renders `bg-accent-emerald w-2 h-2 rounded-full`
- `active` — inner div renders `bg-gold w-3 h-3 rounded-full animate-pulse`, title uses `font-semibold text-text-primary`
- `pending` — outer bound is a ring `border-2 border-border-default rounded-full w-3 h-3` with transparent center
- Connector line absolutely positioned `bg-border-default w-0.5 min-h-[40px] left-1.5`
- Timestamp styling: `text-text-muted text-xs`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-16-timelineitem-single-transaction-event
  ```
- Implement changes

  - [ ] `completed` — inner div renders `bg-accent-emerald w-2 h-2 rounded-full`
  - [ ] `active` — inner div renders `bg-gold w-3 h-3 rounded-full animate-pulse`, title uses `font-semibold text-text-primary`
  - [ ] `pending` — outer bound is a ring `border-2 border-border-default rounded-full w-3 h-3` with transparent center
  - [ ] Connector line absolutely positioned `bg-border-default w-0.5 min-h-[40px] left-1.5`
  - [ ] Timestamp styling: `text-text-muted text-xs`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <TimelineItem> — Single transaction event
```

---

### Issue #19 — — `<SideNavBar>` — Persistent sidebar navigation
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
The persistent left sidebar navigation (referred to as "The Sentinel" in the Figma layers). Present on all main screens: Vault Dashboard, Trade Dashboard, Trade Detail.

#### Sections (from Figma)
- Brand logo + "Amana" wordmark at top
- Navigation items: Dashboard, Trades, Vault, Reputation, Settings
- Bottom section: Wallet connection status

#### Props
```ts
interface SideNavBarProps {
  activePath: string;
  isConnected: boolean;
  onConnectWallet: () => void;
  collapsed?: boolean;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Fixed width positioning via Tailwind `w-64` (expanded) or `w-20` (collapsed)
- Active nav item uses `border-l-4 border-gold bg-elevated text-text-primary`
- Inactive items use `hover:bg-white/5 hover:border-l-4 hover:border-border-hover transition-colors`
- Bottom section imports Freighter connect flow or truncates connected address
- Fully semantic structure (`<nav>`, `<ul>`, `<li>` roles with `aria-current="page"`)

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-19-sidenavbar-persistent-sidebar-navigation
  ```
- Implement changes

  - [ ] Fixed width positioning via Tailwind `w-64` (expanded) or `w-20` (collapsed)
  - [ ] Active nav item uses `border-l-4 border-gold bg-elevated text-text-primary`
  - [ ] Inactive items use `hover:bg-white/5 hover:border-l-4 hover:border-border-hover transition-colors`
  - [ ] Bottom section imports Freighter connect flow or truncates connected address
  - [ ] Fully semantic structure (`<nav>`, `<ul>`, `<li>` roles with `aria-current="page"`)

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <SideNavBar> — Persistent sidebar navigation
```

---

### Issue #20 — — `<TopAppBar>` — Top navigation bar
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
The top horizontal navigation bar present on all main screens. Contains page title, breadcrumbs, network status, and user profile section.

#### Props
```ts
interface TopAppBarProps {
  title: string;
  breadcrumbs?: { label: string; path?: string }[];
  networkStatus?: 'mainnet' | 'testnet';
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Sticky top header styled: `sticky top-0 z-40 h-16 w-full bg-card/80 backdrop-blur-md border-b border-border-default flex items-center px-6`
- Left column displays Breadcrumbs formatted with chevrons mapping to Next.js Router configurations
- Right column groups network badge, Avatar, and bell icon using standard flex layout `gap-4`.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-20-topappbar-top-navigation-bar
  ```
- Implement changes

  - [ ] Sticky top header styled: `sticky top-0 z-40 h-16 w-full bg-card/80 backdrop-blur-md border-b border-border-default flex items-center px-6`
  - [ ] Left column displays Breadcrumbs formatted with chevrons mapping to Next.js Router configurations
  - [ ] Right column groups network badge, Avatar, and bell icon using standard flex layout `gap-4`.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <TopAppBar> — Top navigation bar
```

---

### Issue #21 — — `<BentoCard>` — Reusable bento grid card
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
The base card component for the bento grid layout on the Vault Dashboard. Acts as a container for all four bento card variants (Contract Details, Payment Overview etc).

#### Props
```ts
interface BentoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  icon?: React.ReactNode;
  glowVariant?: 'gold' | 'emerald' | 'none';
  children: React.ReactNode;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Main wrapper styles: `bg-card border border-border-default rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-shadow duration-300 relative overflow-hidden flex flex-col`
- Support pseudo element hover glows: `hover:shadow-glow-gold` and `hover:shadow-glow-emerald` driven by the prop logic.
- Header formatting aligns icon + `text-lg font-semibold text-text-primary`.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-21-bentocard-reusable-bento-grid-card
  ```
- Implement changes

  - [ ] Main wrapper styles: `bg-card border border-border-default rounded-2xl p-6 shadow-card hover:shadow-card-hover transition-shadow duration-300 relative overflow-hidden flex flex-col`
  - [ ] Support pseudo element hover glows: `hover:shadow-glow-gold` and `hover:shadow-glow-emerald` driven by the prop logic.
  - [ ] Header formatting aligns icon + `text-lg font-semibold text-text-primary`.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <BentoCard> — Reusable bento grid card
```

---

### Issue #24 — — `<PaymentOverviewCard>` — Escrow breakdown & 1% fee
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
A bento grid card summarizing the financial state of an escrow trade: total value, locked amount, platform fee, and net payout.

#### Content Structure
- Title: "Vault Escrow Summary" + CreditCard icon
- Line items: Total Trade Value, Amana Platform Fee (Flat 1%), Net Payout
- Highlight row: Locked in USDC (gold accent)
- Currency toggle: USDC / NGN (Path payment reference)

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Builds on `<BentoCard glowVariant="gold">`
- Reuses `<TradeAmountRow>` component logic mapped via a list iteration over cost structure inputs
- Platform fee statically computes `(totalUsdc * 0.01)` displaying string format internally prior to render
- "Locked in USDC" row isolates using `bg-gold-muted/20 border-l-[3px] border-gold text-gold font-bold px-4 py-2 mt-4 rounded-r-md` styling syntax
- Currency toggle button resets display map binding components across entire view.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-24-paymentoverviewcard-escrow-breakdown-1-f
  ```
- Implement changes

  - [ ] Builds on `<BentoCard glowVariant="gold">`
  - [ ] Reuses `<TradeAmountRow>` component logic mapped via a list iteration over cost structure inputs
  - [ ] Platform fee statically computes `(totalUsdc * 0.01)` displaying string format internally prior to render
  - [ ] "Locked in USDC" row isolates using `bg-gold-muted/20 border-l-[3px] border-gold text-gold font-bold px-4 py-2 mt-4 rounded-r-md` styling syntax
  - [ ] Currency toggle button resets display map binding components across entire view.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <PaymentOverviewCard> — Escrow breakdown & 1% fee
```

---

### Issue #25 — — `<TransactionTimeline>` — Chronological trade events
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
A vertical timeline displaying the chronological sequence of events in a trade lifecycle. Composes multiple `<TimelineItem>` molecules natively.

#### Trade Event Sequence
1. Trade Created (System)
2. Funds Deposited (Buyer)
3. Goods Dispatched (Seller)
4. In Transit (Driver)
5. Delivery Confirmed / Disputed (Buyer)
6. Funds Released / Refunded (System)

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Maps Array of `events: TransactionEvent[]` over `<TimelineItem>` instances
- Wraps structure inside `<BentoCard className="row-span-2">` to stretch down sidebar vertically utilizing standard flex mappings
- Tracks `currentEventIndex` injecting `status="active"` to designated child element algorithmically.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-25-transactiontimeline-chronological-trade-
  ```
- Implement changes

  - [ ] Maps Array of `events: TransactionEvent[]` over `<TimelineItem>` instances
  - [ ] Wraps structure inside `<BentoCard className="row-span-2">` to stretch down sidebar vertically utilizing standard flex mappings
  - [ ] Tracks `currentEventIndex` injecting `status="active"` to designated child element algorithmically.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <TransactionTimeline> — Chronological trade events
```

---

### Issue #26 — — `<TradeListItem>` — Trade row in dashboard list
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
A single row in the Trade Dashboard list. Shows trade ID, counterparty, agricultural commodity, amount, status, and quick-action buttons.

#### Props
```ts
interface TradeListItemProps {
  tradeId: string;
  commodity: string;
  counterparty: { role: string; address: string };
  amountUsdc: string;
  status: TradeStatus;
  createdAt: string;
  onView: () => void;
  onDeposit?: () => void;
  onWithdraw?: () => void;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Container applies Tailwind list row styling: `flex items-center justify-between p-4 bg-card border border-border-default rounded-lg mb-3 hover:border-gold/30 hover:bg-elevated transition-colors cursor-pointer group`
- Text formatting: Commodity (`text-lg font-medium text-text-primary`), Role badge (`bg-white/5 text-teal text-xs px-2 py-1 rounded`), Trade ID (`font-mono text-text-muted text-sm`)
- Quick Action buttons align right wrapped utilizing `gap-3 flex items-center` utilizing `<Button size="sm">` syntax

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-26-tradelistitem-trade-row-in-dashboard-lis
  ```
- Implement changes

  - [ ] Container applies Tailwind list row styling: `flex items-center justify-between p-4 bg-card border border-border-default rounded-lg mb-3 hover:border-gold/30 hover:bg-elevated transition-colors cursor-pointer group`
  - [ ] Text formatting: Commodity (`text-lg font-medium text-text-primary`), Role badge (`bg-white/5 text-teal text-xs px-2 py-1 rounded`), Trade ID (`font-mono text-text-muted text-sm`)
  - [ ] Quick Action buttons align right wrapped utilizing `gap-3 flex items-center` utilizing `<Button size="sm">` syntax

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <TradeListItem> — Trade row in dashboard list
```

---

### Issue #27 — — `<TradeDetailPanel>` — Full agricultural trade detail view
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
The main content panel for the Trade Detail View screen. Assembles all agricultural trade info: parties, transit commodity, amounts, contract, timeline, and action buttons.

#### Sections
1. **Trade Header**: ID, Agricultural Commodity (e.g., Grains/Tubers), `<StatusBadge>`
2. **Parties Panel**: Buyer + Seller with wallet addresses
3. **Financial Summary**: `<PaymentOverviewCard>` inline version
4. **Contract Info**: `<ContractDetailsCard>` inline version (Loss Ratios)
5. **Action Bar**: Context-sensitive buttons (PoD Verification / Raise Dispute / Release Funds)
6. **Timeline**: `<TransactionTimeline>`

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Container utilizes Tailwind grid layout for responsiveness: `grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto p-6`
- Main column (left, `lg:col-span-2`) stacks Trade Header, Parties, and Financials via `flex flex-col gap-6`
- Sidebar column (right, `lg:col-span-1`) houses Timeline and Contract details
- Mobile configurations drop grid down to single column mapping cleanly via flex
- Unified Action Bar displays fixed positioned along viewport bottom `fixed bottom-0 left-0 w-full bg-card/90 backdrop-blur-md border-t border-border-default p-4 flex justify-end gap-4 z-50`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-27-tradedetailpanel-full-agricultural-trade
  ```
- Implement changes

  - [ ] Container utilizes Tailwind grid layout for responsiveness: `grid grid-cols-1 lg:grid-cols-3 gap-6 w-full max-w-7xl mx-auto p-6`
  - [ ] Main column (left, `lg:col-span-2`) stacks Trade Header, Parties, and Financials via `flex flex-col gap-6`
  - [ ] Sidebar column (right, `lg:col-span-1`) houses Timeline and Contract details
  - [ ] Mobile configurations drop grid down to single column mapping cleanly via flex
  - [ ] Unified Action Bar displays fixed positioned along viewport bottom `fixed bottom-0 left-0 w-full bg-card/90 backdrop-blur-md border-t border-border-default p-4 flex justify-end gap-4 z-50`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <TradeDetailPanel> — Full agricultural trade detail view
```

---

### Issue #30 — — `<SuccessState>` — Reusable success confirmation screen
**Labels:** `component` `organism`
**Milestone:** Phase 1: MVP

#### Description
A reusable success state component used at the end of multi-step flows (Trade Deposit Success, Withdraw Success, Secure Asset Success). Shows an animated checkmark, title, message, and action buttons.

#### Props
```ts
interface SuccessStateProps {
  title: string;               // "Trade Deposit Successful!"
  message: string;             // descriptive message
  txHash?: string;             // blockchain transaction hash
  primaryAction: { label: string; onClick: () => void };
  variant?: 'emerald' | 'gold';
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Central layout formatted cleanly: `flex flex-col items-center justify-center min-h-[50vh] text-center w-full max-w-lg mx-auto`
- Animated SVG graphic binds CSS keyframes handling rotation / drawing stroke logic (`animate-[draw-stroke_1s_ease-out_forwards]`)
- Text format references Tailwind utilities matching UI layer specs `text-3xl font-bold text-text-primary mt-6 mb-2`
- Transaction ID mapped to `<WalletAddressBadge>` centered below subtitle string.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-30-successstate-reusable-success-confirmati
  ```
- Implement changes

  - [ ] Central layout formatted cleanly: `flex flex-col items-center justify-center min-h-[50vh] text-center w-full max-w-lg mx-auto`
  - [ ] Animated SVG graphic binds CSS keyframes handling rotation / drawing stroke logic (`animate-[draw-stroke_1s_ease-out_forwards]`)
  - [ ] Text format references Tailwind utilities matching UI layer specs `text-3xl font-bold text-text-primary mt-6 mb-2`
  - [ ] Transaction ID mapped to `<WalletAddressBadge>` centered below subtitle string.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <SuccessState> — Reusable success confirmation screen
```

---

### Issue #31 — — `Amana Vault Dashboard` page
**Labels:** `page` `screen`
**Milestone:** Phase 1: MVP

#### Description
Implement the main Vault Dashboard page (`/vault`). Assembles the sidebar, top bar, status header, 2×2 bento grid, partner logos, and footer.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Bootstrapped directly inside `src/app/vault/page.tsx`
- Imports overarching Shell components `<SideNavBar>` and `<TopAppBar>` dynamically managing layout space.
- Body CSS applies specialized grid formats: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`.
- Connects Freighter Wallet library hooks tracking user identity to drive personalized UI instances representing Vault volume.
- Next.js specific SSR configurations handle initial loading skeletons gracefully (`loading.tsx` component implementation mapping to `<LoadingState>`).

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-31-amana-vault-dashboard-page
  ```
- Implement changes

  - [ ] Bootstrapped directly inside `src/app/vault/page.tsx`
  - [ ] Imports overarching Shell components `<SideNavBar>` and `<TopAppBar>` dynamically managing layout space.
  - [ ] Body CSS applies specialized grid formats: `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6`.
  - [ ] Connects Freighter Wallet library hooks tracking user identity to drive personalized UI instances representing Vault volume.
  - [ ] Next.js specific SSR configurations handle initial loading skeletons gracefully (`loading.tsx` component implementation mapping to `<LoadingState>`).

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — Amana Vault Dashboard page
```

---

### Issue #32 — — `Trade Dashboard` page
**Labels:** `page` `screen`
**Milestone:** Phase 1: MVP

#### Description
Implement the Trade Dashboard page (`/trades`) listing all trades the connected user is involved in.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Maps layout utilizing identical Shell components via shared root `layout.tsx` wrapper
- Header incorporates customized flex configuration tracking "Create Trade" button directly adjoining Page Title (`flex items-center justify-between`)
- Filter tabs utilizing pure CSS tailwind implementations: `flex gap-2 border-b border-border-default pb-[1px]` mapped alongside custom `active` button attributes switching `underline-offset-8 decoration-gold decoration-2`.
- Incorporates standard pagination layout configuration handling mapping lists from Supabase / Soroban chain.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-32-trade-dashboard-page
  ```
- Implement changes

  - [ ] Maps layout utilizing identical Shell components via shared root `layout.tsx` wrapper
  - [ ] Header incorporates customized flex configuration tracking "Create Trade" button directly adjoining Page Title (`flex items-center justify-between`)
  - [ ] Filter tabs utilizing pure CSS tailwind implementations: `flex gap-2 border-b border-border-default pb-[1px]` mapped alongside custom `active` button attributes switching `underline-offset-8 decoration-gold decoration-2`.
  - [ ] Incorporates standard pagination layout configuration handling mapping lists from Supabase / Soroban chain.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — Trade Dashboard page
```

---

### Issue #33 — — `Trade Detail View` page
**Labels:** `page` `screen`
**Milestone:** Phase 1: MVP

#### Description
Implement the Trade Detail View parameter page (`/trades/[id]`).

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Connects Next.js dynamic routing passing context parameters down to the `<TradeDetailPanel>` organism natively
- Incorporates `useEffect` hooks resolving on-chain parameters tracking Escrow smart contract addresses directly.
- Utilizes the integrated Suspense boundary logic wrapping individual Bento card fetches masking slow network requests on Soroban testnet infrastructure.
- "Back to Trades" button mapping `router.push('/trades')` via Next Router directly embedded inside Top App Bar.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-33-trade-detail-view-page
  ```
- Implement changes

  - [ ] Connects Next.js dynamic routing passing context parameters down to the `<TradeDetailPanel>` organism natively
  - [ ] Incorporates `useEffect` hooks resolving on-chain parameters tracking Escrow smart contract addresses directly.
  - [ ] Utilizes the integrated Suspense boundary logic wrapping individual Bento card fetches masking slow network requests on Soroban testnet infrastructure.
  - [ ] "Back to Trades" button mapping `router.push('/trades')` via Next Router directly embedded inside Top App Bar.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — Trade Detail View page
```

---

### Issue #35 — — `Create Trade` — 3-step agricultural escrow flow
**Labels:** `page` `screen` `flow`
**Milestone:** Phase 1: MVP

#### Description
Implement the 3-step trade creation flow (`/trades/create`). Initiated by Buyer, locking agricultural commodity value into USDC vault via NGN Path payments.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Step parameters tracked via `useState` / React Context logic locally switching component view renders without reloading page URL parameters.
- Incorporates `<StepIndicator>` layout formatting passing index parameters
- Step 2 hooks directly to the `<LegalDisclaimerModal>` displaying negotiation structures dynamically
- Final Submit action handles loading states natively disabling buttons displaying `<Spinner />` until Soroban SDK returns finalized transaction payload hash string.
---
## Phase 2: Agreement

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-35-create-trade-3-step-agricultural-escrow-
  ```
- Implement changes

  - [ ] Step parameters tracked via `useState` / React Context logic locally switching component view renders without reloading page URL parameters.
  - [ ] Incorporates `<StepIndicator>` layout formatting passing index parameters
  - [ ] Step 2 hooks directly to the `<LegalDisclaimerModal>` displaying negotiation structures dynamically
  - [ ] Final Submit action handles loading states natively disabling buttons displaying `<Spinner />` until Soroban SDK returns finalized transaction payload hash string.
  ---
  ## Phase 2: Agreement

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — Create Trade — 3-step agricultural escrow flow
```

---

### Issue #23 — — `<ContractDetailsCard>` — Contract details & Loss Ratio
**Labels:** `component` `organism`
**Milestone:** Phase 2: Agreement

#### Description
A bento grid card displaying the Soroban smart contract details for the active escrow — contract ID, parties, hardcoded loss ratio, and creation date.

#### Content Structure
- Title: "Agreement Protocol" + FileCode icon
- Contract ID: `<WalletAddressBadge>` (truncated)
- Buyer/Seller/Mediator addresses
- Loss Ratio display: Hardcoded dynamic risk-sharing (e.g., 50/50, 70/30) visual split bar.
- Creation timestamp

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Builds on `<BentoCard glowVariant="none">`
- Contract ID mapped to `<WalletAddressBadge showExplorer showCopy>` molecule
- Roles array mapped visually via `flex items-center justify-between py-2 border-b border-white/5`
- Loss Ratio renders inline Tailwind width bindings over a standard rail. Ex: `<div className="h-2 rounded-full overflow-hidden flex w-full"><div className="bg-emerald h-full" style={{ width: \`\${ratio}%\` }} /><div className="bg-gold h-full flex-1" /></div>`
- Props interface binds directly to Soroban chain data interfaces.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-23-contractdetailscard-contract-details-los
  ```
- Implement changes

  - [ ] Builds on `<BentoCard glowVariant="none">`
  - [ ] Contract ID mapped to `<WalletAddressBadge showExplorer showCopy>` molecule
  - [ ] Roles array mapped visually via `flex items-center justify-between py-2 border-b border-white/5`
  - [ ] Loss Ratio renders inline Tailwind width bindings over a standard rail. Ex: `<div className="h-2 rounded-full overflow-hidden flex w-full"><div className="bg-emerald h-full" style={{ width: \`\${ratio}%\` }} /><div className="bg-gold h-full flex-1" /></div>`
  - [ ] Props interface binds directly to Soroban chain data interfaces.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <ContractDetailsCard> — Contract details & Loss Ratio
```

---

### Issue #28 — — `<LegalDisclaimerModal>` — Loss-Sharing terms modal
**Labels:** `component` `organism`
**Milestone:** Phase 2: Agreement

#### Description
A modal overlay displaying the specific hardcoded loss-sharing terms that must be accepted before locking funds. Ensures parties acknowledge transit risks (interception, accidents).

#### Props
```ts
interface LegalDisclaimerModalProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
  lossRatio: { buyer: number; seller: number }; // e.g. 50/50, 70/30
  tradeValueUsdc: string;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Overlay styled utilizing standard full screen positioning: `fixed inset-0 bg-overlay backdrop-blur-lg z-50 flex items-center justify-center`
- Modal card map coordinates parameters: `bg-card border border-border-default shadow-modal max-w-lg w-full max-h-[90vh] rounded-2xl flex flex-col`
- Body uses Tailwind optimized scroll classes `overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10`
- Callouts internally use formatted text highlighting e.g. `bg-gold-muted/30 text-gold p-4 rounded-lg font-medium border border-gold/20` displaying explicit ratio configurations.
- Close event handlers chain into Radix UI / Next portal configurations preventing body scroll.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-28-legaldisclaimermodal-loss-sharing-terms-
  ```
- Implement changes

  - [ ] Overlay styled utilizing standard full screen positioning: `fixed inset-0 bg-overlay backdrop-blur-lg z-50 flex items-center justify-center`
  - [ ] Modal card map coordinates parameters: `bg-card border border-border-default shadow-modal max-w-lg w-full max-h-[90vh] rounded-2xl flex flex-col`
  - [ ] Body uses Tailwind optimized scroll classes `overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10`
  - [ ] Callouts internally use formatted text highlighting e.g. `bg-gold-muted/30 text-gold p-4 rounded-lg font-medium border border-gold/20` displaying explicit ratio configurations.
  - [ ] Close event handlers chain into Radix UI / Next portal configurations preventing body scroll.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <LegalDisclaimerModal> — Loss-Sharing terms modal
```

---

### Issue #34 — — `Mediator Resolution Panel` page
**Labels:** `page` `screen`
**Milestone:** Phase 2: Agreement

#### Description
A specialized dashboard (`/mediator/disputes/[id]`) for Mediators to review video evidence and driver affirmations when a dispute is raised in agricultural trade transit.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Built exclusively loading data mapping only to designated Mediator Wallet addresses mapping `isAdmin` roles locally from Freighter
- Left column maps Video player `aspect-video bg-black rounded-xl overflow-hidden shadow-modal` integrating Pinata API playback formats.
- Right column groups Loss Ratio executor logic — custom button array issuing specialized Soroban execution strings terminating smart contracts and routing fractions.
- Maps `<DriverManifestForm>` output visually natively against video for cross-reference logic formats.
---
## Phase 3: Proof

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-34-mediator-resolution-panel-page
  ```
- Implement changes

  - [ ] Built exclusively loading data mapping only to designated Mediator Wallet addresses mapping `isAdmin` roles locally from Freighter
  - [ ] Left column maps Video player `aspect-video bg-black rounded-xl overflow-hidden shadow-modal` integrating Pinata API playback formats.
  - [ ] Right column groups Loss Ratio executor logic — custom button array issuing specialized Soroban execution strings terminating smart contracts and routing fractions.
  - [ ] Maps `<DriverManifestForm>` output visually natively against video for cross-reference logic formats.
  ---
  ## Phase 3: Proof

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — Mediator Resolution Panel page
```

---

### Issue #22 — — `<VideoUploadCard>` — Video Evidence Upload / Verification
**Labels:** `component` `organism`
**Milestone:** Phase 3: Proof

#### Description
A bento grid card handling the Proof-of-Delivery (PoD) visual evidence process. Mandatory for confirming delivery or raising a dispute.

#### Content Structure
- Card title: "Evidence Upload" + Video icon
- Upload Zone: Drag & drop interface for video upload
- Status mapping: Links to decentralized IPFS storage
- "Submit Proof" action button

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Builds on `<BentoCard glowVariant="gold">`
- Integrates an IPFS (Pinata) uploader utility utilizing form actions and Tailwind file-input selectors (`file:rounded-full file:bg-elevated file:text-gold`)
- View logic displays blank state string "Upload delivery proof video for verification" in `text-text-muted text-sm text-center`
- Limits file submission via standard HTML attribute `accept="video/mp4,video/webm"`
- Renders uploaded video placeholder preview + IPFS hash link element wrapping an `<Icon name="external-link">`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-22-videouploadcard-video-evidence-upload-ve
  ```
- Implement changes

  - [ ] Builds on `<BentoCard glowVariant="gold">`
  - [ ] Integrates an IPFS (Pinata) uploader utility utilizing form actions and Tailwind file-input selectors (`file:rounded-full file:bg-elevated file:text-gold`)
  - [ ] View logic displays blank state string "Upload delivery proof video for verification" in `text-text-muted text-sm text-center`
  - [ ] Limits file submission via standard HTML attribute `accept="video/mp4,video/webm"`
  - [ ] Renders uploaded video placeholder preview + IPFS hash link element wrapping an `<Icon name="external-link">`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <VideoUploadCard> — Video Evidence Upload / Verification
```

---

### Issue #29 — — `<DriverManifestForm>` — Driver/Vehicle details logging
**Labels:** `component` `organism`
**Milestone:** Phase 3: Proof

#### Description
A specific form used by the Seller to log driver information, serving as the first step of transit tracking (Ship-First phase).

#### Props
```ts
interface DriverManifestFormProps {
  isOpen: boolean;
  onComplete: (data: DriverManifestData) => void;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Renders using the Modal overlay framework styled identical to Issue 28
- Internal markup incorporates stacked `<FormField>` instances for Driver Name (`type="text"`), phone (`type="tel"`), and License plate.
- Validates form preventing submit event mapped through native JS rules tracking submit button logic via state updates.
- Design formatting injects shipping specific icons (Truck via `<Icon name="truck" />`) matching UI designs.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-29-drivermanifestform-driver-vehicle-detail
  ```
- Implement changes

  - [ ] Renders using the Modal overlay framework styled identical to Issue 28
  - [ ] Internal markup incorporates stacked `<FormField>` instances for Driver Name (`type="text"`), phone (`type="tel"`), and License plate.
  - [ ] Validates form preventing submit event mapped through native JS rules tracking submit button logic via state updates.
  - [ ] Design formatting injects shipping specific icons (Truck via `<Icon name="truck" />`) matching UI designs.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <DriverManifestForm> — Driver/Vehicle details logging
```

---

### Issue #36 — — `Dispute / Verification` — Video Proof upload flow
**Labels:** `page` `screen` `flow`
**Milestone:** Phase 3: Proof

#### Description
Implement the Verification/Dispute flow utilized by the Buyer or Mediator upon goods delivery to release or route locked funds.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Nested as a module view conditionally rendered against specific Trade pages returning "In Transit" status maps from Soroban chain
- Uses IPFS SDK directly passing Pinata Edge network files tracking React upload state natively mapping progress bar interfaces
- Dual branch logic paths: clicking "Accept Goods" configures standard `release()` operation; clicking "Raise Dispute" alerts mediator configuration routing payload.
- Freighter wallet invokes explicit message signature logic utilizing `signTransaction` mapping UI response handlers to modal wrappers.
---
## Phase 4: Launch

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-36-dispute-verification-video-proof-upload-
  ```
- Implement changes

  - [ ] Nested as a module view conditionally rendered against specific Trade pages returning "In Transit" status maps from Soroban chain
  - [ ] Uses IPFS SDK directly passing Pinata Edge network files tracking React upload state natively mapping progress bar interfaces
  - [ ] Dual branch logic paths: clicking "Accept Goods" configures standard `release()` operation; clicking "Raise Dispute" alerts mediator configuration routing payload.
  - [ ] Freighter wallet invokes explicit message signature logic utilizing `signTransaction` mapping UI response handlers to modal wrappers.
  ---
  ## Phase 4: Launch

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — Dispute / Verification — Video Proof upload flow
```

---

### Issue #17 — — `<RepScoreRing>` — Trust Score gauge
**Labels:** `component` `molecule`
**Milestone:** Phase 4: Launch

#### Description
A circular SVG arc/ring displaying a user's Trust Score (Reputation) based on repeat successful agricultural trades. Prominently used in the Reputation Profile screen.

#### Props
```ts
interface RepScoreRingProps {
  score: number;          // 0.0 – 5.0
  maxScore?: number;      // default 5
  size?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- SVG element wrapper calculates circumference metrics internally based on score (e.g., 4.5/5 -> 90%)
- Track path uses `stroke-border-default` Tailwind class. Active arc passes `stroke-[url(#gold-emerald-gradient)]`
- SVG `<text>` node dynamically maps typography using class equivalents. Number centered vertically.
- CSS transition (`stroke-dashoffset tracking transition-all duration-1000`) for animation load effect

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-17-repscorering-trust-score-gauge
  ```
- Implement changes

  - [ ] SVG element wrapper calculates circumference metrics internally based on score (e.g., 4.5/5 -> 90%)
  - [ ] Track path uses `stroke-border-default` Tailwind class. Active arc passes `stroke-[url(#gold-emerald-gradient)]`
  - [ ] SVG `<text>` node dynamically maps typography using class equivalents. Number centered vertically.
  - [ ] CSS transition (`stroke-dashoffset tracking transition-all duration-1000`) for animation load effect

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <RepScoreRing> — Trust Score gauge
```

---

### Issue #18 — — `<PartnerLogo>` — Institutional partner display
**Labels:** `component` `molecule`
**Milestone:** Phase 4: Launch

#### Description
A logo display component for verifying agricultural cooperatives mapped via institutional partners. Shown at the bottom of the Vault Dashboard.

#### Props
```ts
interface PartnerLogoProps {
  name: string;
  logoSrc: string;
  href?: string;        // optional link
}
```

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Wraps Next.js `next/image` optimizing source file
- Filter manipulation styles: `grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300`
- Background uses `bg-card border border-border-default rounded-lg`
- `group-hover` utility drives tooltips utilizing `absolute -top-10 bg-elevated text-text-primary px-3 py-1 rounded shadow-modal z-50`

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-18-partnerlogo-institutional-partner-displa
  ```
- Implement changes

  - [ ] Wraps Next.js `next/image` optimizing source file
  - [ ] Filter manipulation styles: `grayscale opacity-60 hover:grayscale-0 hover:opacity-100 transition-all duration-300`
  - [ ] Background uses `bg-card border border-border-default rounded-lg`
  - [ ] `group-hover` utility drives tooltips utilizing `absolute -top-10 bg-elevated text-text-primary px-3 py-1 rounded shadow-modal z-50`

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — <PartnerLogo> — Institutional partner display
```

---

### Issue #37 — — `Reputation Profile` — Trust Score overview
**Labels:** `page` `screen`
**Milestone:** Phase 4: Launch

#### Description
Implement the Reputation Profile page (`/reputation`) utilizing "Trust Scores". Built to encourage repeat agricultural traders based on verifiable transaction volume.

#### Requirements and context
- **Figma Reference:** [Amana Design](https://www.figma.com/design/r4l1ciQ2AnyrOxVW9t5oCm/Amana?node-id=0-1&t=FTSOqyrrGjUPgtAk-1)
- Integrates verified agricultural cooperative network badges using `<PartnerLogo>` references
- Embeds the highly visible `<RepScoreRing>` module inside a Hero Header styled layout configuration mapping centered constraints.
- Dynamic table utilizing `<TradeListItem>` variations isolating success criteria natively without modifying standard list behaviors globally.
- Applies custom Tailwind specific grid matrix resolving trust statistics displaying metrics matching design mockups precisely.

#### Suggested execution
- Fork the repo and create a branch
  ```bash
  git checkout -b feat/issue-37-reputation-profile-trust-score-overview
  ```
- Implement changes

  - [ ] Integrates verified agricultural cooperative network badges using `<PartnerLogo>` references
  - [ ] Embeds the highly visible `<RepScoreRing>` module inside a Hero Header styled layout configuration mapping centered constraints.
  - [ ] Dynamic table utilizing `<TradeListItem>` variations isolating success criteria natively without modifying standard list behaviors globally.
  - [ ] Applies custom Tailwind specific grid matrix resolving trust statistics displaying metrics matching design mockups precisely.

- Verify implementation/pipeline execution
- Include pipeline output/screenshots
- Document workflow

**Example commit message:**

```text
feat: setup — Reputation Profile — Trust Score overview
```

