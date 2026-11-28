import { Keypair, TransactionBuilder, Networks, Account, Transaction } from "@stellar/stellar-sdk";
import { sorobanAdminService } from "../sorobanAdmin.service";
import { env } from "../../config/env";

jest.mock("../../config/env", () => ({
  env: {
    ADMIN_SECRET_KEY: "",
    STELLAR_NETWORK: "testnet",
  }
}));

describe("SorobanAdminService", () => {
  let validSecret: string;
  let testTxXdr: string;

  beforeAll(() => {
    const keypair = Keypair.random();
    validSecret = keypair.secret();
    
    // Create a dummy transaction to test signing
    const source = new Account(keypair.publicKey(), "1");
    const tx = new TransactionBuilder(source, {
      fee: "100",
      networkPassphrase: Networks.TESTNET,
    }).setTimeout(10).build();
    
    testTxXdr = tx.toXDR();
  });

  afterEach(() => {
    jest.clearAllMocks();
    (env as any).ADMIN_SECRET_KEY = "";
  });

  it("should throw if ADMIN_SECRET_KEY is not configured", () => {
    expect(() => sorobanAdminService.signTransaction(testTxXdr)).toThrow("ADMIN_SECRET_KEY is not configured.");
  });

  it("should throw if ADMIN_SECRET_KEY is invalid", () => {
    (env as any).ADMIN_SECRET_KEY = "invalid_secret";
    expect(() => sorobanAdminService.signTransaction(testTxXdr)).toThrow("Invalid ADMIN_SECRET_KEY configuration.");
  });

  it("should throw if unsignedTxXdr is invalid", () => {
    (env as any).ADMIN_SECRET_KEY = validSecret;
    expect(() => sorobanAdminService.signTransaction("invalid_xdr")).toThrow("Invalid unsigned transaction XDR.");
  });

  it("should successfully sign a valid transaction", () => {
    (env as any).ADMIN_SECRET_KEY = validSecret;
    const signedXdr = sorobanAdminService.signTransaction(testTxXdr);
    
    const signedTx = TransactionBuilder.fromXDR(signedXdr, Networks.TESTNET) as Transaction;
    expect(signedTx.signatures.length).toBe(1);
    
    const keypair = Keypair.fromSecret(validSecret);
    const hash = signedTx.hash();
    const isValid = keypair.verify(hash, signedTx.signatures[0].signature());
    expect(isValid).toBe(true);
  });
});
