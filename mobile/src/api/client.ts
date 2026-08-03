import axios from 'axios';

import { adminErrorResponseErrorInterceptor } from './errorInterceptor';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:4000';

const apiClient = axios.create({
  baseURL: API_URL,
  timeout: 10000,
});

// Add token to requests
apiClient.interceptors.request.use((config) => {
  // Token would be added here from secure store if needed
  return config;
});

// Map backend admin errors into typed AdminApiError instances so screens
// and stores don't have to handle raw AxiosErrors.
apiClient.interceptors.response.use(
  (response) => response,
  adminErrorResponseErrorInterceptor,
);

export default apiClient;
