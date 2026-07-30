/**
 * Admin stream management API helpers.
 *
 * "Streams" in the admin context refer to active trade streams / payment
 * channels that an admin can monitor and act on (pause, resume, terminate).
 *
 * All calls are routed through `adminRequest` so the admin token guard and
 * correlation-ID forwarding apply automatically.
 */

import { adminRequest, type AdminRequestOptions } from "./admin";
import { createQueryString } from "./client";

export type StreamStatus = "active" | "paused" | "closed" | "pending";

export interface AdminStream {
  id: string;
  tradeId: string;
  sellerAddress: string;
  buyerAddress: string;
  amountCngn: string;
  status: StreamStatus;
  createdAt: string;
  updatedAt: string;
  note?: string;
}

export interface AdminStreamListResponse {
  items: AdminStream[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminStreamUpdateBody {
  status: StreamStatus;
  note?: string;
}

export const adminStreamApi = {
  /**
   * List all admin-visible streams with optional pagination and status filter.
   */
  list: (
    token: string,
    params?: { page?: number; limit?: number; status?: StreamStatus },
    options?: AdminRequestOptions,
  ) =>
    adminRequest<AdminStreamListResponse>(
      `/admin/streams${createQueryString({
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
      })}`,
      token,
      options,
    ),

  /**
   * Update a single stream's status (pause / resume / close).
   */
  update: (
    token: string,
    streamId: string,
    body: AdminStreamUpdateBody,
    options?: AdminRequestOptions,
  ) =>
    adminRequest<AdminStream>(
      `/admin/streams/${encodeURIComponent(streamId)}`,
      token,
      { ...options, method: "PATCH", body: JSON.stringify(body) },
    ),
};
