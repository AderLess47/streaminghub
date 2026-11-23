import assert from "node:assert/strict";
import test from "node:test";
import {
  audit,
  inspect,
  parseEnginesMajor,
  tagMajor,
} from "./check-docker-base-images.mjs";

const FILE = "Dockerfile";
const DIGEST = `sha256:${"a".repeat(64)}`;
const NODE = `node:22-bookworm-slim@${DIGEST}`;

// Fixtures zeilenweise als Strings: so bleibt im Test lesbar, welche Zeile
// geprueft wird.
const text = (...rows) => rows.join("\n");
const findings = (...rows) => inspect(FILE, text(...rows)).findings;
const reasons = (...rows) => findings(...rows).map((finding) => finding.reason);
const reasonsOf = (rows, options) => inspect(FILE, text(...rows), options).findings.map((finding) => finding.reason);

test("akzeptiert ein Node-Image mit Tag und Digest", () => {
  assert.deepEqual(findings(`FROM ${NODE} AS deps`), []);
});

test("akzeptiert fremde Images mit Tag und Digest", () => {
  assert.deepEqual(findings(`FROM alpine:3.20@${DIGEST}`), []);
});

test("akzeptiert eine Punktversion im Tag", () => {
  assert.deepEqual(findings(`FROM node:22.11.0-bookworm-slim@${DIGEST}`), []);
});

test("meldet ein FROM ohne Digest", () => {
  const found = findings("FROM node:22-bookworm-slim AS deps");
  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "digest");
  assert.equal(found[0].line, 1);
  assert.match(found[0].snippet, /node:22-bookworm-slim/);
});

test("meldet ein FROM ohne jeden Tag", () => {
  assert.deepEqual(reasons("FROM node"), ["digest"]);
});

test("meldet einen Digest ohne lesbaren Tag", () => {
  assert.deepEqual(reasons(`FROM node@${DIGEST}`), ["tag"]);
});

test("meldet einen Digest an einem falschen Platz", () => {
  assert.deepEqual(reasons("FROM node:22@latest"), ["digest"]);
  assert.deepEqual(reasons("FROM node:22@sha256:abc"), ["digest"]);
});

test("akzeptiert Stage-Verweise ohne Digest", () => {
  const result = inspect(FILE, text(`FROM ${NODE} AS deps`, "FROM deps AS builder"));
  assert.deepEqual(result.findings, []);
  assert.equal(result.stage, 1);
  assert.equal(result.external, 1);
});

test("erkennt Stage-Namen unabhaengig von der Grossschreibung", () => {
  assert.deepEqual(findings(`FROM ${NODE} AS Deps`, "FROM deps AS builder"), []);
});

test("akzeptiert FROM scratch", () => {
  const result = inspect(FILE, text("FROM scratch"));
  assert.deepEqual(result.findings, []);
  assert.equal(result.scratch, 1);
  assert.equal(result.external, 0);
});

test("meldet ein FROM mit Variable", () => {
  assert.deepEqual(reasons("ARG BASE", "FROM ${BASE} AS deps"), ["variable"]);
});

test("ignoriert Kommentarzeilen und Fliesstext", () => {
  assert.deepEqual(
    findings(
      "# FROM node:22-bookworm-slim",
      "RUN echo FROM node:22-bookworm-slim",
      "LABEL description=\"FROM ohne Digest\"",
    ),
    [],
  );
});

test("versteht --platform und Kommentare hinter dem FROM", () => {
  const result = inspect(
    FILE,
    text(`FROM --platform=linux/amd64 ${NODE} AS runner # Produktions-Image`, "FROM --platform=$BUILDPLATFORM " + NODE),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.external, 2);
});

test("meldet einen zu alten Node-Major", () => {
  const found = inspect(FILE, text(`FROM node:20-bookworm-slim@${DIGEST}`), { expectedNodeMajor: 22 }).findings;
  assert.equal(found.length, 1);
  assert.equal(found[0].reason, "node-drift");
  assert.equal(found[0].line, 1);
});

test("meldet einen zu neuen Node-Major", () => {
  assert.deepEqual(reasonsOf([`FROM node:24-bookworm-slim@${DIGEST}`], { expectedNodeMajor: 22 }), ["node-drift"]);
});

test("meldet ein Node-Image ohne numerische Version", () => {
  assert.deepEqual(reasonsOf([`FROM node:lts-bookworm-slim@${DIGEST}`], { expectedNodeMajor: 22 }), ["node-tag"]);
});

test("prueft die Drift nicht, wenn engines.node fehlt", () => {
  assert.deepEqual(reasonsOf([`FROM node:20-bookworm-slim@${DIGEST}`], { expectedNodeMajor: null }), []);
});

test("prueft fremde Images nicht gegen die Node-Version", () => {
  assert.deepEqual(reasonsOf([`FROM python:3.12-slim@${DIGEST}`], { expectedNodeMajor: 22 }), []);
});

test("zaehlt externe, Stage- und scratch-Verweise", () => {
  const result = inspect(
    FILE,
    text(
      `FROM ${NODE} AS deps`,
      "FROM deps AS builder",
      `FROM --platform=linux/amd64 ${NODE} AS runner`,
      "FROM scratch",
    ),
  );
  assert.deepEqual(result.findings, []);
  assert.equal(result.external, 2);
  assert.equal(result.stage, 1);
  assert.equal(result.scratch, 1);
});

test("kommt mit Windows-Zeilenenden zurecht", () => {
  assert.deepEqual(inspect(FILE, text(`FROM ${NODE} AS deps`).replace(/\n/g, "\r\n")).findings, []);
});

test("liest den Mindest-Major aus engines.node", () => {
  assert.equal(parseEnginesMajor(">=22.5.0"), 22);
  assert.equal(parseEnginesMajor("^20.11.0 || >=22.0.0"), 20);
  assert.equal(parseEnginesMajor("24.x"), 24);
  assert.equal(parseEnginesMajor("22"), 22);
  assert.equal(parseEnginesMajor("lts"), null);
  assert.equal(parseEnginesMajor(undefined), null);
});

test("liest den Major aus einem Image-Tag", () => {
  assert.equal(tagMajor("22-bookworm-slim"), 22);
  assert.equal(tagMajor("22.11.0-bookworm-slim"), 22);
  assert.equal(tagMajor("22"), 22);
  assert.equal(tagMajor("lts-bookworm-slim"), null);
  assert.equal(tagMajor("latest"), null);
});

test("dieses Repository pinnt alle Basis-Images und laeuft auf der Node-Version aus engines.node", async () => {
  const { findings: found, files, external, expectedNodeMajor, engines } = await audit();
  assert.deepEqual(found, []);
  assert.ok(files.length > 0, "keine Dockerfiles gefunden");
  assert.ok(external > 0, "keine externen FROM-Referenzen gefunden");
  assert.equal(engines, ">=22.5.0");
  assert.equal(expectedNodeMajor, 22);
});
