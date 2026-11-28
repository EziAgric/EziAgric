import { Keypair, TransactionBuilder, Networks, Transaction } from "@stellar/stellar-sdk";
import { env } from "../config/env";

export class SorobanAdminService {
  /**
   * Signs a Soroban transaction XDR with the configured ADMIN_SECRET_KEY.
   * @param unsignedTxXdr - Base64 encoded transaction XDR
   * @returns Signed transaction XDR in base64
   */
  public signTransaction(unsignedTxXdr: string): string {
    if (!env.ADMIN_SECRET_KEY) {
      throw new Error("ADMIN_SECRET_KEY is not configured.");
    }

    let adminKeypair: Keypair;
    try {
      adminKeypair = Keypair.fromSecret(env.ADMIN_SECRET_KEY);
    } catch (err) {
      throw new Error("Invalid ADMIN_SECRET_KEY configuration.");
    }

    const networkPassphrase = env.STELLAR_NETWORK === "mainnet"
      ? Networks.PUBLIC 
      : Networks.TESTNET;

    let tx: Transaction;
    try {
      tx = TransactionBuilder.fromXDR(unsignedTxXdr, networkPassphrase) as Transaction;
    } catch (err) {
      throw new Error("Invalid unsigned transaction XDR.");
    }

    tx.sign(adminKeypair);
    return tx.toXDR();
  }
}

export const sorobanAdminService = new SorobanAdminService();
