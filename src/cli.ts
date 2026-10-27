#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFile } from "node:fs/promises";
import { inspect, markdown } from "./inspect.js";
try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean" },
      port: { type: "string" },
      json: { type: "boolean" },
      markdown: { type: "boolean" },
    },
  });
  if (values.help)
    console.log(
      'paylint ["solana:..."] [--json | --markdown]\n\nNo URL: start a local dashboard with QR image inspection.\n  --port PORT    Dashboard port (default 4460)\n  --version\n\nURL inspection is offline. No wallet, payments or endpoint fetches.\nExit: 0 structurally valid, 1 malformed request, 2 usage/server error.',
    );
  else if (values.version)
    console.log(
      (
        JSON.parse(
          await readFile(new URL("../package.json", import.meta.url), "utf8"),
        ) as { version: string }
      ).version,
    );
  else {
    if (positionals.length > 1 || (values.json && values.markdown))
      throw new Error("Invalid arguments. Run paylint --help.");
    if (positionals[0]) {
      if (values.port) throw new Error("--port applies to the dashboard only.");
      const r = inspect(positionals[0]);
      process.stdout.write(
        values.json ? JSON.stringify(r, null, 2) + "\n" : markdown(r),
      );
      process.exitCode = r.valid ? 0 : 1;
    } else {
      if (values.json || values.markdown)
        throw new Error("Provide a Solana Pay URL to inspect.");
      const raw = values.port ?? process.env.PORT ?? "4460";
      if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 65535)
        throw new Error("Port must be an integer from 1 to 65535.");
      const { createServer } = await import("./server.js");
      const server = createServer();
      server.on("error", (error) => {
        console.error(
          (error as NodeJS.ErrnoException).code === "EADDRINUSE"
            ? "Port is already in use. Choose --port PORT."
            : "Could not start the local dashboard.",
        );
        process.exitCode = 2;
      });
      server.listen(Number(raw), "127.0.0.1", () =>
        console.log(
          `paylint → http://127.0.0.1:${raw}\nInspect locally. Press Ctrl+C to stop.`,
        ),
      );
      for (const signal of ["SIGINT", "SIGTERM"] as const)
        process.on(signal, () => {
          server.closeAllConnections();
          server.close();
        });
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : "Unable to start paylint.",
  );
  process.exitCode = 2;
}
