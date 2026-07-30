import apiClient from './client';

export interface AdminAuditRecord {
  id: number;
  action: string;
  actorAddress: string;
  targetReference: string | null;
  note: string | null;
  createdAt: string;
}

export interface AdminAuditListResult {
  items: AdminAuditRecord[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export const adminApi = {
  async getAuditTrail(params?: { page?: number; limit?: number }): Promise<AdminAuditListResult> {
    const response = await apiClient.get('/api/admin/audit', { params });
    return response.data;
  },
};
