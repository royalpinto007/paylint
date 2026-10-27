import { createServer as http } from "node:http";
import { readFile } from "node:fs/promises";
const assets: Record<string, [string, string]> = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/app.js": ["app.js", "text/javascript; charset=utf-8"],
  "/styles.css": ["styles.css", "text/css; charset=utf-8"],
  "/architecture.svg": ["architecture.svg", "image/svg+xml"],
};
export function createServer(
  assetRoot = new URL("./public/", import.meta.url),
) {
  return http(async (req, res) => {
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=()",
    );
    const port = (req.socket.localPort ?? 0).toString();
    const allowed = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    if (
      !allowed.has(req.headers.host ?? "") ||
      (req.headers.origin &&
        !allowed.has(req.headers.origin.replace(/^http:\/\//, "")))
    ) {
      res.writeHead(403);
      res.end("Local requests only.");
      return;
    }
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end("Read-only server.");
      return;
    }
    const path = (req.url ?? "/").split("?")[0]!;
    const asset = Object.hasOwn(assets, path) ? assets[path] : undefined;
    if (!asset) {
      res.writeHead(404);
      res.end("Not found.");
      return;
    }
    try {
      const body = await readFile(new URL(asset[0], assetRoot));
      res.writeHead(200, { "Content-Type": asset[1] });
      res.end(req.method === "HEAD" ? undefined : body);
    } catch {
      res.writeHead(500);
      res.end("Build assets are missing. Run npm run build.");
    }
  });
}
