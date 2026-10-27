import bs58 from "bs58";
export interface Diagnostic {
  code: string;
  level: "error" | "review" | "info";
  message: string;
}
export interface Inspection {
  valid: boolean;
  kind: "transfer" | "transaction" | "unknown";
  recipient: string | null;
  amount: string | null;
  lamports: string | null;
  mint: string | null;
  references: string[];
  label: string | null;
  message: string | null;
  memo: string | null;
  endpoint: string | null;
  hostname: string | null;
  network: string;
  diagnostics: Diagnostic[];
}
export function inspect(input: string): Inspection {
  const r: Inspection = {
    valid: false,
    kind: "unknown",
    recipient: null,
    amount: null,
    lamports: null,
    mint: null,
    references: [],
    label: null,
    message: null,
    memo: null,
    endpoint: null,
    hostname: null,
    network: "Not encoded in Solana Pay URL",
    diagnostics: [],
  };
  const add = (code: string, level: Diagnostic["level"], message: string) =>
    r.diagnostics.push({ code, level, message });
  const finish = () => {
    r.valid = !r.diagnostics.some((d) => d.level === "error");
    return r;
  };
  if (
    input.length > 8192 ||
    Array.from(input).some((c) => {
      const n = c.codePointAt(0)!;
      return n < 32 || (n >= 127 && n <= 159);
    })
  ) {
    add(
      "input",
      "error",
      "Use a Solana Pay URL of at most 8192 characters without control characters.",
    );
    return r;
  }
  input = input.trim();
  if (!/^solana:/i.test(input) || /^solana:\/\//i.test(input)) {
    add(
      "scheme",
      "error",
      "Expected solana:<recipient> or solana:<HTTPS endpoint>.",
    );
    return r;
  }
  const body = input.slice(7);
  if (body.includes("#")) {
    add(
      "fragment",
      "error",
      "Outer URL fragments are not supported. Percent-encode metadata values.",
    );
    return r;
  }
  const q = body.indexOf("?"),
    path = q < 0 ? body : body.slice(0, q),
    query = q < 0 ? "" : body.slice(q + 1);
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
    for (const part of query.split("&"))
      for (const s of part.split("="))
        decodeURIComponent(s.replace(/\+/g, " "));
  } catch {
    add("encoding", "error", "Invalid percent encoding or UTF-8 in the URL.");
    return r;
  }
  if (
    Array.from(decoded).some((c) => {
      const n = c.codePointAt(0)!;
      return n < 32 || (n >= 127 && n <= 159);
    })
  ) {
    add(
      "endpoint-control",
      "error",
      "Decoded URL path contains control characters.",
    );
    return r;
  }
  if (/^https?:/i.test(decoded)) {
    r.kind = "transaction";
    try {
      const endpoint = new URL(decoded);
      if (
        endpoint.protocol !== "https:" ||
        endpoint.username ||
        endpoint.password
      )
        throw new Error("endpoint");
      r.endpoint = endpoint.href;
      r.hostname = endpoint.hostname;
      if (query)
        add(
          "endpoint-query",
          "error",
          "Encode the full HTTPS endpoint when it contains query parameters. Outer transaction-request parameters are not supported.",
        );
      if (endpoint.hash)
        add(
          "endpoint-fragment",
          "review",
          "Endpoint contains a fragment; HTTP requests do not send fragments to servers.",
        );
      add(
        "endpoint-not-fetched",
        "review",
        "Endpoint was not fetched. Recipient, instructions and amount are unknown until its returned transaction is inspected.",
      );
    } catch {
      add(
        "endpoint",
        "error",
        "Transaction requests require an absolute HTTPS endpoint without embedded credentials.",
      );
    }
    return finish();
  }
  r.kind = "transfer";
  r.recipient = path;
  const address = (value: string) => {
    try {
      return (
        value.length >= 32 &&
        value.length <= 44 &&
        bs58.decode(value).length === 32
      );
    } catch {
      return false;
    }
  };
  if (!address(path))
    add(
      "recipient",
      "error",
      "Recipient must be a base58-encoded 32-byte address.",
    );
  const params = new URLSearchParams(query),
    known = new Set([
      "amount",
      "spl-token",
      "reference",
      "label",
      "message",
      "memo",
    ]);
  for (const key of new Set(params.keys())) {
    if (!known.has(key))
      add(
        "unknown-parameter",
        "review",
        "An unknown parameter is present. It has not been interpreted.",
      );
    if (key !== "reference" && params.getAll(key).length > 1)
      add("duplicate", "error", "Only reference may appear more than once.");
  }
  r.mint = params.get("spl-token");
  if (r.mint !== null && !address(r.mint))
    add(
      "mint",
      "error",
      "Token mint must be a base58-encoded 32-byte address.",
    );
  r.references = params.getAll("reference");
  if (r.references.some((v) => !address(v)))
    add(
      "reference",
      "error",
      "Each reference must encode exactly 32 bytes in base58.",
    );
  r.amount = params.get("amount");
  if (r.amount !== null) {
    if (!/^\d+(?:\.\d+)?$/.test(r.amount))
      add(
        "amount",
        "error",
        "Amount must be a non-negative decimal with a leading digit, without signs or scientific notation.",
      );
    else if (r.mint === null) {
      const [whole = "0", fraction = ""] = r.amount.split(".");
      if (fraction.length > 9)
        add("precision", "error", "SOL supports at most 9 decimal places.");
      else {
        const units =
          BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
        if (units > 18_446_744_073_709_551_615n)
          add(
            "amount-range",
            "error",
            "SOL amount exceeds the u64 lamport range.",
          );
        else r.lamports = units.toString();
      }
    }
  } else
    add(
      "amount-open",
      "info",
      "No amount is specified. A wallet would ask the payer for an amount.",
    );
  for (const key of ["label", "message", "memo"] as const) {
    const value = params.get(key);
    r[key] = value;
    if (
      value !== null &&
      Array.from(value).some((c) => {
        const n = c.codePointAt(0)!;
        return n < 32 || (n >= 127 && n <= 159);
      })
    ) {
      r[key] = null;
      add("metadata-control", "error", "Metadata contains control characters.");
    }
  }
  if (r.memo !== null)
    add(
      "memo-public",
      "review",
      "A memo would be written on-chain and publicly visible. Avoid private information.",
    );
  if (r.mint !== null)
    add(
      "token-unverified",
      "review",
      "Token identity, decimals and mint existence are not verified offline. Token precision remains unknown.",
    );
  add(
    "accounts-unverified",
    "review",
    "Address format only: recipient identity, account type and existence have not been checked.",
  );
  return finish();
}
const safe = (s: string) =>
  s.replace(/[\\`*_[\]<>|]/g, "\\$&").replace(/[\r\n]/g, " ");
export function markdown(r: Inspection): string {
  return `# paylint inspection\n\n${r.valid ? "No structural errors found" : "Malformed or unsupported request"} · ${r.kind}\n\nThis is URL inspection, not proof of safety or payment. Network: ${r.network}.\n\n${Object.entries(
    {
      Recipient: r.recipient,
      Amount: r.amount,
      "Lamports (SOL only)": r.lamports,
      "Token mint": r.mint,
      Label: r.label,
      Message: r.message,
      Memo: r.memo,
      Endpoint: r.endpoint,
    },
  )
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `- ${k}: ${safe(v!)}`)
    .join(
      "\n",
    )}\n\n${r.references.map((v, i) => `- Reference ${i + 1}: ${safe(v)}`).join("\n")}\n\n${r.diagnostics.map((d) => `- **${d.level}**: ${d.message}`).join("\n")}\n`;
}
