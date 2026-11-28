import { apiClient } from './apiClient';

export interface ReputationBreakdown {
  completedTrades: number;
  disputesRaised: number;
  disputesLost: number;
  averageDeliveryTimeHours: number;
}

export interface Reputation {
  userId: string;
  score: number;
  breakdown: ReputationBreakdown;
}

export async function getReputation(userId: string): Promise<Reputation> {
  const response = await apiClient.get<Reputation>(
    `/users/${encodeURIComponent(userId)}/reputation`,
  );
  return response.data;
}
