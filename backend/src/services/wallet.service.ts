import { StellarService } from "./stellar.service";
import { TOKEN_CONFIG } from "../config/token";

export type PayoutDestination = "wallet" | "anchor_offramp";

export interface PayoutPreference {
  sellerId: string;
  destination: PayoutDestination;
  /** Anchor home domain used for SEP-10/SEP-24 when destination is anchor_offramp. */
  anchorHomeDomain?: string;
  /** Target fiat currency for the off-ramp (e.g. NGN). */
  fiatCurrency?: string;
  updatedAt: string;
}

export interface Sep10Challenge {
  transaction: string;
  networkPassphrase: string;
}

export interface Sep24WithdrawSession {
  id: string;
  url: string;
  type: "interactive_customer_info_needed";
}

export class WalletService {
  private stellarService: StellarService;
  private payoutPreferences: Map<string, PayoutPreference>;

  constructor() {
    this.stellarService = new StellarService();
    this.payoutPreferences = new Map<string, PayoutPreference>();
  }

  /**
   * Returns the token balance on Stellar for the given wallet address.
   */
  public async getTokenBalance(walletAddress: string): Promise<string> {
    return this.stellarService.getAccountBalance(walletAddress, TOKEN_CONFIG.symbol);
  }

  /** Legacy method for compatibility during transition */
  public async getUsdcBalance(walletAddress: string): Promise<string> {
    return this.getTokenBalance(walletAddress);
  }

  /**
   * Persists the seller's payout destination preference (wallet vs. anchor off-ramp).
   */
  public async setPayoutPreference(
    sellerId: string,
    destination: PayoutDestination,
    options: { anchorHomeDomain?: string; fiatCurrency?: string } = {},
  ): Promise<PayoutPreference> {
    if (destination === "anchor_offramp" && !options.anchorHomeDomain) {
      throw new Error("anchorHomeDomain is required for anchor_offramp payouts");
    }

    const preference: PayoutPreference = {
      sellerId,
      destination,
      anchorHomeDomain: options.anchorHomeDomain,
      fiatCurrency: options.fiatCurrency ?? (destination === "anchor_offramp" ? "NGN" : undefined),
      updatedAt: new Date().toISOString(),
    };

    this.payoutPreferences.set(sellerId, preference);
    return preference;
  }

  /**
   * Returns the stored payout preference for a seller, defaulting to wallet custody.
   */
  public async getPayoutPreference(sellerId: string): Promise<PayoutPreference> {
    return (
      this.payoutPreferences.get(sellerId) ?? {
        sellerId,
        destination: "wallet",
        updatedAt: new Date().toISOString(),
      }
    );
  }

  /**
   * Builds a SEP-10 authentication challenge for the anchor identified by its home domain.
   */
  public async buildSep10Challenge(
    account: string,
    anchorHomeDomain: string,
  ): Promise<Sep10Challenge> {
    const response = await fetch(
      `https://${anchorHomeDomain}/auth?account=${encodeURIComponent(account)}`,
    );

    if (!response.ok) {
      throw new Error(`SEP-10 challenge request failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      transaction: string;
      network_passphrase: string;
    };

    return {
      transaction: body.transaction,
      networkPassphrase: body.network_passphrase,
    };
  }

  /**
   * Initiates a SEP-24 interactive withdraw session for cNGN -> NGN off-ramp.
   */
  public async initiateSep24Withdraw(
    sellerId: string,
    account: string,
    amount: string,
  ): Promise<Sep24WithdrawSession> {
    const preference = await this.getPayoutPreference(sellerId);

    if (preference.destination !== "anchor_offramp" || !preference.anchorHomeDomain) {
      throw new Error("Seller is not configured for anchor off-ramp payouts");
    }

    const response = await fetch(`https://${preference.anchorHomeDomain}/sep24/transactions/withdraw/interactive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        account,
        asset_code: TOKEN_CONFIG.symbol,
        amount,
      }),
    });

    if (!response.ok) {
      throw new Error(`SEP-24 withdraw request failed: ${response.status}`);
    }

    const body = (await response.json()) as { id: string; url: string };

    return {
      id: body.id,
      url: body.url,
      type: "interactive_customer_info_needed",
    };
  }
}
