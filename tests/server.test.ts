import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.js";
import { once } from "node:events";
import { get } from "node:http";
test("dashboard serves only local static routes with restrictive headers", async () => {
  const server = createServer(new URL("../public/", import.meta.url));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const port = (server.address() as { port: number }).port;
    const url = `http://127.0.0.1:${port}`;
    const home = await fetch(url);
    assert.equal(home.status, 200);
    assert.match(
      home.headers.get("content-security-policy")!,
      /connect-src 'none'/,
    );
    assert.match(await home.text(), /paylint/);
    assert.equal((await fetch(url + "/package.json")).status, 404);
    assert.equal(
      (await fetch(url, { method: "POST", body: "private" })).status,
      405,
    );
    assert.equal(
      await new Promise<number>((resolve, reject) => {
        get(url, { headers: { host: "attacker.example" } }, (res) => {
          res.resume();
          resolve(res.statusCode!);
        }).on("error", reject);
      }),
      403,
    );
    assert.equal(
      (await fetch(url, { headers: { origin: "https://attacker.example" } }))
        .status,
      403,
    );
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
