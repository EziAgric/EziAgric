import { env } from './env';

export interface AdminQuotaPreset {
  windowMs: number;
  max: number;
  message: string;
}

export const ADMIN_QUOTA_CONFIG = {
  treasuryWithdraw: {
    windowMs: env.ADMIN_QUOTA_CLAWBACK_WINDOW_MS,
    max: env.ADMIN_QUOTA_CLAWBACK_MAX,
    message: 'Treasury withdrawal (clawback) quota exceeded for this admin, try again later.',
  },
  tradeBatchStatus: {
    windowMs: env.ADMIN_QUOTA_TRADE_BATCH_WINDOW_MS,
    max: env.ADMIN_QUOTA_TRADE_BATCH_MAX,
    message: 'Batch trade status update quota exceeded for this admin, try again later.',
  },
} as const satisfies Record<string, AdminQuotaPreset>;
