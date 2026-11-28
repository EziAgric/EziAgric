/**
 * Wallet connection state machine.
 *
 * Freighter integration used to assume "installed + unlocked + right network".
 * Every other reality — extension absent, extension locked, user dismissed the
 * popup, wrong network, hung response — surfaced as a button that "does
 * nothing". This module enumerates all states, derives the current one from
 * Freighter probe results, and maps each to actionable copy + a next action.
 *
 * Pure & framework-free so the full state matrix is unit-testable.
 */
import { t } from "@/lib/i18n";
import { trackEvent, trackFailure } from "@/lib/analytics";

export type WalletState =
  | "idle" // nothing attempted yet
  | "detecting" // probing the extension
  | "absent" // Freighter not installed
  | "locked" // installed but locked (password not entered)
  | "connecting" // requestAccess in flight
  | "rejected" // user dismissed / declined the popup
  | "wrong-network" // connected but on a different network than the app needs
  | "connected" // authorized + correct network + address available
  | "timeout" // extension did not answer in time
  | "error"; // unexpected failure

export const WALLET_STATES: readonly WalletState[] = [
  "idle",
  "detecting",
  "absent",
  "locked",
  "connecting",
  "rejected",
  "wrong-network",
  "connected",
  "timeout",
  "error",
];

/** A state is "terminal-blocked" if the user must act before a connection can succeed. */
export const BLOCKED_STATES: readonly WalletState[] = [
  "absent",
  "locked",
  "rejected",
  "wrong-network",
  "timeout",
  "error",
];

export interface WalletProbe {
  /** `window.freighterApi` present / `isConnected()` succeeded. */
  detected: boolean;
  /** `isAllowed()` — app is on Freighter's allow-list. */
  allowed: boolean;
  /** A non-empty address came back from `getAddress()`. */
  hasAddress: boolean;
  /** Network reported by the extension, e.g. "TESTNET" / "PUBLIC". */
  network: string | null;
  /** Network the app requires. */
  expectedNetwork: string;
  /** `requestAccess()` is currently awaiting the user. */
  connecting?: boolean;
  /** Last error surfaced by a Freighter call. */
  error?: WalletProbeError | null;
}

export type WalletProbeError =
  | "declined" // user rejected the access request
  | "locked" // extension reports it is locked
  | "timeout" // call exceeded the deadline
  | "unknown";

/** Single source of truth: probe results → current state. */
export function deriveWalletState(probe: WalletProbe): WalletState {
  if (probe.connecting) return "connecting";

  switch (probe.error) {
    case "declined":
      return "rejected";
    case "timeout":
      return "timeout";
    case "locked":
      return "locked";
    case "unknown":
      return "error";
  }

  if (!probe.detected) return "absent";
  // Allow-listed but no address → the extension is locked.
  if (probe.allowed && !probe.hasAddress) return "locked";
  if (!probe.allowed || !probe.hasAddress) return "idle";
  if (probe.network && probe.network !== probe.expectedNetwork) return "wrong-network";
  return "connected";
}

export interface WalletStateView {
  state: WalletState;
  title: string;
  body: string;
  /** Primary action label, or null when the state needs no user action. */
  ctaLabel: string | null;
  /** What the primary action should do. */
  action: WalletAction | null;
  /** External help URL for `install` / `unlock`. */
  href?: string;
}

export type WalletAction = "install" | "unlock" | "retry" | "switch-network" | "connect";

const FREIGHTER_HOME = "https://www.freighter.app/";

export function describeWalletState(
  state: WalletState,
  ctx: { expectedNetwork?: string } = {},
): WalletStateView {
  const expected = ctx.expectedNetwork ?? "";
  switch (state) {
    case "absent":
      return {
        state,
        title: t("wallet.absentTitle"),
        body: t("wallet.absentBody"),
        ctaLabel: t("wallet.absentCta"),
        action: "install",
        href: FREIGHTER_HOME,
      };
    case "locked":
      return {
        state,
        title: t("wallet.lockedTitle"),
        body: t("wallet.lockedBody"),
        ctaLabel: t("wallet.lockedCta"),
        action: "unlock",
        href: FREIGHTER_HOME,
      };
    case "rejected":
      return {
        state,
        title: t("wallet.rejectedTitle"),
        body: t("wallet.rejectedBody"),
        ctaLabel: t("wallet.rejectedCta"),
        action: "retry",
      };
    case "wrong-network":
      return {
        state,
        title: t("wallet.wrongNetworkTitle"),
        body: t("wallet.wrongNetworkBody", { expected }),
        ctaLabel: t("wallet.wrongNetworkCta", { expected }),
        action: "switch-network",
      };
    case "timeout":
      return {
        state,
        title: t("wallet.timeoutTitle"),
        body: t("wallet.timeoutBody"),
        ctaLabel: t("wallet.timeoutCta"),
        action: "retry",
      };
    case "error":
      return {
        state,
        title: t("common.somethingWentWrong"),
        body: t("wallet.timeoutBody"),
        ctaLabel: t("common.retry"),
        action: "retry",
      };
    case "connecting":
      return {
        state,
        title: t("wallet.connecting"),
        body: t("wallet.connecting"),
        ctaLabel: null,
        action: null,
      };
    case "connected":
      return {
        state,
        title: t("wallet.connect"),
        body: "",
        ctaLabel: null,
        action: null,
      };
    default:
      return {
        state,
        title: t("wallet.connect"),
        body: "",
        ctaLabel: t("wallet.connect"),
        action: "connect",
      };
  }
}

/**
 * Race a Freighter call against a deadline so a hung extension never leaves the
 * UI in an indefinite "connecting" stall. Resolves to `timeout` sentinel.
 */
export const WALLET_CALL_TIMEOUT_MS = 8_000;

export const WALLET_TIMEOUT = Symbol("wallet-timeout");

export function withWalletTimeout<T>(
  promise: Promise<T>,
  ms: number = WALLET_CALL_TIMEOUT_MS,
): Promise<T | typeof WALLET_TIMEOUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(WALLET_TIMEOUT), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Emit a telemetry event for a state so we can measure how often each is hit. */
export function trackWalletState(
  state: WalletState,
  meta: Record<string, unknown> = {},
): void {
  trackEvent("wallet_state", { state, ...meta });
  if ((BLOCKED_STATES as readonly string[]).includes(state)) {
    trackFailure("wallet_blocked", { state, ...meta });
  }
}
