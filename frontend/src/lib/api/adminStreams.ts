import { createQueryString, request } from "./client";
import type {
  AdminStreamListResponse,
  StreamClawbackPreviewResponse,
  StreamStatus,
  VestingState,
} from "./types";

export interface AdminStreamListParams {
  page?: number;
  limit?: number;
  status?: StreamStatus;
  vestingState?: VestingState;
  adminTag?: string;
}

export const adminStreamsApi = {
  list: (token: string, params?: AdminStreamListParams) =>
    request<AdminStreamListResponse>(
      `/admin/streams${createQueryString({
        page: params?.page,
        limit: params?.limit,
        status: params?.status,
        vestingState: params?.vestingState,
        adminTag: params?.adminTag,
      })}`,
      { token },
    ),

  clawbackPreview: (token: string, streamId: string, amount: string) =>
    request<StreamClawbackPreviewResponse>(
      `/admin/streams/${encodeURIComponent(streamId)}/clawback/preview`,
      {
        token,
        method: "POST",
        body: JSON.stringify({ amount }),
      },
    ),
};
