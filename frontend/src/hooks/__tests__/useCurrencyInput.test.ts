import { renderHook, act } from "@testing-library/react";
import { useCurrencyInput } from "../useCurrencyInput";
import { STELLAR_ASSETS } from "@/lib/stellar/assets";

describe("useCurrencyInput", () => {
  describe("Basic functionality", () => {
    it("initializes with empty value", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.XLM })
      );

      expect(result.current.value).toBe("");
      expect(result.current.stroops).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isValid).toBe(false);
    });

    it("updates value when setValue is called", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.USDC })
      );

      act(() => {
        result.current.setValue("100.50");
      });

      expect(result.current.value).toBe("100.50");
    });

    it("clears value and error when clear is called", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.EURC })
      );

      act(() => {
        result.current.setValue("100");
      });

      act(() => {
        result.current.clear();
      });

      expect(result.current.value).toBe("");
      expect(result.current.stroops).toBeNull();
      expect(result.current.error).toBeNull();
    });
  });

  describe("Validation with USDC", () => {
    it("validates correct USDC amount", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.USDC })
      );

      act(() => {
        result.current.setValue("100.50");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.error).toBeNull();
      expect(result.current.stroops).toBe("1005000000");
    });

    it("rejects invalid format", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.USDC })
      );

      act(() => {
        result.current.setValue("abc");
      });

      expect(result.current.isValid).toBe(false);
      expect(result.current.error).toBe("Invalid number format");
      expect(result.current.stroops).toBeNull();
    });

    it("rejects too many decimals for USDC", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.USDC })
      );

      act(() => {
        result.current.setValue("100.12345678");
      });

      expect(result.current.isValid).toBe(false);
      expect(result.current.error).toBe("Maximum 7 decimal places allowed");
    });

    it("accepts USDC with full 7 decimal precision", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.USDC })
      );

      act(() => {
        result.current.setValue("100.1234567");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("1001234567");
    });
  });

  describe("Validation with EURC", () => {
    it("validates correct EURC amount", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.EURC })
      );

      act(() => {
        result.current.setValue("50.123456");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("501234560");
    });

    it("handles EURC whole numbers", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.EURC })
      );

      act(() => {
        result.current.setValue("1000");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("10000000000");
    });
  });

  describe("Validation with NGN", () => {
    it("validates NGN amounts", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.NGN })
      );

      act(() => {
        result.current.setValue("5000.50");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("50005000000");
    });

    it("handles large NGN amounts", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.NGN })
      );

      act(() => {
        result.current.setValue("1000000");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("10000000000000");
    });
  });

  describe("Range validation", () => {
    it("validates amount within range", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.USDC,
          min: "1000000000", // 100 USDC
          max: "5000000000", // 500 USDC
        })
      );

      act(() => {
        result.current.setValue("250"); // 250 USDC
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it("rejects amount below minimum", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.EURC,
          min: "1000000000", // 100 EURC
          max: "5000000000", // 500 EURC
        })
      );

      act(() => {
        result.current.setValue("50"); // Below minimum
      });

      expect(result.current.isValid).toBe(false);
      expect(result.current.error).toBe("Amount is below minimum");
    });

    it("rejects amount above maximum", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.XLM,
          min: "10000000", // 1 XLM
          max: "1000000000", // 100 XLM
        })
      );

      act(() => {
        result.current.setValue("150"); // Above maximum
      });

      expect(result.current.isValid).toBe(false);
      expect(result.current.error).toBe("Amount exceeds maximum");
    });

    it("accepts exact minimum", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.USDC,
          min: "1000000000", // 100 USDC
          max: "5000000000",
        })
      );

      act(() => {
        result.current.setValue("100");
      });

      expect(result.current.isValid).toBe(true);
    });

    it("accepts exact maximum", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.USDC,
          min: "1000000000",
          max: "5000000000", // 500 USDC
        })
      );

      act(() => {
        result.current.setValue("500");
      });

      expect(result.current.isValid).toBe(true);
    });
  });

  describe("onValidChange callback", () => {
    it("calls onValidChange with stroops when valid", () => {
      const onValidChange = jest.fn();
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.USDC,
          onValidChange,
        })
      );

      act(() => {
        result.current.setValue("100.50");
      });

      expect(onValidChange).toHaveBeenCalledWith("1005000000");
    });

    it("does not call onValidChange when invalid", () => {
      const onValidChange = jest.fn();
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.EURC,
          onValidChange,
        })
      );

      act(() => {
        result.current.setValue("invalid");
      });

      expect(onValidChange).not.toHaveBeenCalled();
    });

    it("does not call onValidChange when out of range", () => {
      const onValidChange = jest.fn();
      const { result } = renderHook(() =>
        useCurrencyInput({
          asset: STELLAR_ASSETS.XLM,
          min: "10000000",
          max: "1000000000",
          onValidChange,
        })
      );

      act(() => {
        result.current.setValue("200"); // Above max
      });

      expect(onValidChange).not.toHaveBeenCalled();
    });
  });

  describe("Custom decimal precision", () => {
    it("validates 2-decimal asset", () => {
      const customAsset = {
        code: "CUSTOM",
        decimals: 2,
        symbol: "CUST",
        name: "Custom Token",
        type: "credit_alphanum4" as const,
      };

      const { result } = renderHook(() =>
        useCurrencyInput({ asset: customAsset })
      );

      act(() => {
        result.current.setValue("100.50");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("10050");
    });

    it("rejects too many decimals for 2-decimal asset", () => {
      const customAsset = {
        code: "CUSTOM",
        decimals: 2,
        symbol: "CUST",
        name: "Custom Token",
        type: "credit_alphanum4" as const,
      };

      const { result } = renderHook(() =>
        useCurrencyInput({ asset: customAsset })
      );

      act(() => {
        result.current.setValue("100.555");
      });

      expect(result.current.isValid).toBe(false);
      expect(result.current.error).toBe("Maximum 2 decimal places allowed");
    });
  });

  describe("Edge cases", () => {
    it("handles empty string", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.USDC })
      );

      act(() => {
        result.current.setValue("");
      });

      expect(result.current.value).toBe("");
      expect(result.current.stroops).toBeNull();
      expect(result.current.error).toBeNull();
      expect(result.current.isValid).toBe(false);
    });

    it("handles whitespace-only string", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.EURC })
      );

      act(() => {
        result.current.setValue("   ");
      });

      expect(result.current.stroops).toBeNull();
      expect(result.current.isValid).toBe(false);
    });

    it("handles amounts with commas", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.XLM })
      );

      act(() => {
        result.current.setValue("1,000,000.50");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("10000005000000");
    });

    it("handles very small amounts", () => {
      const { result } = renderHook(() =>
        useCurrencyInput({ asset: STELLAR_ASSETS.USDC })
      );

      act(() => {
        result.current.setValue("0.0000001");
      });

      expect(result.current.isValid).toBe(true);
      expect(result.current.stroops).toBe("1");
    });
  });
});
