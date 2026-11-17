#!/usr/bin/env node
/**
 * Run inside the staging Fly machine through `flyctl ssh console`.
 * It proves that the two-process entrypoint really has both the Next server
 * and the public cache proxy alive, rather than only the proxy answering.
 */
const fs = require("node:fs");

const processes = [];
for (const entry of fs.readdirSync("/proc")) {
  if (!/^\d+$/.test(entry)) continue;
  try {
    const command = fs
      .readFileSync(`/proc/${entry}/cmdline`, "utf8")
      .split("\0")
      .join(" ")
      .trim();
    if (command) processes.push({ pid: entry, command });
  } catch {
    // A process can exit between readdir and read; ignore it.
  }
}

const next = processes.find(
  ({ command }) =>
    command.includes("next-server") || /(?:^|\s)node\s+server\.js(?:\s|$)/.test(command),
);
const proxy = processes.find(({ command }) =>
  command.includes("public-html-cache-proxy.mjs"),
);

if (!next) {
  console.error("[staging-check] Next server process not found");
  process.exit(1);
}
if (!proxy) {
  console.error("[staging-check] public cache proxy process not found");
  process.exit(1);
}

console.log(`[staging-check] Next: ${next.pid} ${next.command}`);
console.log(`[staging-check] cache proxy: ${proxy.pid} ${proxy.command}`);
console.log("[staging-check] both processes are running");
