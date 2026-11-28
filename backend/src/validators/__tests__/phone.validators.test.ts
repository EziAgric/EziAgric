import { normalizePhoneE164 } from "../phone.validators";

describe("normalizePhoneE164 (#935)", () => {
  it.each([
    // Nigerian prefixes in national format
    ["07031234567", "+2347031234567"],
    ["08031234567", "+2348031234567"],
    ["08131234567", "+2348131234567"],
    ["09031234567", "+2349031234567"],
    ["09131234567", "+2349131234567"],
    // bare subscriber number / country code without '+'
    ["8031234567", "+2348031234567"],
    ["2348031234567", "+2348031234567"],
    // common formatting noise
    ["0803 123 4567", "+2348031234567"],
    ["0803-123-4567", "+2348031234567"],
    ["(0803) 123.4567", "+2348031234567"],
    ["  +234 803 123 4567 ", "+2348031234567"],
    ["002348031234567", "+2348031234567"],
    // trunk zero kept after the country code
    ["+234 0803 123 4567", "+2348031234567"],
    // already E.164, including non-Nigerian numbers
    ["+2348031234567", "+2348031234567"],
    ["+447911123456", "+447911123456"],
  ])("normalizes %p to %p", (input, expected) => {
    expect(normalizePhoneE164(input)).toBe(expected);
  });

  it.each([
    "",
    "abc",
    "0803123456", // too short
    "080312345678", // too long
    "06031234567", // not a Nigerian mobile prefix
    "+2346031234567",
    "+234803123456",
    "0803x1234567",
    "+12",
  ])("rejects %p", (input) => {
    expect(normalizePhoneE164(input)).toBeNull();
  });
});
