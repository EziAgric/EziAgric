import { render, screen } from "@testing-library/react";
import { Skeleton, SkeletonText } from "../Skeleton";
import { LoadingState } from "../LoadingState";

describe("Skeleton primitive", () => {
  it("renders a fixed box from explicit dimensions (CLS-safe)", () => {
    render(<Skeleton width={120} height={16} aria-label="Loading amount" />);
    const el = screen.getByLabelText("Loading amount");
    expect(el).toHaveStyle({ width: "120px", height: "16px" });
  });

  it("passes string dimensions through as raw CSS", () => {
    render(<Skeleton width="60%" aria-label="bar" />);
    expect(screen.getByLabelText("bar")).toHaveStyle({ width: "60%" });
  });

  it("uses the shared skeleton-base token for its fill", () => {
    const { container } = render(<Skeleton width={10} height={10} />);
    expect(container.firstChild).toHaveClass("bg-skeleton-base");
  });

  it("is decorative by default (aria-hidden, no role)", () => {
    const { container } = render(<Skeleton width={10} height={10} />);
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true");
  });

  it("lets a caller radius class override the variant default", () => {
    const { container } = render(
      <Skeleton variant="rect" className="rounded-full" width={10} height={10} />,
    );
    expect(container.firstChild).toHaveClass("rounded-full");
  });

  it("SkeletonText renders the requested number of lines with a short last line", () => {
    render(<SkeletonText lines={4} />);
    const group = screen.getByRole("status");
    const lines = group.querySelectorAll("span[aria-hidden='true']");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toHaveStyle({ width: "60%" });
  });
});

describe("LoadingState", () => {
  it("marks the region busy for assistive tech", () => {
    render(<LoadingState variant="card" rows={3} />);
    expect(screen.getByLabelText("Loading")).toHaveAttribute("aria-busy", "true");
  });

  it("composes from the shared Skeleton primitive", () => {
    const { container } = render(<LoadingState variant="row" />);
    expect(container.querySelectorAll(".bg-skeleton-base").length).toBeGreaterThan(0);
  });
});
