import React from "react";
import { render, act } from "@testing-library/react";
import { ToastProvider, useToast } from "@/hooks/useToast";
import { useTransactionToast } from "@/hooks/useTransactionToast";
import {
  pollTransactionStatus,
  type TxStatusResult,
} from "@/lib/stellar/txStatus";

jest.mock("@/lib/stellar/txStatus", () => ({
  pollTransactionStatus: jest.fn(),
  stellarExpertTxUrl: jest.fn(
    (hash: string) => `https://stellar.expert/explorer/testnet/tx/${hash}`,
  ),
}));

const mockPoll = pollTransactionStatus as jest.MockedFunction<
  typeof pollTransactionStatus
>;

type ToastApi = ReturnType<typeof useToast>;
type TxApi = ReturnType<typeof useTransactionToast>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function Harness({
  onReady,
}: {
  onReady: (tx: TxApi, toasts: ToastApi) => void;
}) {
  const tx = useTransactionToast();
  const toasts = useToast();
  React.useEffect(() => {
    onReady(tx, toasts);
  }, [tx, toasts, onReady]);
  return null;
}

async function renderHarness() {
  let tx!: TxApi;
  let toasts!: ToastApi;
  await act(async () => {
    render(
      <ToastProvider>
        <Harness
          onReady={(t, s) => {
            tx = t;
            toasts = s;
          }}
        />
      </ToastProvider>,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    get tx() {
      return tx;
    },
    get toasts() {
      return toasts;
    },
  };
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  mockPoll.mockReset();
});

describe("useTransactionToast", () => {
  it("shows a pending toast with an explorer link, then resolves to success", async () => {
    // Each test uses a unique hash: the toast correlation map is module-scoped.
    const poll = deferred<TxStatusResult>();
    mockPoll.mockReturnValue(poll.promise);
    const ref = await renderHarness();

    act(() => {
      ref.tx.trackTransaction("hash-success", { label: "Trade created" });
    });

    // Pending toast is visible immediately, with the Stellar Expert link.
    expect(ref.toasts.toasts).toHaveLength(1);
    expect(ref.toasts.toasts[0].type).toBe("info");
    expect(ref.toasts.toasts[0].title).toBe("Pending");
    expect(ref.toasts.toasts[0].message).toMatch(/awaiting Stellar confirmation/);
    expect(ref.toasts.toasts[0].link?.href).toBe(
      "https://stellar.expert/explorer/testnet/tx/hash-success",
    );

    await act(async () => {
      poll.resolve({ status: "success", hash: "hash-success", ledger: 5 });
      await poll.promise;
    });
    await flush();

    // Same toast updated in place, not duplicated.
    expect(ref.toasts.toasts).toHaveLength(1);
    expect(ref.toasts.toasts[0].type).toBe("success");
    expect(ref.toasts.toasts[0].title).toBe("Confirmed");
    expect(ref.toasts.toasts[0].link?.href).toContain("/tx/hash-success");
  });

  it("updates the toast to an error when the transaction fails", async () => {
    mockPoll.mockResolvedValue({ status: "failed", hash: "hash-fail" });
    const ref = await renderHarness();

    act(() => {
      ref.tx.trackTransaction("hash-fail", { label: "Release funds" });
    });
    await flush();

    expect(ref.toasts.toasts).toHaveLength(1);
    expect(ref.toasts.toasts[0].type).toBe("error");
    expect(ref.toasts.toasts[0].title).toBe("Transaction failed");
  });

  it("warns when the transaction is still pending at timeout", async () => {
    mockPoll.mockResolvedValue({ status: "pending", hash: "hash-pending" });
    const ref = await renderHarness();

    act(() => {
      ref.tx.trackTransaction("hash-pending");
    });
    await flush();

    expect(ref.toasts.toasts[0].type).toBe("warning");
    expect(ref.toasts.toasts[0].title).toBe("Still pending");
  });

  it("reuses a caller-supplied correlation id instead of stacking toasts", async () => {
    mockPoll.mockResolvedValue({ status: "success", hash: "hash-corr" });
    const ref = await renderHarness();

    act(() => {
      ref.toasts.addToastWithCorrelation({
        type: "info",
        title: "In progress",
        message: "Locking funds…",
        correlationId: "corr-reuse-1",
        duration: 0,
      });
      ref.tx.trackTransaction("hash-corr", { correlationId: "corr-reuse-1" });
    });
    await flush();

    expect(ref.toasts.toasts).toHaveLength(1);
    expect(ref.toasts.toasts[0].correlationId).toBe("corr-reuse-1");
    expect(ref.toasts.toasts[0].type).toBe("success");
  });

  it("drops the pending toast when polling is aborted", async () => {
    const abortError = new Error("aborted");
    abortError.name = "AbortError";
    mockPoll.mockRejectedValue(abortError);
    const ref = await renderHarness();

    act(() => {
      ref.tx.trackTransaction("hash-abort");
    });
    await flush();

    expect(ref.toasts.toasts).toHaveLength(0);
  });
});
