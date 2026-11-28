import { request } from "./client";
import type { ReputationResponse } from "./types";

export const reputationApi = {
  getMyReputation: (token: string) =>
    request<ReputationResponse>("/users/me/reputation", { token }),

  getUserReputation: (address: string) =>
    request<ReputationResponse>(`/users/${address}/reputation`),
};
