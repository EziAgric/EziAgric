import dotenv from 'dotenv';

dotenv.config();

const parseNumber = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Default SLA window (in hours) for a dispute before it is considered overdue.
 * Used when a category has no explicit override below.
 */
const DEFAULT_DISPUTE_SLA_HOURS = parseNumber(process.env.DISPUTE_SLA_HOURS, 72);

/**
 * Per-category SLA overrides, expressed in hours. Categories not listed here
 * fall back to DEFAULT_DISPUTE_SLA_HOURS. Values can be tuned via env vars of
 * the form DISPUTE_SLA_HOURS_<CATEGORY> (e.g. DISPUTE_SLA_HOURS_PAYMENT).
 */
const disputeSlaHoursByCategory: Record<string, number> = {
  payment: parseNumber(process.env.DISPUTE_SLA_HOURS_PAYMENT, 24),
  delivery: parseNumber(process.env.DISPUTE_SLA_HOURS_DELIVERY, 48),
  quality: parseNumber(process.env.DISPUTE_SLA_HOURS_QUALITY, 72),
  other: parseNumber(process.env.DISPUTE_SLA_HOURS_OTHER, DEFAULT_DISPUTE_SLA_HOURS),
};

/**
 * Fraction of the SLA window at which the assigned mediator is notified.
 * At 1.0 the dispute is escalated to admins.
 */
const disputeSlaNotifyThreshold = parseNumber(process.env.DISPUTE_SLA_NOTIFY_THRESHOLD, 0.75);
const disputeSlaEscalateThreshold = parseNumber(process.env.DISPUTE_SLA_ESCALATE_THRESHOLD, 1);

/**
 * How often the dispute SLA scheduler runs, in milliseconds.
 */
const disputeSlaCheckIntervalMs = parseNumber(process.env.DISPUTE_SLA_CHECK_INTERVAL_MS, 15 * 60 * 1000);

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseNumber(process.env.PORT, 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.JWT_SECRET || '',
  disputeSla: {
    defaultHours: DEFAULT_DISPUTE_SLA_HOURS,
    hoursByCategory: disputeSlaHoursByCategory,
    notifyThreshold: disputeSlaNotifyThreshold,
    escalateThreshold: disputeSlaEscalateThreshold,
    checkIntervalMs: disputeSlaCheckIntervalMs,
  },
};

export type AppConfig = typeof config;

export default config;
