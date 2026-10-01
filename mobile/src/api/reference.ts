import apiClient from './client';

export interface ReferenceItem {
  /** Stable code sent back to the API, e.g. `maize` or `NG-KD`. */
  code: string;
  /** Human-readable label. */
  name: string;
}

/** Used when the reference endpoints are unreachable so pickers stay usable. */
export const FALLBACK_COMMODITIES: ReferenceItem[] = [
  'Maize', 'Rice', 'Sorghum', 'Millet', 'Cassava', 'Yam', 'Groundnut', 'Soybean',
].map((name) => ({ code: name.toLowerCase(), name }));

export const referenceApi = {
  async listCommodities(): Promise<ReferenceItem[]> {
    const response = await apiClient.get('/reference/commodities');
    return response.data;
  },

  async listRegions(): Promise<ReferenceItem[]> {
    const response = await apiClient.get('/reference/regions');
    return response.data;
  },
};
