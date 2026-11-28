/**
 * Device-context derivation for admin session binding (issue #198).
 *
 * Produces a coarse, privacy-preserving fingerprint of "which device + which
 * network" a request came from, so a stolen admin bearer used from a different
 * device/network is rejected instead of silently accepted.
 *
 *   - `deviceHash`: SHA-256 over stable client headers (UA, language, UA client
 *     hints). Not PII — it is a one-way hash and is stored/compared as such.
 *   - `ipClass`: the request IP masked to a prefix (default /24 v4, /48 v6) so
 *     normal carrier-grade NAT / DHCP churn within one network does not trip a
 *     re-challenge, but a different ISP/region does.
 */

import crypto from "crypto";
import type { Request } from "express";
import { runtimeEnvValue } from "../config/env";

export interface DeviceContext {
  deviceHash: string;
  ipClass: string;
}

function headerValue(req: Request, name: string): string {
  const v = req.headers[name];
  if (Array.isArray(v)) return v.join(",");
  return typeof v === "string" ? v : "";
}

/** Stable SHA-256 fingerprint of the requesting client. */
export function deviceFingerprint(req: Request): string {
  const material = [
    headerValue(req, "user-agent"),
    headerValue(req, "accept-language"),
    headerValue(req, "sec-ch-ua"),
    headerValue(req, "sec-ch-ua-platform"),
  ].join("\n");
  return crypto.createHash("sha256").update(material).digest("hex");
}

function maskV4(addr: string, bits: number): string | null {
  const octets = addr.split(".").map((o) => Number.parseInt(o, 10));
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) {
    return null;
  }
  const int =
    ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const mask = bits <= 0 ? 0 : bits >= 32 ? 0xffffffff : (0xffffffff << (32 - bits)) >>> 0;
  const m = (int & mask) >>> 0;
  return [(m >>> 24) & 255, (m >>> 16) & 255, (m >>> 8) & 255, m & 255].join(".");
}

/** Expand an IPv6 address (with optional `::`) to 8 numeric hextets. */
function expandV6(addr: string): number[] | null {
  let a = addr.replace(/^\[|\]$/g, "");
  const zone = a.indexOf("%");
  if (zone >= 0) a = a.slice(0, zone);

  const halves = a.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  let groups: string[];
  if (halves.length === 1) {
    groups = head;
  } else {
    const missing = 8 - head.length - tail.length;
    if (missing < 0) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  }
  if (groups.length !== 8) return null;

  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    out.push(Number.parseInt(g, 16));
  }
  return out;
}

function maskV6(groups: number[], bits: number): string {
  const out = groups.slice();
  for (let i = 0; i < 8; i++) {
    const groupStart = i * 16;
    if (groupStart >= bits) {
      out[i] = 0;
    } else if (bits - groupStart < 16) {
      const keep = bits - groupStart;
      out[i] = out[i] & ((0xffff << (16 - keep)) & 0xffff);
    }
  }
  return out.map((h) => h.toString(16)).join(":");
}

/** Mask an IP address to a network-prefix "class" string. */
export function ipPrefixClass(
  ip: string | undefined | null,
  v4Bits: number,
  v6Bits: number,
): string {
  if (!ip) return "unknown";
  let addr = ip.trim();
  if (addr.startsWith("::ffff:") && addr.includes(".")) {
    addr = addr.slice("::ffff:".length);
  }
  if (addr.includes(".") && !addr.includes(":")) {
    const masked = maskV4(addr, v4Bits);
    return masked ? `v4/${masked}/${v4Bits}` : "unknown";
  }
  if (addr.includes(":")) {
    const groups = expandV6(addr);
    if (!groups) return "unknown";
    return `v6/${maskV6(groups, Math.min(Math.max(v6Bits, 0), 128))}/${v6Bits}`;
  }
  return "unknown";
}

/** Derive the full device context for a request using configured prefix widths. */
export function deviceContextFromRequest(req: Request): DeviceContext {
  const v4Bits = runtimeEnvValue("ADMIN_IP_V4_PREFIX_BITS");
  const v6Bits = runtimeEnvValue("ADMIN_IP_V6_PREFIX_BITS");
  return {
    deviceHash: deviceFingerprint(req),
    ipClass: ipPrefixClass(req.ip, v4Bits, v6Bits),
  };
}
