jest.mock("@/lib/analytics", () => ({
  trackEvent: jest.fn(),
  trackFailure: jest.fn(),
}));

import {
  BLOCKED_STATES,
  deriveWalletState,
  describeWalletState,
  trackWalletState,
  WALLET_STATES,
  WALLET_TIMEOUT,
  withWalletTimeout,
  type WalletProbe,
} from "../state-machine";
import { trackEvent, trackFailure } from "@/lib/analytics";

const base: WalletProbe = {
  detected: true,
  allowed: true,
  hasAddress: true,
  network: "TESTNET",
  expectedNetwork: "TESTNET",
};

describe("deriveWalletState — full state matrix", () => {
  const cases: Array<[string, Partial<WalletProbe>, string]> = [
    ["extension not installed", { detected: false }, "absent"],
    ["installed, allow-listed, no address → locked", { allowed: true, hasAddress: false }, "locked"],
    ["extension reports locked error", { error: "locked" }, "locked"],
    ["user dismissed the popup", { error: "declined" }, "rejected"],
    ["hung extension response", { error: "timeout" }, "timeout"],
    ["unexpected failure", { error: "unknown" }, "error"],
    ["connected but on PUBLIC when app needs TESTNET", { network: "PUBLIC" }, "wrong-network"],
    ["requestAccess in flight", { connecting: true }, "connecting"],
    ["not yet authorized", { allowed: false, hasAddress: false }, "idle"],
    ["fully connected on the right network", {}, "connected"],
  ];

  it.each(cases)("%s → %s", (_label, patch, expected) => {
    expect(deriveWalletState({ ...base, ...patch })).toBe(expected);
  });

  it("connecting wins over every other signal", () => {
    expect(
      deriveWalletState({ ...base, connecting: true, detected: false, error: "declined" }),
    ).toBe("connecting");
  });
});

describe("describeWalletState — every state has actionable UI", () => {
  it.each(WALLET_STATES.filter((s) => s !== "idle" && s !== "connected" && s !== "connecting" && s !== "detecting"))(
    "%s exposes a title, body and a CTA action",
    (state) => {
      const view = describeWalletState(state, { expectedNetwork: "Testnet" });
      expect(view.title).toBeTruthy();
      expect(view.ctaLabel).toBeTruthy();
      expect(view.action).toBeTruthy();
    },
  );

  it("interpolates the expected network into wrong-network copy", () => {
    const view = describeWalletState("wrong-network", { expectedNetwork: "Testnet" });
    expect(view.body).toContain("Testnet");
    expect(view.action).toBe("switch-network");
  });

  it("absent + locked deep-link to Freighter", () => {
    expect(describeWalletState("absent").href).toContain("freighter.app");
    expect(describeWalletState("locked").href).toContain("freighter.app");
  });
});

describe("withWalletTimeout — no silent stalls", () => {
  jest.useFakeTimers();

  it("resolves to the timeout sentinel when the call hangs", async () => {
    const hung = new Promise<string>(() => {});
    const raced = withWalletTimeout(hung, 8_000);
    jest.advanceTimersByTime(8_000);
    await expect(raced).resolves.toBe(WALLET_TIMEOUT);
  });

  it("passes through a value that resolves in time", async () => {
    await expect(withWalletTimeout(Promise.resolve("ok"), 8_000)).resolves.toBe("ok");
  });
});

describe("trackWalletState — telemetry for state frequencies", () => {
  beforeEach(() => jest.clearAllMocks());

  it("emits a wallet_state event for every state", () => {
    trackWalletState("connected");
    expect(trackEvent).toHaveBeenCalledWith("wallet_state", { state: "connected" });
  });

  it("also emits a failure event for blocked states", () => {
    for (const state of BLOCKED_STATES) {
      trackWalletState(state);
    }
    expect(trackFailure).toHaveBeenCalledTimes(BLOCKED_STATES.length);
  });
});
