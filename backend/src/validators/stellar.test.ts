import { describe, it, expect } from 'vitest';
import { isValidStellarAddress, isValidStellarMemo } from './stellar';

// Well-known valid StrKey values used across the Stellar ecosystem.
const VALID_G = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF5';
const VALID_C = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const VALID_M = 'MAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

describe('isValidStellarAddress', () => {
  it('accepts G- (ed25519 public key) addresses', () => {
    expect(isValidStellarAddress(VALID_G)).toBe(true);
  });

  it('accepts C- (contract id) addresses', () => {
    expect(isValidStellarAddress(VALID_C)).toBe(true);
  });

  it('accepts M- (muxed account) addresses', () => {
    expect(isValidStellarAddress(VALID_M)).toBe(true);
  });

  it('rejects malformed and empty values', () => {
    expect(isValidStellarAddress('')).toBe(false);
    expect(isValidStellarAddress('not-an-address')).toBe(false);
    expect(isValidStellarAddress('G123')).toBe(false);
    expect(isValidStellarAddress(VALID_G.slice(0, -1))).toBe(false);
  });
});

describe('isValidStellarMemo', () => {
  it('accepts valid memo text within the 28 byte limit', () => {
    expect(isValidStellarMemo('hello')).toBe(true);
    expect(isValidStellarMemo('')).toBe(true);
  });

  it('rejects memo text longer than 28 bytes', () => {
    expect(isValidStellarMemo('a'.repeat(29))).toBe(false);
  });
});
