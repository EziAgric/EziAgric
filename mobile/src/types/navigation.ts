import type { AdminActionType } from '../screens/AdminActionSuccessScreen';

export type RootStackParamList = {
  WalletConnect: undefined;
  TradeList: undefined;
  TradeDetail: { tradeId: string };
  DisputeDetail: { id: string };
  CreateTrade: undefined;
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
