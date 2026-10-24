import { fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../Button";
import { Badge } from "../Badge";
import { Spinner } from "../Spinner";
import { EmptyState } from "../EmptyState";
import { LoadingState } from "../LoadingState";

describe("Button", () => {
  it.each([
    ["primary", "bg-gold"],
    ["secondary", "border-border-default"],
  ] as const)("renders the %s variant", (variant, expectedClass) => {
    render(<Button variant={variant}>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(expectedClass);
  });

  it.each([
    ["sm", "px-3"],
    ["md", "px-4"],
    ["lg", "px-6"],
  ] as const)("renders the %s size", (size, expectedClass) => {
    render(<Button size={size}>Go</Button>);
    expect(screen.getByRole("button", { name: "Go" })).toHaveClass(expectedClass);
  });

  it("calls onClick when enabled", () => {
    const onClick = jest.fn();
    render(<Button onClick={onClick}>Go</Button>);
    fireEvent.click(screen.getByRole("button", { name: "Go" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not call onClick when disabled", () => {
    const onClick = jest.fn();
    render(
      <Button disabled onClick={onClick}>
        Go
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go" });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("Badge", () => {
  it.each([
    ["success", "text-emerald"],
    ["warning", "text-status-warning"],
    ["danger", "text-status-danger"],
    ["locked", "text-gold"],
    ["draft", "text-status-draft"],
    ["info", "text-status-info"],
    ["neutral", "text-text-secondary"],
  ] as const)("renders the %s variant", (variant, expectedClass) => {
    render(<Badge variant={variant}>Label</Badge>);
    expect(screen.getByRole("status")).toHaveClass(expectedClass);
  });

  it.each([
    ["sm", "px-2"],
    ["md", "px-3"],
  ] as const)("renders the %s size", (size, expectedClass) => {
    render(<Badge size={size}>Label</Badge>);
    expect(screen.getByRole("status")).toHaveClass(expectedClass);
  });

  it("renders a dot only when requested", () => {
    const { rerender, container } = render(<Badge variant="success">Label</Badge>);
    expect(container.querySelector(".rounded-full.w-1\\.5")).toBeNull();
    rerender(
      <Badge variant="success" dot>
        Label
      </Badge>,
    );
    expect(container.querySelector(".w-1\\.5")).toHaveClass("bg-emerald");
  });
});

describe("Spinner", () => {
  it.each([
    ["sm", "h-4"],
    ["md", "h-6"],
    ["lg", "h-8"],
  ] as const)("renders the %s size", (size, expectedClass) => {
    render(<Spinner size={size} />);
    expect(screen.getByRole("status", { name: "Loading" })).toHaveClass(expectedClass);
  });

  it("accepts a custom aria-label", () => {
    render(<Spinner aria-label="Saving" />);
    expect(screen.getByRole("status", { name: "Saving" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("renders title and description without optional slots", () => {
    render(<EmptyState title="No trades" description="Create one to start" />);
    expect(screen.getByRole("heading", { name: "No trades" })).toBeInTheDocument();
    expect(screen.getByText("Create one to start")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the action slot when provided", () => {
    render(
      <EmptyState
        title="No trades"
        description="Create one to start"
        action={<button>Create trade</button>}
        icon={<span data-testid="icon" />}
      />,
    );
    expect(screen.getByRole("button", { name: "Create trade" })).toBeInTheDocument();
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

describe("LoadingState", () => {
  it.each(["card", "row", "inline"] as const)("renders the %s variant", (variant) => {
    render(<LoadingState variant={variant} />);
    expect(screen.getByLabelText("Loading")).toHaveAttribute("aria-busy", "true");
  });

  it("defaults to the card variant", () => {
    render(<LoadingState />);
    expect(screen.getByLabelText("Loading")).toHaveClass("shadow-card");
  });

  it("honours the rows prop in the card variant", () => {
    const { container } = render(<LoadingState rows={5} />);
    const rowsContainer = container.querySelector(".gap-3.flex-col, .flex-col.gap-3");
    expect(rowsContainer?.children).toHaveLength(5);
  });
});
