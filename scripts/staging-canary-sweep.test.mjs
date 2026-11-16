import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import path from "node:path";
import { test } from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const sweepScript = path.join(root, "scripts", "staging-canary-sweep.mjs");
const marker = "staging-billing-canary";
const old = Math.floor(Date.now() / 1000) - 3 * 86_400;
const recent = Math.floor(Date.now() / 1000) - 60;

function runSweep(env, args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [sweepScript, ...args], { cwd: root, env });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
  });
}

async function withServer(callback) {
  const deletes = [];
  const customers = [
    { id: "cus_old", created: old, metadata: { canary: marker } },
    { id: "cus_new", created: recent, metadata: { canary: marker } },
    { id: "cus_other", created: old, metadata: { canary: "not-the-canary" } },
  ];
  const subscriptions = [
    { id: "sub_old", created: old, metadata: { canary: marker } },
    { id: "sub_new", created: recent, metadata: { canary: marker } },
    { id: "sub_other", created: old, metadata: { canary: "not-the-canary" } },
  ];

  const server = createServer((request, response) => {
    const url = request.url ?? "";
    response.setHeader("connection", "close");
    if (request.method === "GET" && url.startsWith("/v1/customers")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: customers, has_more: false }));
      return;
    }
    if (request.method === "GET" && url.startsWith("/v1/subscriptions")) {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: subscriptions, has_more: false }));
      return;
    }
    if (request.method === "DELETE") {
      deletes.push(url);
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ id: url.split("/").at(-1), deleted: true }));
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { message: "unexpected request" } }));
  });

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const { port } = server.address();
    await callback({
      base: `http://127.0.0.1:${port}`,
      deletes,
    });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
}

test("sweeper defaults to dry-run and selects only old exact canary objects", async () => {
  await withServer(async ({ base, deletes }) => {
    const result = await runSweep({
      ...process.env,
      STRIPE_SECRET_KEY: "sk_test_sweep",
      STRIPE_API_BASE: base,
      CANARY_SWEEP_APPLY: "0",
    });

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.dryRun, true);
    assert.deepEqual(output.subscriptions, ["sub_old"]);
    assert.deepEqual(output.customers, ["cus_old"]);
    assert.deepEqual(deletes, []);
  });
});

test("sweeper apply deletes only old exact canary objects", async () => {
  await withServer(async ({ base, deletes }) => {
    const result = await runSweep(
      {
        ...process.env,
        STRIPE_SECRET_KEY: "sk_test_sweep",
        STRIPE_API_BASE: base,
      },
      ["--apply"],
    );

    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout.trim());
    assert.equal(output.dryRun, false);
    assert.deepEqual(output.deleted.subscriptions, ["sub_old"]);
    assert.deepEqual(output.deleted.customers, ["cus_old"]);
    assert.deepEqual(deletes.sort(), ["/v1/customers/cus_old", "/v1/subscriptions/sub_old"]);
  });
});

test("sweeper refuses a live key before making a request", async () => {
  await withServer(async ({ base, deletes }) => {
    const result = await runSweep({
      ...process.env,
      STRIPE_SECRET_KEY: "sk_live_sweep",
      STRIPE_API_BASE: base,
    });

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /must be a test-mode key/);
    assert.deepEqual(deletes, []);
  });
});
