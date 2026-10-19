import React from "react";
import { render, screen } from "@testing-library/react";
import { TradeTimeline } from "../TradeTimeline";
import { TimelineEventItem } from "../TimelineEventItem";
import type { TimelineEvent, TransactionEvent } from "@/types/trade";

const EVENTS: TimelineEvent[] = [
  { id: "e1", type: "escrow_funded", title: "Escrow Funded", status: "completed", timestamp: "Jan 1" },
  { id: "e2", type: "inspection_passed", title: "Inspection Passed", status: "completed" },
  { id: "e3", type: "dispatched", title: "Goods Dispatched", status: "current", description: "On the way" },
  { id: "e4", type: "settlement", title: "Settlement", status: "pending" },
];

describe("TradeTimeline", () => {
  it("renders events in the given order", () => {
    render(<TradeTimeline events={EVENTS} />);

    const titles = screen
      .getAllByText(/Escrow Funded|Inspection Passed|Goods Dispatched|Settlement/)
      .map((el) => el.textContent);

    expect(titles).toEqual([
      "Escrow Funded",
      "Inspection Passed",
      "Goods Dispatched",
      "Settlement",
    ]);
  });

  it("renders the timestamp, description and current-state badge for the current event", () => {
    render(<TradeTimeline events={EVENTS} />);

    expect(screen.getByText("Jan 1")).toBeInTheDocument();
    expect(screen.getByText("On the way")).toBeInTheDocument();
    expect(screen.getAllByText("CURRENT STATE")).toHaveLength(1);
  });

  it("renders without crashing when events is empty", () => {
    render(<TradeTimeline events={[]} />);

    expect(screen.getByText("Trade Lifecycle")).toBeInTheDocument();
    expect(screen.queryByText("CURRENT STATE")).not.toBeInTheDocument();
  });
});

describe("TimelineEventItem", () => {
  const EVENT: TransactionEvent = {
    id: "t1",
    title: "Funds Locked",
    actor: "buyer",
    timestamp: "10:00",
    description: "Buyer locked funds",
  };

  it("renders the title, actor label, timestamp and description", () => {
    render(<TimelineEventItem event={EVENT} status="completed" isLast={false} />);

    expect(screen.getByText("Funds Locked")).toBeInTheDocument();
    expect(screen.getByText("Buyer")).toBeInTheDocument();
    expect(screen.getByText("10:00")).toBeInTheDocument();
    expect(screen.getByText("Buyer locked funds")).toBeInTheDocument();
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("shows the Active badge only for the active status", () => {
    const { rerender } = render(
      <TimelineEventItem event={EVENT} status="active" isLast={false} />,
    );
    expect(screen.getByText("Active")).toBeInTheDocument();

    rerender(<TimelineEventItem event={EVENT} status="pending" isLast={false} />);
    expect(screen.queryByText("Active")).not.toBeInTheDocument();
  });

  it("omits the connector line for the last item", () => {
    const { container, rerender } = render(
      <TimelineEventItem event={EVENT} status="pending" isLast={false} />,
    );
    expect(container.querySelector(".absolute.w-px")).toBeInTheDocument();

    rerender(<TimelineEventItem event={EVENT} status="pending" isLast />);
    expect(container.querySelector(".absolute.w-px")).not.toBeInTheDocument();
  });

  it.each([
    ["system", "System"],
    ["buyer", "Buyer"],
    ["seller", "Seller"],
    ["driver", "Driver"],
  ] as const)("labels the %s actor", (actor, label) => {
    render(<TimelineEventItem event={{ ...EVENT, actor }} status="pending" isLast />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
