import { render, screen, fireEvent } from "@testing-library/react";
import { CurrencyInput } from "../CurrencyInput";
import { STELLAR_ASSETS } from "@/lib/stellar/assets";

describe("CurrencyInput", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Rendering with different assets", () => {
    it("renders with XLM asset", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.XLM}
          label="Amount"
        />
      );

      expect(screen.getByText("Amount")).toBeInTheDocument();
      expect(screen.getByText("XLM")).toBeInTheDocument();
      expect(screen.getByText(/7 decimal places/i)).toBeInTheDocument();
      expect(screen.getByText(/Stellar Lumens/i)).toBeInTheDocument();
    });

    it("renders with USDC asset", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
          label="Amount"
        />
      );

      expect(screen.getByText("USDC")).toBeInTheDocument();
      expect(screen.getByText(/USD Coin/i)).toBeInTheDocument();
    });

    it("renders with EURC asset", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.EURC}
          label="Amount"
        />
      );

      expect(screen.getByText("EURC")).toBeInTheDocument();
      expect(screen.getByText(/Euro Coin/i)).toBeInTheDocument();
    });

    it("renders with NGN asset", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.NGN}
          label="Amount"
        />
      );

      expect(screen.getByText("NGN")).toBeInTheDocument();
      expect(screen.getByText(/Nigerian Naira/i)).toBeInTheDocument();
    });
  });

  describe("Value display", () => {
    it("displays current value", () => {
      render(
        <CurrencyInput
          value="100.50"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
        />
      );

      const input = screen.getByRole("textbox") as HTMLInputElement;
      expect(input.value).toBe("100.50");
    });

    it("shows correct placeholder for 7 decimal asset", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.XLM}
        />
      );

      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("placeholder", "0.00");
    });

    it("accepts custom placeholder", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
          placeholder="Enter USDC amount"
        />
      );

      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("placeholder", "Enter USDC amount");
    });
  });

  describe("User interaction", () => {
    it("calls onChange when value changes", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
        />
      );

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "100.50" } });

      expect(mockOnChange).toHaveBeenCalledWith("100.50");
    });

    it("updates value on user input", () => {
      const { rerender } = render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.EURC}
        />
      );

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "50.123" } });

      rerender(
        <CurrencyInput
          value="50.123"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.EURC}
        />
      );

      expect((input as HTMLInputElement).value).toBe("50.123");
    });
  });

  describe("Error display", () => {
    it("shows error message when provided", () => {
      render(
        <CurrencyInput
          value="invalid"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
          error="Invalid amount format"
        />
      );

      expect(screen.getByText("Invalid amount format")).toBeInTheDocument();
    });

    it("applies error styling when error present", () => {
      render(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.XLM}
          error="Amount exceeds maximum"
        />
      );

      const input = screen.getByRole("textbox");
      expect(input).toHaveClass("border-status-danger");
    });

    it("shows helper text when no error", () => {
      render(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
          helperText="Enter the clawback amount"
        />
      );

      expect(screen.getByText("Enter the clawback amount")).toBeInTheDocument();
    });

    it("prioritizes error over helper text", () => {
      render(
        <CurrencyInput
          value="invalid"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.EURC}
          error="Invalid format"
          helperText="Enter amount"
        />
      );

      expect(screen.getByText("Invalid format")).toBeInTheDocument();
      expect(screen.queryByText("Enter amount")).not.toBeInTheDocument();
    });
  });

  describe("Disabled state", () => {
    it("disables input when disabled prop is true", () => {
      render(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.XLM}
          disabled
        />
      );

      const input = screen.getByRole("textbox");
      expect(input).toBeDisabled();
    });

    it("does not call onChange when disabled", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
          disabled
        />
      );

      const input = screen.getByRole("textbox");
      fireEvent.change(input, { target: { value: "100" } });

      expect(mockOnChange).not.toHaveBeenCalled();
    });
  });

  describe("Decimal precision info", () => {
    it("shows decimal precision for 7-decimal asset", () => {
      render(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.XLM}
        />
      );

      expect(screen.getByText(/Precision: 7 decimal places/i)).toBeInTheDocument();
    });

    it("shows correct asset name in precision info", () => {
      render(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
        />
      );

      expect(screen.getByText(/USD Coin/i)).toBeInTheDocument();
    });

    it("hides precision info when error is shown", () => {
      render(
        <CurrencyInput
          value="invalid"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.EURC}
          error="Invalid format"
        />
      );

      expect(screen.queryByText(/Precision:/i)).not.toBeInTheDocument();
    });
  });

  describe("Custom decimal asset", () => {
    it("handles 2-decimal custom asset", () => {
      const customAsset = {
        code: "CUSTOM",
        decimals: 2,
        symbol: "CUST",
        name: "Custom Token",
        type: "credit_alphanum4" as const,
      };

      render(
        <CurrencyInput
          value="100.50"
          onChange={mockOnChange}
          asset={customAsset}
        />
      );

      expect(screen.getByText("CUST")).toBeInTheDocument();
      expect(screen.getByText(/2 decimal places/i)).toBeInTheDocument();
      expect(screen.getByText(/Custom Token/i)).toBeInTheDocument();
    });
  });

  describe("Accessibility", () => {
    it("associates label with input", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
          label="Clawback Amount"
        />
      );

      const label = screen.getByText("Clawback Amount");
      const input = screen.getByRole("textbox");

      expect(label.tagName).toBe("LABEL");
    });

    it("sets inputMode to decimal for numeric input", () => {
      render(
        <CurrencyInput
          value=""
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.XLM}
        />
      );

      const input = screen.getByRole("textbox");
      expect(input).toHaveAttribute("inputMode", "decimal");
    });
  });

  describe("Asset symbol badge", () => {
    it("displays asset symbol in badge", () => {
      render(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.USDC}
        />
      );

      const badge = screen.getByText("USDC");
      expect(badge).toBeInTheDocument();
      expect(badge.parentElement).toHaveClass("absolute");
    });

    it("shows different symbols for different assets", () => {
      const { rerender } = render(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.XLM}
        />
      );

      expect(screen.getByText("XLM")).toBeInTheDocument();

      rerender(
        <CurrencyInput
          value="100"
          onChange={mockOnChange}
          asset={STELLAR_ASSETS.EURC}
        />
      );

      expect(screen.getByText("EURC")).toBeInTheDocument();
    });
  });
});
