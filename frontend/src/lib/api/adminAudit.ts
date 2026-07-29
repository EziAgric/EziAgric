import { createQueryString, request } from "./client";
import type { AdminAuditListResponse } from "./types";

export const adminAuditApi = {
  list: (token: string, params?: { page?: number; limit?: number }) =>
    request<AdminAuditListResponse>(
      `/admin/audit${createQueryString({
        page: params?.page,
        limit: params?.limit,
      })}`,
      { token },
    ),
};
