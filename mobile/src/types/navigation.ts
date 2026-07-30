import type { AdminActionType } from '../screens/AdminActionSuccessScreen';

export type RootStackParamList = {
  WalletConnect: undefined;
  TradeList: undefined;
  TradeDetail: { id: string } | { tradeId: string };
  DisputeDetail: { id: string };
  CreateTrade: undefined;
  EvidenceCapture: { tradeId: string };
  VaultDashboard: undefined;
  AdminStreamsOverview: undefined;
  /** #85 — confirmation screen after a completed admin operation. */
  AdminActionSuccess: {
    actionType: AdminActionType;
    streamId: string;
    timestamp: string;
  };
};
