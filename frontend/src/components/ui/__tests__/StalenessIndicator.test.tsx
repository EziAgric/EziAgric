/**
 * Tests for the StalenessIndicator component.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { StalenessIndicator } from "../StalenessIndicator";

describe("StalenessIndicator", () => {
  it("renders nothing when data is fresh and online", () => {
    const { container } = render(
      <StalenessIndicator
        isStale={false}
        isOffline={false}
        cachedAt={Date.now()}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders 'Stale' badge when isStale=true", () => {
    render(
      <StalenessIndicator
        isStale={true}
        isOffline={false}
        cachedAt={Date.now() - 6 * 60 * 1000}
      />,
    );
    expect(screen.getByTestId("staleness-indicator")).toBeInTheDocument();
    expect(screen.getByTestId("staleness-indicator")).toHaveTextContent("Stale");
  });

  it("renders 'Offline' badge when isOffline=true", () => {
    render(
      <StalenessIndicator
        isStale={true}
        isOffline={true}
        cachedAt={Date.now() - 2 * 60 * 1000}
      />,
    );
    expect(screen.getByTestId("staleness-indicator")).toHaveTextContent("Offline");
  });

  it("renders with role=status for screen readers", () => {
    render(
      <StalenessIndicator
        isStale={true}
        isOffline={false}
        cachedAt={Date.now() - 90_000}
      />,
    );
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows elapsed time in stale badge (e.g. 1m ago)", () => {
    render(
      <StalenessIndicator
        isStale={true}
        isOffline={false}
        cachedAt={Date.now() - 90_000} // 1m 30s ago
      />,
    );
    expect(screen.getByTestId("staleness-indicator").textContent).toMatch(
      /1m ago/,
    );
  });

  it("does not show elapsed time in offline badge", () => {
    render(
      <StalenessIndicator
        isStale={true}
        isOffline={true}
        cachedAt={Date.now() - 90_000}
      />,
    );
    expect(
      screen.getByTestId("staleness-indicator").textContent,
    ).not.toMatch(/ago/);
  });
});
