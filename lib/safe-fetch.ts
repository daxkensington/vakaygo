import dns from "dns/promises";
import net from "net";

/**
 * SSRF-hardened fetch for user/operator-supplied URLs (e.g. iCal import feeds).
 *
 * Unlike the image proxy — which can use a host allowlist because it only ever
 * talks to a handful of CDNs — calendar feeds come from arbitrary operator
 * hosts, so we defend by IP range instead:
 *   - protocol must be http/https
 *   - the hostname must NOT resolve to a private / loopback / link-local /
 *     reserved range (incl. the 169.254.169.254 cloud-metadata endpoint and
 *     IPv4-mapped IPv6)
 *   - every redirect hop is re-validated (redirect: "manual")
 *   - the body is capped so a malicious feed can't exhaust memory
 *
 * Runs in the Node runtime (uses the `dns`/`net` built-ins).
 *
 * Residual: this validates the resolved IPs then lets fetch() re-resolve, so a
 * determined attacker with a low-TTL record could DNS-rebind between the check
 * and the connection. The direct-internal-URL and redirect-to-internal vectors
 * (the practical ones) ARE blocked; full rebinding mitigation would require
 * pinning the validated IP on the socket (custom undici dispatcher).
 */

function ipv4ToLong(ip: string): number {
  return ip
    .split(".")
    .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

function inV4Cidr(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToLong(ip) & mask) === (ipv4ToLong(base) & mask);
}

function isPrivateV4(ip: string): boolean {
  return (
    inV4Cidr(ip, "0.0.0.0", 8) || // "this" network
    inV4Cidr(ip, "10.0.0.0", 8) ||
    inV4Cidr(ip, "100.64.0.0", 10) || // CGNAT
    inV4Cidr(ip, "127.0.0.0", 8) || // loopback
    inV4Cidr(ip, "169.254.0.0", 16) || // link-local incl. cloud metadata
    inV4Cidr(ip, "172.16.0.0", 12) ||
    inV4Cidr(ip, "192.0.0.0", 24) ||
    inV4Cidr(ip, "192.168.0.0", 16) ||
    inV4Cidr(ip, "198.18.0.0", 15) || // benchmarking
    inV4Cidr(ip, "224.0.0.0", 4) || // multicast
    inV4Cidr(ip, "240.0.0.0", 4) // reserved
  );
}

function isPrivateV6(ip: string): boolean {
  const s = ip.toLowerCase().split("%")[0]; // strip zone id
  if (s === "::1" || s === "::") return true;
  // IPv4-mapped in dotted form (::ffff:a.b.c.d) — check the embedded v4
  const mappedDotted = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isPrivateV4(mappedDotted[1]);
  // IPv4-mapped in hex form (::ffff:7f00:1 == 127.0.0.1) — decode the low 32 bits
  const mappedHex = s.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) {
    const hi = parseInt(mappedHex[1], 16);
    const lo = parseInt(mappedHex[2], 16);
    const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
    return isPrivateV4(v4);
  }
  if (s.startsWith("fc") || s.startsWith("fd")) return true; // unique-local fc00::/7
  if (s.startsWith("fe8") || s.startsWith("fe9") || s.startsWith("fea") || s.startsWith("feb"))
    return true; // link-local fe80::/10
  return false;
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isPrivateV4(ip);
  if (net.isIPv6(ip)) return isPrivateV6(ip);
  return true; // unknown form → reject
}

async function assertPublicHost(hostname: string): Promise<void> {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("blocked: private address");
    return;
  }
  const records = await dns.lookup(hostname, { all: true });
  if (!records.length) throw new Error("blocked: DNS resolution failed");
  for (const r of records) {
    if (isPrivateIp(r.address)) throw new Error("blocked: resolves to private address");
  }
}

export async function safeFetchText(
  rawUrl: string,
  opts: { maxBytes?: number; timeoutMs?: number; maxRedirects?: number } = {}
): Promise<string> {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const timeoutMs = opts.timeoutMs ?? 15000;
  let redirectsLeft = opts.maxRedirects ?? 3;

  let url = new URL(rawUrl);

  for (;;) {
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error("blocked: unsupported protocol");
    }
    await assertPublicHost(url.hostname);

    const res = await fetch(url, {
      headers: {
        "User-Agent": "VakayGo/1.0 Calendar Sync",
        Accept: "text/calendar, text/plain, */*",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc || redirectsLeft <= 0) throw new Error("blocked: too many redirects");
      url = new URL(loc, url); // re-validated at the top of the loop
      redirectsLeft -= 1;
      continue;
    }

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const declared = parseInt(res.headers.get("content-length") || "0", 10);
    if (declared && declared > maxBytes) throw new Error("blocked: response too large");

    const reader = res.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.length;
        if (total > maxBytes) {
          await reader.cancel();
          throw new Error("blocked: response too large");
        }
        chunks.push(value);
      }
    }
    return Buffer.concat(chunks).toString("utf8");
  }
}
