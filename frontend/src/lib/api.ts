import { adminAuditApi } from "./api/adminAudit";
import { adminStreamsApi } from "./api/adminStreams";
import { authApi } from "./api/auth";
import { ApiError } from "./api/client";
import { disputesApi } from "./api/disputes";
import { getApiBaseUrl, getStellarNetworkPassphrase, getStellarRpcUrl } from "./api/env";
import { searchApi } from "./api/search";
import { tradesApi } from "./api/trades";
import { walletApi } from "./api/wallet";

export type {
  AdminAuditEntry,
  AdminAuditListResponse,
  AdminStreamSummary,
  AdminStreamListResponse,
  StreamClawbackPreviewResponse,
  StreamStatus,
  VestingState,
  ChallengeResponse,
  CreateTradeRequest,
  CreateTradeResponse,
  DepositResponse,
  DisputeListResponse,
  DisputeResponse,
  EvidenceRecord,
  EvidenceResponse,
  PathPaymentQuote,
  SearchResponse,
  SearchResultItem,
  TradeHistoryEvent,
  TradeHistoryResponse,
  TradeListResponse,
  TradeResponse,
  TradeStatsResponse,
  VerifyResponse,
} from "./api/types";

export const api = {
  auth: authApi,
  adminAudit: adminAuditApi,
  adminStreams: adminStreamsApi,
  search: searchApi,
  trades: tradesApi,
  wallet: walletApi,
};

export const apiConfig = {
  getBaseUrl: getApiBaseUrl,
  getStellarRpcUrl,
  getStellarNetworkPassphrase,
};

export { ApiError };
