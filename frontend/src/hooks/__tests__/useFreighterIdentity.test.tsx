import { act, renderHook, waitFor } from "@testing-library/react";
import {
  getAddress,
  isAllowed,
  isConnected,
  requestAccess,
} from "@stellar/freighter-api";
import {
  __resetFreighterIdentityStoreForTests,
  useFreighterIdentity,
} from "../useFreighterIdentity";

jest.mock("@stellar/freighter-api", () => ({
  getAddress: jest.fn(),
  isAllowed: jest.fn(),
  isConnected: jest.fn(),
  requestAccess: jest.fn(),
}));

type IsConnectedResponse = Awaited<ReturnType<typeof isConnected>>;
type IsAllowedResponse = Awaited<ReturnType<typeof isAllowed>>;
type GetAddressResponse = Awaited<ReturnType<typeof getAddress>>;
type RequestAccessResponse = Awaited<ReturnType<typeof requestAccess>>;

const mockedGetAddress = getAddress as jest.MockedFunction<typeof getAddress>;
const mockedIsAllowed = isAllowed as jest.MockedFunction<typeof isAllowed>;
const mockedIsConnected = isConnected as jest.MockedFunction<typeof isConnected>;
const mockedRequestAccess =
  requestAccess as jest.MockedFunction<typeof requestAccess>;

const walletAddress = "GABCDEF123456789";

const connectedResponse = (value: boolean): IsConnectedResponse =>
  ({ isConnected: value }) as IsConnectedResponse;

const allowedResponse = (value: boolean): IsAllowedResponse =>
  ({ isAllowed: value }) as IsAllowedResponse;

const addressResponse = (value: string): GetAddressResponse =>
  ({ address: value }) as GetAddressResponse;

const requestAccessResponse = (value: string): RequestAccessResponse =>
  ({ address: value }) as RequestAccessResponse;

const requestAccessError = (message = "Denied"): RequestAccessResponse =>
  ({ error: { message } }) as RequestAccessResponse;

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;

  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("useFreighterIdentity", () => {
  beforeEach(() => {
    __resetFreighterIdentityStoreForTests();
    jest.clearAllMocks();
  });

  it("loads an authorized wallet and shortens the address", async () => {
    mockedIsConnected.mockResolvedValueOnce(connectedResponse(true));
    mockedIsAllowed.mockResolvedValueOnce(allowedResponse(true));
    mockedGetAddress.mockResolvedValueOnce(addressResponse(walletAddress));

    const { result } = renderHook(() => useFreighterIdentity());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.address).toBe(walletAddress);
    expect(result.current.shortAddress).toBe("GABCDE...456789");
    expect(result.current.isWalletDetected).toBe(true);
    expect(result.current.isAuthorized).toBe(true);
  });

  it("marks the wallet as detected when permission has not been granted", async () => {
    mockedIsConnected.mockResolvedValueOnce(connectedResponse(true));
    mockedIsAllowed.mockResolvedValueOnce(allowedResponse(false));

    const { result } = renderHook(() => useFreighterIdentity());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.address).toBeNull();
    expect(result.current.isWalletDetected).toBe(true);
    expect(result.current.isAuthorized).toBe(false);
    expect(mockedGetAddress).not.toHaveBeenCalled();
  });

  it("keeps multiple hook instances in sync after a successful wallet connection", async () => {
    mockedIsConnected.mockResolvedValueOnce(connectedResponse(false));
    mockedIsAllowed.mockResolvedValueOnce(allowedResponse(false));

    const firstHook = renderHook(() => useFreighterIdentity());
    const secondHook = renderHook(() => useFreighterIdentity());

    await waitFor(() => expect(firstHook.result.current.isLoading).toBe(false));
    await waitFor(() => expect(secondHook.result.current.isLoading).toBe(false));

    mockedRequestAccess.mockResolvedValueOnce(
      requestAccessResponse(walletAddress),
    );

    await act(async () => {
      await firstHook.result.current.connectWallet();
    });

    await waitFor(() =>
      expect(secondHook.result.current.address).toBe(walletAddress),
    );

    expect(firstHook.result.current.address).toBe(walletAddress);
    expect(firstHook.result.current.shortAddress).toBe("GABCDE...456789");
    expect(firstHook.result.current.isAuthorized).toBe(true);
    expect(secondHook.result.current.isAuthorized).toBe(true);
    expect(secondHook.result.current.isWalletDetected).toBe(true);
  });

  it("clears the identity when the wallet is removed", async () => {
    mockedIsConnected.mockResolvedValueOnce(connectedResponse(true));
    mockedIsAllowed.mockResolvedValueOnce(allowedResponse(true));
    mockedGetAddress.mockResolvedValueOnce(addressResponse(walletAddress));

    const { result } = renderHook(() => useFreighterIdentity());

    await waitFor(() => expect(result.current.isAuthorized).toBe(true));

    mockedIsConnected.mockResolvedValueOnce(connectedResponse(false));
    mockedIsAllowed.mockResolvedValueOnce(allowedResponse(false));

    await act(async () => {
      await result.current.refreshIdentity();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.address).toBeNull();
    expect(result.current.shortAddress).toBeNull();
    expect(result.current.isAuthorized).toBe(false);
    expect(result.current.isWalletDetected).toBe(false);
  });

  it("falls back gracefully when requesting access fails", async () => {
    mockedIsConnected.mockResolvedValueOnce(connectedResponse(false));
    mockedIsAllowed.mockResolvedValueOnce(allowedResponse(false));

    const { result } = renderHook(() => useFreighterIdentity());

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    mockedRequestAccess.mockResolvedValueOnce(requestAccessError());
    mockedIsConnected.mockRejectedValueOnce(new Error("timeout"));
    mockedIsAllowed.mockResolvedValueOnce(allowedResponse(false));

    await act(async () => {
      await result.current.connectWallet();
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.address).toBeNull();
    expect(result.current.shortAddress).toBeNull();
    expect(result.current.isAuthorized).toBe(false);
    expect(result.current.isWalletDetected).toBe(false);
  });

  it("shares the initial loading cycle across hook instances", async () => {
    const connectedDeferred = createDeferred<IsConnectedResponse>();
    const allowedDeferred = createDeferred<IsAllowedResponse>();

    mockedIsConnected.mockImplementationOnce(
      () => connectedDeferred.promise as ReturnType<typeof isConnected>,
    );
    mockedIsAllowed.mockImplementationOnce(
      () => allowedDeferred.promise as ReturnType<typeof isAllowed>,
    );

    const firstHook = renderHook(() => useFreighterIdentity());
    const secondHook = renderHook(() => useFreighterIdentity());

    await waitFor(() => expect(mockedIsConnected).toHaveBeenCalledTimes(1));

    expect(mockedIsAllowed).toHaveBeenCalledTimes(1);
    expect(firstHook.result.current.isLoading).toBe(true);
    expect(secondHook.result.current.isLoading).toBe(true);

    connectedDeferred.resolve(connectedResponse(false));
    allowedDeferred.resolve(allowedResponse(false));

    await waitFor(() => expect(firstHook.result.current.isLoading).toBe(false));

    expect(secondHook.result.current.isLoading).toBe(false);
  });
});
