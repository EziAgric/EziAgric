import { Pool } from 'pg';
import { pool } from '../db';
import { appLogger } from '../middleware/logger';
import { sendSms } from './smsService';

export interface Trade {
  id: string;
  created_at: string;
  [key: string]: unknown;
}

export interface CursorPayload {
  created_at: string;
  id: string;
}

export interface TradePage {
  items: Trade[];
  nextCursor: string | null;
}

export interface ListTradesParams {
  cursor?: string;
  limit?: number;
  page?: number;
  offset?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64');
}

export function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const parsed = JSON.parse(decoded);
    if (
      parsed &&
      typeof parsed.created_at === 'string' &&
      typeof parsed.id === 'string'
    ) {
      return { created_at: parsed.created_at, id: parsed.id };
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeLimit(limit?: number): number {
  if (!limit || !Number.isFinite(limit) || limit <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

export class TradeService {
  constructor(private readonly db: Pool = pool) {}

  async listTrades(params: ListTradesParams = {}): Promise<TradePage> {
    const limit = normalizeLimit(params.limit);

    if (params.cursor) {
      return this.listTradesByCursor(params.cursor, limit);
    }

    // Deprecated offset-based pagination (page/offset) kept for backwards
    // compatibility. Prefer cursor-based pagination for new clients.
    return this.listTradesByOffset(params, limit);
  }

  private async listTradesByCursor(
    cursor: string,
    limit: number,
  ): Promise<TradePage> {
    const decoded = decodeCursor(cursor);
    if (!decoded) {
      throw new Error('Invalid cursor');
    }

    // Fetch one extra row to determine whether another page exists.
    const result = await this.db.query<Trade>(
      `SELECT * FROM trades
       WHERE (created_at, id) < ($1, $2)
       ORDER BY created_at DESC, id DESC
       LIMIT $3`,
      [decoded.created_at, decoded.id, limit + 1],
    );

    return this.buildPage(result.rows, limit);
  }

  private async listTradesByOffset(
    params: ListTradesParams,
    limit: number,
  ): Promise<TradePage> {
    let offset = 0;
    if (typeof params.offset === 'number' && params.offset > 0) {
      offset = Math.floor(params.offset);
    } else if (typeof params.page === 'number' && params.page > 0) {
      offset = (Math.floor(params.page) - 1) * limit;
    }

    const result = await this.db.query<Trade>(
      `SELECT * FROM trades
       ORDER BY created_at DESC, id DESC
       LIMIT $1 OFFSET $2`,
      [limit + 1, offset],
    );

    return this.buildPage(result.rows, limit);
  }

  private buildPage(rows: Trade[], limit: number): TradePage {
    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const last = items[items.length - 1];
    const nextCursor =
      hasMore && last
        ? encodeCursor({ created_at: last.created_at, id: last.id })
        : null;

    return { items, nextCursor };
  }
}

export const tradeService = new TradeService();

/**
 * Trade Service
 */

export interface DisputeParty {
  name: string;
  phone?: string | null;
}

export interface DisputedTrade {
  id: string;
  buyer: DisputeParty;
  seller: DisputeParty;
}

/**
 * SMS both parties when a dispute is opened. Delivery failures are logged,
 * never thrown, so they cannot block dispute creation.
 * Call after the dispute record is created.
 */
export async function notifyDisputeOpened(trade: DisputedTrade): Promise<void> {
  const link = `${process.env.APP_URL ?? ""}/trades/${trade.id}/dispute`;
  const parties: Array<[DisputeParty, DisputeParty]> = [
    [trade.buyer, trade.seller],
    [trade.seller, trade.buyer],
  ];

  await Promise.all(
    parties.map(async ([recipient, other]) => {
      if (!recipient.phone) return;
      const message = `Trade ${trade.id}: ${other.name} has opened a dispute. Respond promptly to avoid a default ruling: ${link}`;
      try {
        await sendSms(recipient.phone, message);
      } catch (err) {
        appLogger.error("Dispute-opened SMS failed", {
          tradeId: trade.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }),
  );
}