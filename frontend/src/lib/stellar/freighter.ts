export async function isFreighterInstalled(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const freighter = (window as any).freighterApi;
  if (!freighter) return false;
  try {
    return await freighter.isConnected();
  } catch {
    return false;
  }
}

export async function signWithFreighter(
  xdr?: string,
  opts?: { network?: string; networkPassphrase?: string },
): Promise<string> {
  const freighter = (window as any).freighterApi;
  if (!freighter) {
    throw new Error('Freighter wallet is not installed');
  }

  if (!xdr) {
    const { publicKey } = await freighter.getPublicKey();
    return publicKey;
  }

  const { signedTxXdr } = await freighter.signTransaction(xdr, {
    network: opts?.network,
    networkPassphrase: opts?.networkPassphrase,
  });
  return signedTxXdr;
}
