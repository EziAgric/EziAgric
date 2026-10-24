import apiClient from './client';

export type CoopRole = 'MEMBER' | 'MANAGER' | 'ADMIN';

export interface CoopStats {
  coopId: string;
  name: string;
  memberCount: number;
  activeTrades: number;
  totalVolumeUsdc: number;
}

export interface CoopTrade {
  tradeId: string;
  buyerAddress: string;
  sellerAddress: string;
  amountUsdc: number;
  status: string;
  createdAt: string;
}

export interface CoopAnnouncement {
  id: string;
  title: string;
  body: string;
  publishedAt: string;
}

export interface CoopHomeData {
  role: CoopRole;
  stats: CoopStats;
  recentTrades: CoopTrade[];
  announcements: CoopAnnouncement[];
}

export const cooperativeApi = {
  getHome: async (coopId: string): Promise<CoopHomeData> => {
    const { data } = await apiClient.get<CoopHomeData>(`/api/v1/cooperatives/${coopId}/home`);
    return data;
  },

  /** Manager-only: post an announcement to the co-op feed. */
  postAnnouncement: async (coopId: string, title: string, body: string): Promise<CoopAnnouncement> => {
    const { data } = await apiClient.post<CoopAnnouncement>(`/api/v1/cooperatives/${coopId}/announcements`, { title, body });
    return data;
  },
};
