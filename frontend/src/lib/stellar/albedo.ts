import type {
  WalletAdapter,
  WalletSignOptions,
  WalletSignResult,
} from "./types";

/**
 * Minimal shape of the `@albedo-link/intent` module we depend on.
 * Declared locally so the adapter can be unit-tested without pulling in the
 * real package (which is only available in the browser).
 */
export interface AlbedoIntent {
  publicKey(params?: Record<string, unknown>): Promise<{ pubkey: string }>;
  tx(params: {
    xdr: string;
    network?: string;
    pubkey?: string;
    submit?: boolean;
  }): Promise<{ signed_envelope_xdr?: string; xdr?: string; hash?: string }>;
}

/**
 * Lazily resolve the Albedo intent module. Kept behind a function so tests can
 * inject a fake implementation and so the browser bundle only loads it when
 * the user actually picks Albedo.
 */
async function loadAlbedoIntent(): Promise<AlbedoIntent> {
  const mod = (await import("@albedo-link/intent")) as unknown as {
    default?: AlbedoIntent;
  } & AlbedoIntent;
  return mod.default ?? mod;
}

/**
 * Albedo wallet adapter. Implements the shared {@link WalletAdapter} contract
 * so it can be used interchangeably with the Freighter adapter.
 */
export class AlbedoAdapter implements WalletAdapter {
  readonly id = "albedo" as const;
  readonly name = "Albedo";

  private intent: AlbedoIntent | null = null;

  constructor(private readonly injectedIntent?: AlbedoIntent) {}

  private async getIntent(): Promise<AlbedoIntent> {
    if (this.injectedIntent) return this.injectedIntent;
    if (!this.intent) {
      this.intent = await loadAlbedoIntent();
    }
    return this.intent;
  }

  /**
   * Albedo has no explicit "connect" step; requesting the public key is the
   * sign-in flow and will prompt the user if they have not authorised us yet.
   */
  async connect(): Promise<string> {
    const intent = await this.getIntent();
    const { pubkey } = await intent.publicKey();
    if (!pubkey) {
      throw new Error("Albedo did not return a public key");
    }
    return pubkey;
  }

  async getPublicKey(): Promise<string> {
    const intent = await this.getIntent();
    const { pubkey } = await intent.publicKey();
    if (!pubkey) {
      throw new Error("Albedo did not return a public key");
    }
    return pubkey;
  }

  async signTransaction(
    xdr: string,
    options: WalletSignOptions = {},
  ): Promise<WalletSignResult> {
    const intent = await this.getIntent();
    const result = await intent.tx({
      xdr,
      network: options.networkPassphrase,
      pubkey: options.publicKey,
      submit: false,
    });

    const signedXdr = result.signed_envelope_xdr ?? result.xdr;
    if (!signedXdr) {
      throw new Error("Albedo did not return a signed transaction");
    }

    return { signedXdr, hash: result.hash };
  }
}

export const albedoAdapter = new AlbedoAdapter();
