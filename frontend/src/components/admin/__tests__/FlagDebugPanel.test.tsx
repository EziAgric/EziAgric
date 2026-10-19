import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { FlagDebugPanel } from "../FlagDebugPanel";
import { useFlags } from "@/components/FeatureFlagsProvider";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { FLAG_CATALOG, type FlagName } from "@/lib/featureFlags";

jest.mock("@/components/FeatureFlagsProvider", () => ({
  useFlags: jest.fn(),
}));

jest.mock("@/hooks/useIsAdmin", () => ({
  useIsAdmin: jest.fn(),
}));

const mockUseFlags = useFlags as jest.Mock;
const mockUseIsAdmin = useIsAdmin as jest.Mock;

const flagNames = Object.keys(FLAG_CATALOG) as FlagName[];

function setFlags(overrides: Partial<Record<FlagName, boolean>> = {}, isLoading = false) {
  const refresh = jest.fn();
  mockUseFlags.mockReturnValue({
    ...FLAG_CATALOG,
    ...overrides,
    isLoading,
    refresh,
    isFeatureEnabled: jest.fn(),
  });
  return refresh;
}

function openPanel() {
  fireEvent.click(screen.getByRole("button", { name: "Open feature flags panel" }));
}

describe("FlagDebugPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsAdmin.mockReturnValue(true);
  });

  it("renders nothing for non-admin users", () => {
    setFlags();
    mockUseIsAdmin.mockReturnValue(false);

    const { container } = render(<FlagDebugPanel />);

    expect(container).toBeEmptyDOMElement();
  });

  it("is collapsed until the toggle button is clicked", () => {
    setFlags();
    render(<FlagDebugPanel />);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    openPanel();
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close feature flags panel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders every flag with its current state", () => {
    const enabled = flagNames[0];
    const disabled = flagNames[1];
    setFlags({ [enabled]: true, [disabled]: false });
    render(<FlagDebugPanel />);
    openPanel();

    for (const name of flagNames) {
      expect(screen.getByTestId(`flag-debug-row-${name}`)).toBeInTheDocument();
    }
    expect(screen.getByLabelText(`${enabled} is enabled`)).toHaveTextContent("ON");
    expect(screen.getByLabelText(`${disabled} is disabled`)).toHaveTextContent("OFF");
  });

  it("calls refresh when the Refresh button is clicked", () => {
    const refresh = setFlags();
    render(<FlagDebugPanel />);
    openPanel();

    fireEvent.click(screen.getByRole("button", { name: "Refresh feature flags from server" }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("disables Refresh while flags are loading", () => {
    const refresh = setFlags({}, true);
    render(<FlagDebugPanel />);
    openPanel();

    const button = screen.getByRole("button", { name: "Refresh feature flags from server" });
    expect(button).toBeDisabled();
    expect(button).toHaveTextContent("Refreshing…");

    fireEvent.click(button);
    expect(refresh).not.toHaveBeenCalled();
  });
});
