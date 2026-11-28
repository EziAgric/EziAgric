jest.mock("../../middleware/logger", () => ({ appLogger: { warn: jest.fn() } }));

import { sendSms } from "../smsService";

describe("sendSms (#935)", () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    process.env.SMS_PROVIDER_URL = "https://sms.example/send";
    process.env.SMS_PROVIDER_API_KEY = "key";
    fetchMock.mockResolvedValue({ ok: true });
  });

  it("dispatches to the E.164 form of the stored number", async () => {
    await expect(sendSms("0803 123-4567", "Trade funded")).resolves.toBe(true);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ to: "+2348031234567", message: "Trade funded" });
  });

  it("skips unrecognisable numbers instead of calling the provider", async () => {
    await expect(sendSms("12345", "Trade funded")).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

jest.mock("../../lib/supabase", () => ({ getSupabaseClient: jest.fn(() => ({})) }));

jest.mock("@stellar/stellar-sdk", () => ({ StrKey: { isValidEd25519PublicKey: () => true } }));

import { sendPhoneOtp } from "../user.service";

describe("phone registration (#935)", () => {
  it("rejects malformed numbers with a 400 before any OTP or SMS is created", async () => {
    await expect(sendPhoneOtp("GVALIDADDRESS", "0803-12")).rejects.toMatchObject({
      statusCode: 400,
      message: "Invalid phone number",
    });
  });
});
