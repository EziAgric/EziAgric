/**
 * Canonical constants for the mobile admin screens.
 *
 * Kept out of `../api/admin` (which owns the network client) so that:
 *   - test setups using `jest.mock('../api/admin', …)` no longer have to
 *     re-declare a parallel `TRADE_STATUSES` array inside the mock
 *     factory; consumers can `jest.requireActual('../api/admin')` and
 *     this module flows through unchanged.
 *   - any future screen (e.g. a trade filter that exposes the
 *     admin-targetable set) can import the value without taking the
 *     network module as a dependency.
 */

/**
 * Backend TradeStatus values the mobile admin screens can target via
 * `POST /api/admin/trades/batch/status`. Mirrors
 * `backend/src/routes/admin.trades.batch.routes.ts`'s `TradeStatus`
 * from `@prisma/client` so the dropdown matches the backend's
 * `VALID_TRANSITIONS` table.
 */
export const TRADE_STATUSES = [
  'PENDING_SIGNATURE',
  'CREATED',
  'FUNDED',
  'DELIVERED',
  'DISPUTED',
  'COMPLETED',
  'CANCELLED',
] as const;

export type TradeStatus = (typeof TRADE_STATUSES)[number];
