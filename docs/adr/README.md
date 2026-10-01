# Architecture Decision Records

This directory records the architecture decisions for the project. Each ADR
follows the template in `template.md` and uses the status lifecycle
`proposed` -> `accepted` -> `superseded`.

## Index

| ADR | Title | Status |
| --- | ----- | ------ |
| [001](001-backend-architecture.md) | Backend architecture | Accepted |
| [002](002-frontend-architecture.md) | Frontend architecture | Accepted |
| [003](003-database-and-persistence.md) | Database and persistence | Accepted |
| [004](004-authentication-and-authorization.md) | Authentication and authorization | Accepted |
| [005](005-api-and-integration.md) | API and integration | Accepted |
| [006](006-mobile-navigation-and-state.md) | Mobile navigation and state architecture | Accepted |
| [007](007-offline-caching-and-conflict-resolution.md) | Offline caching and conflict resolution | Accepted |
| [008](008-notification-and-deep-link-architecture.md) | Notification and deep-link architecture | Accepted |

## Supersede procedure

To supersede a decision, add a new ADR and set the superseded document's status
to `Superseded by ADR-XXX`. The decision text of a superseded ADR is never edited
in place; the new ADR records the replacement decision and links back to the one
it supersedes.
