# Navigation Components

This directory contains shared navigation components used throughout the application.

## Components

### Breadcrumb

A breadcrumb navigation component that shows the user's current location in the site hierarchy.

**Features:**
- Displays hierarchical navigation path
- Supports optional admin action links
- Accessible with proper ARIA attributes
- Responsive design

**Usage:**

```tsx
import { Breadcrumb } from "@/components/ui";

// Basic breadcrumb
<Breadcrumb
  items={[
    { label: "Home", path: "/" },
    { label: "Streams", path: "/streams" },
    { label: "stream-123" },
  ]}
/>

// With admin action link (shown only for admin users)
<Breadcrumb
  items={[
    { label: "Home", path: "/" },
    { label: "Streams", path: "/streams" },
    { label: "stream-123" },
  ]}
  adminAction={{
    label: "Manage Stream",
    href: "/admin/streams/stream-123",
    icon: <AdminIcon />,
  }}
/>
```

**Integration with useAdmin:**

```tsx
import { useAdmin } from "@/hooks/useAdmin";
import { Breadcrumb } from "@/components/ui";

function MyPage() {
  const { isAdmin } = useAdmin();
  
  return (
    <Breadcrumb
      items={breadcrumbItems}
      adminAction={
        isAdmin
          ? {
              label: "Admin Action",
              href: "/admin/...",
              icon: <Icon />,
            }
          : undefined
      }
    />
  );
}
```

### Navigation (NavLink, NavButton)

General-purpose navigation link and button components with consistent styling.

**Usage:**

```tsx
import { NavLink, NavButton } from "@/components/ui/Navigation";

// Navigation link
<NavLink href="/dashboard" isActive={pathname === "/dashboard"}>
  Dashboard
</NavLink>

// Navigation button
<NavButton onClick={handleClick} isActive={isSelected}>
  Filter
</NavButton>
```

## Utilities

### breadcrumbs.ts

Utility function to generate breadcrumb items from a pathname.

```tsx
import { generateBreadcrumbs } from "@/lib/breadcrumbs";

const breadcrumbs = generateBreadcrumbs("/streams/stream-123");
// Returns:
// [
//   { label: "Home", path: "/" },
//   { label: "Streams", path: "/streams" },
//   { label: "Stream 123", path: "/streams/stream-123" }
// ]
```

## Admin Access Patterns

### useAdmin Hook

Check if the current user has admin privileges based on their wallet address.

```tsx
import { useAdmin } from "@/hooks/useAdmin";

function MyComponent() {
  const { isAdmin, adminAddresses } = useAdmin();
  
  if (!isAdmin) {
    return <AccessDenied />;
  }
  
  return <AdminPanel />;
}
```

### Admin-Only Links

Conditionally render admin links in navigation:

```tsx
import { useAdmin } from "@/hooks/useAdmin";

function Navigation() {
  const { isAdmin } = useAdmin();
  
  return (
    <nav>
      <Link href="/dashboard">Dashboard</Link>
      {isAdmin && <Link href="/admin">Admin</Link>}
    </nav>
  );
}
```

## Accessibility

All navigation components follow WCAG 2.1 Level AA guidelines:

- Proper ARIA labels and attributes
- Keyboard navigation support
- Clear focus indicators
- Semantic HTML structure
- Screen reader friendly

## Testing

Test utilities are available for all navigation components:

```tsx
import { render, screen } from "@testing-library/react";
import { Breadcrumb } from "@/components/ui";

it("renders admin link for admin users", () => {
  render(
    <Breadcrumb
      items={mockItems}
      adminAction={{
        label: "Manage",
        href: "/admin/streams/123",
      }}
    />
  );
  
  expect(screen.getByText("Manage")).toBeInTheDocument();
});
```

## Styling

Navigation components use the application's design tokens:

- `text-text-primary` - Active/current items
- `text-text-secondary` - Inactive items
- `text-text-muted` - Separators and hints
- `border-border-default` - Borders
- `bg-card` - Background for action buttons
- `gold` - Admin action highlights

## Configuration

Admin addresses are configured via environment variable:

```env
NEXT_PUBLIC_ADMIN_WALLETS=GADMIN123,GADMIN456,GADMIN789
```

Multiple addresses should be comma-separated. Whitespace is automatically trimmed.
