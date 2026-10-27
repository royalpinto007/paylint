import { inspect, markdown, type Inspection } from "../inspect.js";
import jsQRModule from "jsqr";
const jsQR = jsQRModule as unknown as (
  data: Uint8ClampedArray,
  width: number,
  height: number,
) => { data: string } | null;
function el<T extends HTMLElement>(id: string) {
  return document.getElementById(id) as T;
}
const input = el<HTMLTextAreaElement>("request"),
  feedback = el("feedback"),
  result = el("result");
const address = "mvines9iiHiQTysrwkJjGf2gb9Ex9jXJX8ns3qwf2kN";
const examples: Record<string, string> = {
  sol: `solana:${address}?amount=0.01&label=Coffee%20shop&message=One%20good%20coffee`,
  token: `solana:${address}?amount=5.25&spl-token=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&label=Token%20example`,
  transaction:
    "solana:" + encodeURIComponent("https://example.com/pay?order=42"),
  bad: `solana:${address}?amount=1e3&amount=2`,
};
let current: Inspection | undefined;
let revision = 0;
function show() {
  revision++;
  feedback.textContent = "";
  current = inspect(input.value);
  const r = current;
  result.replaceChildren();
  el("result-kind").textContent = r.kind.toUpperCase();
  const verdict = document.createElement("div");
  verdict.className = "verdict" + (r.valid ? "" : " invalid");
  const title = document.createElement("strong");
  title.dataset.testid = "verdict";
  title.textContent = r.valid
    ? "No structural errors found"
    : "Malformed or unsupported request";
  const note = document.createElement("p");
  note.textContent =
    "Format inspection only. Safety and payment status are unverified.";
  verdict.append(title, note);
  result.append(verdict);
  const list = document.createElement("dl");
  function field(label: string, value: string | null, testid?: string) {
    if (value === null) return;
    const wrap = document.createElement("div"),
      dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = label;
    dd.textContent = value;
    if (testid) dd.dataset.testid = testid;
    if (testid === "amount") dd.className = "amount";
    wrap.append(dt, dd);
    list.append(wrap);
  }
  if (r.kind === "transfer") {
    field(
      "Amount",
      r.amount === null
        ? "Open amount"
        : r.amount + (r.mint === null ? " SOL" : " token units"),
      "amount",
    );
    field("Recipient", r.recipient);
    field("Token mint", r.mint);
    field("Exact lamports", r.lamports);
    field("Label", r.label, "label");
    field("Message", r.message);
    field("Memo", r.memo);
    r.references.forEach((v, i) => field(`Reference ${i + 1}`, v));
    field("Network", r.network);
  }
  if (r.kind === "transaction") {
    field("Endpoint (not fetched)", r.endpoint, "endpoint");
    field("Host", r.hostname);
  }
  result.append(list);
  const diagnostics = document.createElement("ul");
  diagnostics.className = "diagnostics";
  for (const d of r.diagnostics) {
    const li = document.createElement("li"),
      small = document.createElement("small");
    li.className = d.level;
    small.textContent = d.level;
    li.append(small, document.createTextNode(d.message));
    diagnostics.append(li);
  }
  result.append(diagnostics);
  el("exports").hidden = false;
}
el("inspect-form").addEventListener("submit", (event) => {
  event.preventDefault();
  show();
});
for (const button of document.querySelectorAll<HTMLButtonElement>(
  "[data-example]",
))
  button.addEventListener("click", () => {
    input.value = examples[button.dataset.example!]!;
    show();
  });
input.addEventListener("input", () => {
  revision++;
  current = undefined;
  el("exports").hidden = true;
  el("result-kind").textContent = "EDITED";
  feedback.textContent =
    "Request changed. Inspect again to refresh the breakdown.";
});
el<HTMLInputElement>("qr").addEventListener("change", async (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const attempt = ++revision;
  feedback.textContent = "Decoding locally…";
  let bitmap: ImageBitmap | undefined;
  try {
    if (
      file.size > 8 * 1024 * 1024 ||
      !["image/png", "image/jpeg", "image/webp"].includes(file.type)
    )
      throw new Error("Choose a PNG, JPEG or WebP image up to 8 MB.");
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 16_000_000)
      throw new Error("Image is too large. Use an image under 16 megapixels.");
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new Error("Image decoding is unavailable. Paste the URL instead.");
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
    const code = jsQR(pixels.data, pixels.width, pixels.height);
    if (!code)
      throw new Error("No readable QR code found. Try a clearer image.");
    if (attempt !== revision) return;
    input.value = code.data;
    show();
    feedback.textContent = "QR decoded locally. Its request is shown below.";
  } catch (error) {
    if (attempt === revision)
      feedback.textContent =
        error instanceof Error ? error.message : "Could not decode this image.";
  } finally {
    bitmap?.close();
    (event.target as HTMLInputElement).value = "";
  }
});
function download(format: "json" | "md") {
  if (!current) return;
  const blob = new Blob(
      [
        format === "json"
          ? JSON.stringify(current, null, 2)
          : markdown(current),
      ],
      { type: format === "json" ? "application/json" : "text/markdown" },
    ),
    url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `paylint-report.${format}`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
el("json").addEventListener("click", () => download("json"));
el("md").addEventListener("click", () => download("md"));
el("copy").addEventListener("click", async () => {
  if (!current) return;
  try {
    await navigator.clipboard.writeText(markdown(current));
    feedback.textContent = "Report copied.";
  } catch {
    feedback.textContent = "Clipboard unavailable. Export Markdown instead.";
  }
});
