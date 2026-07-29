import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";

const stellarPublicKey = (fieldName: string) =>
  z.string().refine((v: string) => StrKey.isValidEd25519PublicKey(v), {
    message: `Invalid Stellar public key for ${fieldName}`,
  });

// Amount validation: required, numeric string or number, positive, within safe range (up to 922337203685.4775807 - safe JS number)
const amount = z.union([
  z.string().regex(/^\d+(\.\d{1,7})?$/, "Amount must be a valid numeric string (up to 7 decimal places)"),
  z.number().positive("Amount must be a positive number"),
]).refine(
  (val) => {
    const numVal = typeof val === "string" ? parseFloat(val) : val;
    return numVal > 0 && numVal <= 922337203685.4775807;
  },
  { message: "Amount must be positive and within safe range (1 to 922337203685.4775807)" }
);

export const treasuryWithdrawSchema = z.object({
  destination: stellarPublicKey("destination"),
  amount,
  note: z.string().max(2000, "Note must be 2000 characters or fewer").optional(),
});
