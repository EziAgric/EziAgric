import { act, render, screen } from "@testing-library/react";
import { ConnectivityBanner } from "../ConnectivityBanner";
import { OfflineState } from "../OfflineState";
import { useOffline } from "@/hooks/useOffline";

jest.mock("@/hooks/useToast", () => ({
  useToast: () => ({ addToast: jest.fn(), addToastWithCorrelation: jest.fn() }),
}));
jest.mock("@/lib/api/client", () => ({ request: jest.fn() }));
jest.mock("@/lib/api/env", () => ({ getApiBaseUrl: () => "http://localhost" }));

function OfflineStateHarness() {
  const { isOffline, retryOnline } = useOffline();
  return isOffline ? <OfflineState onRetry={() => void retryOnline()} /> : <p>online content</p>;
}

describe("connectivity UI", () => {
  beforeEach(() => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200 }) as unknown as typeof fetch;
  });

  async function renderAndSettle(ui: React.ReactElement) {
    const result = render(ui);
    await act(async () => {});
    return result;
  }

  describe("ConnectivityBanner", () => {
    it("is hidden while online", async () => {
      await renderAndSettle(<ConnectivityBanner />);
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });

    it("becomes visible on an offline event and hides when back online", async () => {
      await renderAndSettle(<ConnectivityBanner />);

      await act(async () => {
        window.dispatchEvent(new Event("offline"));
      });
      expect(screen.getByRole("status")).toHaveTextContent(/you’re offline/i);
      expect(screen.getByRole("button", { name: "Retry connection" })).toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  describe("OfflineState", () => {
    it("renders when offline and disappears when back online", async () => {
      await renderAndSettle(<OfflineStateHarness />);
      expect(screen.getByText("online content")).toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(new Event("offline"));
      });
      expect(screen.getByRole("status")).toHaveTextContent(/you're offline/i);
      expect(screen.queryByText("online content")).not.toBeInTheDocument();

      await act(async () => {
        window.dispatchEvent(new Event("online"));
      });
      expect(screen.getByText("online content")).toBeInTheDocument();
      expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();
    });

    it("only renders the retry button when onRetry is provided", () => {
      const onRetry = jest.fn();
      const { rerender } = render(<OfflineState />);
      expect(screen.queryByRole("button")).not.toBeInTheDocument();

      rerender(<OfflineState onRetry={onRetry} />);
      screen.getByRole("button", { name: "Retry connection" }).click();
      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
