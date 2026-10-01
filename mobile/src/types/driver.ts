export type AttestationKind = 'PICKUP' | 'DELIVERY' | 'LOSS';

export interface AssignedManifest {
  id: number;
  tradeId: string;
  commodity?: string;
  quantity?: string;
  unit?: string;
  vehicleRegistration: string;
  routeDescription: string;
  expectedDeliveryAt: string;
  /** Set by the server once the corresponding attestation was received. */
  pickupAttestedAt?: string | null;
  deliveryAttestedAt?: string | null;
}

export interface QueuedAttestation {
  /** Local id; also sent as the Idempotency-Key so a retried upload is never applied twice. */
  id: string;
  manifestId: number;
  tradeId: string;
  kind: AttestationKind;
  note?: string;
  /** Persistent (non-cache) file:// uri of the recorded video. */
  videoUri: string;
  durationSec: number;
  capturedAt: string;
  createdAt: string;
  /** Server-side failures counted against `maxAttempts`; plain "offline" does not count. */
  attempts: number;
  status: 'PENDING' | 'FAILED';
  lastError?: string;
}
