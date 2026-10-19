import { renderHook, act } from "@testing-library/react";
import { useRetry } from "../useRetry";

/** Advances fake timers and flushes the promise chain inside act(). */
async function advance(ms: number) {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

describe("useRetry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("executes function successfully on first attempt", async () => {
    const fn = jest.fn().mockResolvedValue("success");
    const { result } = renderHook(() => useRetry(fn));

    let data: string | null = null;
    await act(async () => {
      data = await result.current.execute();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(data).toBe("success");
    expect(result.current.state.data).toBe("success");
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.isLoading).toBe(false);
  });

  it("succeeds after N retries", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");
    const config = { maxAttempts: 3 };
    const { result } = renderHook(() => useRetry(fn, config));

    let promise!: Promise<string | null>;
    act(() => {
      promise = result.current.execute();
    });

    await advance(0);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.state.isRetrying).toBe(true);
    expect(result.current.state.attempt).toBe(1);

    await advance(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    await advance(2000);
    expect(fn).toHaveBeenCalledTimes(3);

    let data: string | null = null;
    await act(async () => {
      data = await promise;
    });

    expect(data).toBe("success");
    expect(result.current.state.data).toBe("success");
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.isRetrying).toBe(false);
    expect(result.current.state.attempt).toBe(2);
  });

  it("gives up after max retries", async () => {
    const error = new Error("always fails");
    const fn = jest.fn().mockRejectedValue(error);
    const config = { maxAttempts: 3 };
    const { result } = renderHook(() => useRetry(fn, config));

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.execute();
    });

    await advance(0);
    await advance(1000);
    await advance(2000);

    let data: unknown = "unset";
    await act(async () => {
      data = await promise;
    });

    expect(fn).toHaveBeenCalledTimes(3);
    expect(data).toBeNull();
    expect(result.current.state.error).toBe(error);
    expect(result.current.state.data).toBeNull();
    expect(result.current.state.isLoading).toBe(false);
    expect(result.current.state.isRetrying).toBe(false);

    // No further attempts are scheduled once it has given up
    await advance(60000);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("waits for exponential backoff delays between attempts", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");
    const config = { maxAttempts: 3, initialDelayMs: 500, backoffMultiplier: 3 };
    const { result } = renderHook(() => useRetry(fn, config));

    let promise!: Promise<string | null>;
    act(() => {
      promise = result.current.execute();
    });

    await advance(0);
    expect(fn).toHaveBeenCalledTimes(1);

    // First retry waits initialDelayMs (500ms)
    await advance(499);
    expect(fn).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(2);

    // Second retry waits initialDelayMs * backoffMultiplier (1500ms)
    await advance(1499);
    expect(fn).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(3);

    await act(async () => {
      await promise;
    });
    expect(result.current.state.data).toBe("success");
  });

  it("caps the backoff delay at maxDelayMs", async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error("fail 1"))
      .mockRejectedValueOnce(new Error("fail 2"))
      .mockResolvedValue("success");
    const config = {
      maxAttempts: 3,
      initialDelayMs: 1000,
      backoffMultiplier: 10,
      maxDelayMs: 3000,
    };
    const { result } = renderHook(() => useRetry(fn, config));

    let promise!: Promise<string | null>;
    act(() => {
      promise = result.current.execute();
    });

    await advance(0);
    await advance(1000);
    expect(fn).toHaveBeenCalledTimes(2);

    // Uncapped delay would be 10000ms; it is capped at 3000ms
    await advance(2999);
    expect(fn).toHaveBeenCalledTimes(2);
    await advance(1);
    expect(fn).toHaveBeenCalledTimes(3);

    await act(async () => {
      await promise;
    });
    expect(result.current.state.data).toBe("success");
  });

  it("does not retry non-retryable status", async () => {
    const error = new Error("bad request");
    (error as { status: number }).status = 400;
    const fn = jest.fn().mockRejectedValue(error);
    const config = { retryableStatuses: [500, 503] };
    const { result } = renderHook(() => useRetry(fn, config));

    await act(async () => {
      await result.current.execute();
    });

    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.current.state.error).toBeDefined();
    const err = result.current.state.error as { status: number };
    expect(err.status).toBe(400);
  });

  it("resets state correctly", async () => {
    const fn = jest.fn().mockRejectedValue(new Error("fail"));
    const config = { maxAttempts: 2 };
    const { result } = renderHook(() => useRetry(fn, config));

    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.execute();
    });
    await advance(0);
    await advance(1000);
    await act(async () => {
      await promise;
    });

    expect(result.current.state.error).not.toBeNull();

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.data).toBeNull();
    expect(result.current.state.error).toBeNull();
    expect(result.current.state.attempt).toBe(0);
    expect(result.current.state.isLoading).toBe(false);
  });
});
