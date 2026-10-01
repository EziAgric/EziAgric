import type { TradePrefill } from '../lib/tradePrefill';
import type { AdminActionType } from '../screens/AdminActionSuccessScreen';

export type RootStackParamList = {
  WalletConnect: undefined;
  TradeList: undefined;
  TradeDetail: { tradeId: string };
  DisputeDetail: { id: string };
  /** #433 — optional prefill when starting a trade from a listing. */
  CreateTrade: { prefill?: TradePrefill } | undefined;
  /** #432 — marketplace browse and listing detail. */
  Marketplace: undefined;
  ListingDetail: { listingId: string };
  /** #434 — seller creates a listing with camera photos. */
  CreateListing: undefined;
  /** #435 — driver mode: assigned manifests and pickup/delivery/loss attestation. */
  DriverHome: undefined;
  DriverAttestation: { manifestId: number; tradeId: string; kind: 'PICKUP' | 'DELIVERY' | 'LOSS' };
  EvidenceCapture: { tradeId: string };
  VaultDashboard: undefined;
  AdminStreamsOverview: undefined;
  AdminTradesBatch: undefined;
  AdminContract: undefined;
  AdminFeatures: undefined;
  /** #85 — confirmation screen after a completed admin operation. */
  AdminActionSuccess: {
    actionType: AdminActionType;
    streamId: string;
    timestamp: string;
  };
  /** #437 — mediator-only dispute queue and review screens. */
  MediatorDisputeList: undefined;
  MediatorDisputeReview: { disputeId: string };
  /** #440 — profile and trust score screens. */
  Profile: { address: string; isSelf?: boolean };
  TrustScore: { address: string };
  /** #441 — post-trade review screen. */
  LeaveReview: { tradeId: string; counterpartyAddress: string };
};
