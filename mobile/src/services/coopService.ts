import { apiClient } from './apiClient';

export interface CoopSummary {
  coopId: string;
  activeTrades: number;
  totalEscrowCngn: number;
  memberCount: number;
  openDisputes: number;
}

export async function fetchCoopSummary(coopId: string): Promise<CoopSummary> {
  const response = await apiClient.get<CoopSummary>(`/coops/${coopId}/summary`);
  return response.data;
}
