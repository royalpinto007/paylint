import { test } from "node:test";
import assert from "node:assert/strict";
import { inspect, markdown } from "../src/inspect.js";
const address = "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN";
const mint = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
test("preserves exact SOL amounts and decoded metadata", () => {
  const r = inspect(
    `solana:${address}?amount=0.000000001&label=Coffee%20shop&memo=order%231`,
  );
  assert.equal(r.valid, true);
  assert.equal(r.kind, "transfer");
  assert.equal(r.amount, "0.000000001");
  assert.equal(r.lamports, "1");
  assert.equal(r.label, "Coffee shop");
  assert.equal(r.memo, "order#1");
  assert.ok(r.diagnostics.some((d) => d.code === "memo-public"));
});
for (const amount of [
  "-1",
  ".1",
  "1e3",
  "1.",
  "NaN",
  "Infinity",
  "1.0000000001",
  "",
  "+1",
  "18446744074",
])
  test(`rejects malformed SOL amount ${amount}`, () => {
    assert.equal(
      inspect(`solana:${address}?amount=${encodeURIComponent(amount)}`).valid,
      false,
    );
  });
test("zero and omitted amounts are distinct", () => {
  assert.equal(inspect(`solana:${address}?amount=0`).lamports, "0");
  assert.equal(inspect(`solana:${address}`).amount, null);
});
test("token decimals remain unknown without a chain lookup", () => {
  const r = inspect(
    `solana:${address}?spl-token=${mint}&amount=1.123456789012`,
  );
  assert.equal(r.valid, true);
  assert.equal(r.lamports, null);
  assert.ok(r.diagnostics.some((d) => d.code === "token-unverified"));
});
test("references retain ordering and allow arbitrary 32 byte values", () => {
  const r = inspect(
    `solana:${address}?reference=11111111111111111111111111111111&reference=${address}`,
  );
  assert.equal(r.valid, true);
  assert.deepEqual(r.references, ["11111111111111111111111111111111", address]);
});
for (const suffix of [
  "?amount=1&amount=2",
  "?spl-token=abc",
  "?reference=abc",
  "?label=%ZZ",
  "?label=%FF",
  "#fragment",
])
  test(`rejects ${suffix}`, () => {
    assert.equal(inspect(`solana:${address}${suffix}`).valid, false);
  });
for (const input of [
  "https://example.com",
  "solana://" + address,
  "solana:abc",
  "solana:",
  "solana:" + address + "\u0000",
  "x".repeat(8193),
])
  test("rejects invalid input " + input.slice(0, 40), () => {
    assert.equal(inspect(input).valid, false);
  });
test("unknown parameters are reported instead of silently discarded", () => {
  const r = inspect(`solana:${address}?cluster=devnet`);
  assert.ok(r.diagnostics.some((d) => d.code === "unknown-parameter"));
  assert.equal(r.network, "Not encoded in Solana Pay URL");
});
test("transaction requests expose endpoint but never fetch it", () => {
  const url = "https://example.com/pay?order=42";
  const r = inspect("solana:" + encodeURIComponent(url));
  assert.equal(r.valid, true);
  assert.equal(r.kind, "transaction");
  assert.equal(r.endpoint, url);
  assert.equal(r.hostname, "example.com");
  assert.ok(r.diagnostics.some((d) => d.code === "endpoint-not-fetched"));
});
for (const link of [
  "http://example.com/pay",
  "https://user:pass@example.com/pay",
  "https://example.com/pay?order=42",
])
  test("rejects insecure or ambiguously encoded transaction " + link, () => {
    const input =
      link.includes("user:") || link.startsWith("http:")
        ? encodeURIComponent(link)
        : link;
    assert.equal(inspect("solana:" + input).valid, false);
  });
test("metadata cannot inject report structure", () => {
  const r = inspect(
    `solana:${address}?label=${encodeURIComponent("<script>alert(1)</script>\n# Heading")}`,
  );
  assert.equal(r.valid, false);
  assert.ok(!markdown(r).includes("\n# Heading"));
});
test("encoded endpoint controls are rejected before URL normalization", () => {
  assert.equal(
    inspect("solana:" + encodeURIComponent("https://exa\nmple.com/pay")).valid,
    false,
  );
});
