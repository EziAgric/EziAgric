import { render, screen } from "@testing-library/react";
import { VirtualizedList } from "../VirtualizedList";

jest.mock("@tanstack/react-virtual", () => ({
  useVirtualizer: ({ count, estimateSize }: { count: number; estimateSize: () => number }) => ({
    getTotalSize: () => count * estimateSize(),
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        start: index * estimateSize(),
        size: estimateSize(),
        key: index,
      })),
    measureElement: () => {},
  }),
}));

const items = [
  { id: "a", label: "Alpha" },
  { id: "b", label: "Beta" },
  { id: "c", label: "Gamma" },
];

describe("VirtualizedList", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("renders the default message when isEmpty and no emptyState is given", () => {
    render(
      <VirtualizedList
        items={[]}
        isEmpty
        rowHeight={40}
        keyExtractor={(i: { id: string }) => i.id}
        renderItem={() => null}
      />,
    );
    expect(screen.getByText("No items to display")).toBeInTheDocument();
  });

  it("renders the custom emptyState when isEmpty", () => {
    render(
      <VirtualizedList
        items={[]}
        isEmpty
        emptyState={<p>Nothing here</p>}
        rowHeight={40}
        keyExtractor={(i: { id: string }) => i.id}
        renderItem={() => null}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByText("No items to display")).not.toBeInTheDocument();
  });

  it("uses keyExtractor output as the React key without duplicate-key warnings", () => {
    const keyExtractor = jest.fn((item: (typeof items)[number]) => item.id);
    render(
      <VirtualizedList
        items={items}
        rowHeight={40}
        keyExtractor={keyExtractor}
        renderItem={(item) => <span>{item.label}</span>}
      />,
    );
    expect(keyExtractor).toHaveBeenCalledTimes(items.length);
    items.forEach((item, index) => {
      expect(keyExtractor).toHaveBeenCalledWith(item, index);
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(items.length);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("calls renderItem once per item with the correct index", () => {
    const renderItem = jest.fn((item: (typeof items)[number]) => <span>{item.label}</span>);
    render(
      <VirtualizedList
        items={items}
        rowHeight={40}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
      />,
    );
    expect(renderItem).toHaveBeenCalledTimes(items.length);
    items.forEach((item, index) => {
      expect(renderItem).toHaveBeenNthCalledWith(index + 1, item, index);
    });
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });
});
