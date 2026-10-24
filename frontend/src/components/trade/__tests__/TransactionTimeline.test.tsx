import React from "react";
import { render, screen } from "@testing-library/react";
import { TransactionTimeline } from "../TransactionTimeline";
import type { TransactionEvent } from "@/types/trade";

const EVENTS: TransactionEvent[] = [
  { id: "1", title: "Trade Created", actor: "system" },
  { id: "2", title: "Funds Locked", actor: "buyer" },
  { id: "3", title: "Goods Dispatched", actor: "driver" },
  { id: "4", title: "Delivery Confirmed", actor: "buyer" },
];

describe("TransactionTimeline", () => {
  it("marks only the step at currentEventIndex as active", () => {
    render(<TransactionTimeline events={EVENTS} currentEventIndex={2} />);

    const badges = screen.getAllByText("Active");
    expect(badges).toHaveLength(1);

    // The badge sits in the same header row as the current event's title.
    const header = screen.getByText("Goods Dispatched").parentElement as HTMLElement;
    expect(header).toContainElement(badges[0]);
  });

  it("renders all events in order", () => {
    render(<TransactionTimeline events={EVENTS} currentEventIndex={0} />);

    const titles = screen
      .getAllByText(/Trade Created|Funds Locked|Goods Dispatched|Delivery Confirmed/)
      .map((el) => el.textContent);

    expect(titles).toEqual(EVENTS.map((e) => e.title));
  });

  it("moves the active marker when currentEventIndex changes", () => {
    const { rerender } = render(<TransactionTimeline events={EVENTS} currentEventIndex={0} />);
    expect(screen.getByText("Trade Created").parentElement).toContainElement(
      screen.getByText("Active"),
    );

    rerender(<TransactionTimeline events={EVENTS} currentEventIndex={3} />);
    expect(screen.getAllByText("Active")).toHaveLength(1);
    expect(screen.getByText("Delivery Confirmed").parentElement).toContainElement(
      screen.getByText("Active"),
    );
  });

  it("does not throw when currentEventIndex is past the end", () => {
    expect(() =>
      render(<TransactionTimeline events={EVENTS} currentEventIndex={99} />),
    ).not.toThrow();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("does not throw when currentEventIndex is negative", () => {
    expect(() =>
      render(<TransactionTimeline events={EVENTS} currentEventIndex={-1} />),
    ).not.toThrow();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("does not throw with no events", () => {
    expect(() =>
      render(<TransactionTimeline events={[]} currentEventIndex={0} />),
    ).not.toThrow();
    expect(screen.getByText("Transaction Timeline")).toBeInTheDocument();
  });
});
