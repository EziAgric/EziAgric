import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, type TabItem } from "../Tabs";

const ITEMS: TabItem[] = [
  { value: "one", label: "One" },
  { value: "two", label: "Two" },
  { value: "three", label: "Three" },
];

function Harness({ variant }: { variant?: "underline" | "bordered" }) {
  const [active, setActive] = useState("one");
  return (
    <div>
      <Tabs items={ITEMS} activeValue={active} onChange={setActive} variant={variant} />
      {ITEMS.map((item) => (
        <div
          key={item.value}
          role="tabpanel"
          hidden={active !== item.value}
        >
          {item.label} panel
        </div>
      ))}
    </div>
  );
}

describe("Tabs", () => {
  it("exposes tablist, tab and tabpanel roles with aria-selected", () => {
    render(<Harness />);

    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "false");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "false");
  });

  it.each(["underline", "bordered"] as const)(
    "shows the clicked tab's panel and hides the others (%s)",
    async (variant) => {
      render(<Harness variant={variant} />);

      await userEvent.click(screen.getByRole("tab", { name: "Two" }));

      expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");
      expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "false");
      expect(screen.getByRole("tabpanel")).toHaveTextContent("Two panel");
      expect(screen.queryByText("One panel")).not.toBeInTheDocument();
      expect(screen.queryByText("Three panel")).not.toBeInTheDocument();
    },
  );

  it("moves focus and selection with ArrowRight/ArrowLeft, wrapping at the ends", async () => {
    render(<Harness />);
    const user = userEvent.setup();

    screen.getByRole("tab", { name: "One" }).focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Three panel");
  });

  it("jumps to the first and last tab with Home and End", async () => {
    render(<Harness />);
    const user = userEvent.setup();

    screen.getByRole("tab", { name: "One" }).focus();

    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Three" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Three" })).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps only the active tab in the tab order", () => {
    render(<Harness />);

    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute("tabindex", "-1");
  });
});
