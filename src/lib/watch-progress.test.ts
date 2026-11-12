import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FINISH_MARGIN_MS,
  MIN_RESUME_MS,
  parseProgressInput,
  isFinished,
  resumePosition,
  shouldRemember,
  toEntry,
} from "./watch-progress.ts";

const URL = "https://anbieter.example/vod/folge-1.mp4";

test("accepts a normal position", () => {
  const parsed = parseProgressInput({ url: URL, positionMs: 120_000, durationMs: 2_700_000 });
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value.url, URL);
  assert.equal(parsed.value.positionMs, 120_000);
  assert.equal(parsed.value.durationMs, 2_700_000);
});

test("trims the url and rejects other schemes", () => {
  const trimmed = parseProgressInput({ url: `  ${URL}  `, positionMs: 6_000, durationMs: 600_000 });
  assert.equal(trimmed.ok, true);
  if (trimmed.ok) assert.equal(trimmed.value.url, URL);

  for (const url of ["file:///sdcard/x.m3u", "javascript:alert(1)", "/local", ""]) {
    const parsed = parseProgressInput({ url, positionMs: 6_000, durationMs: 600_000 });
    assert.equal(parsed.ok, false, `accepted ${url}`);
  }
});

test("rejects missing, negative and fractional numbers", () => {
  for (const positionMs of [undefined, -1, 1.5, "abc", Number.NaN, Number.POSITIVE_INFINITY]) {
    const parsed = parseProgressInput({ url: URL, positionMs, durationMs: 600_000 });
    assert.equal(parsed.ok, false, `accepted ${String(positionMs)}`);
  }
});

test("rejects a missing or zero duration", () => {
  assert.equal(parseProgressInput({ url: URL, positionMs: 6_000 }).ok, false);
  assert.equal(parseProgressInput({ url: URL, positionMs: 6_000, durationMs: 0 }).ok, false);
});

test("rejects a position beyond the end of the title", () => {
  const parsed = parseProgressInput({ url: URL, positionMs: 900_000, durationMs: 600_000 });
  assert.equal(parsed.ok, false);
});

test("clamps a position inside the tolerated slack", () => {
  const parsed = parseProgressInput({ url: URL, positionMs: 620_000, durationMs: 600_000 });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.positionMs, 600_000);
});

test("accepts numeric strings from older builds", () => {
  const parsed = parseProgressInput({ url: URL, positionMs: "61000", durationMs: "2700000" });
  assert.equal(parsed.ok, true);
  if (parsed.ok) assert.equal(parsed.value.positionMs, 61_000);
});

test("a finished title is not resumable", () => {
  assert.equal(isFinished(2_700_000, 2_700_000), true);
  assert.equal(isFinished(2_700_000 - FINISH_MARGIN_MS, 2_700_000), true);
  assert.equal(isFinished(2_700_000 - FINISH_MARGIN_MS - 1, 2_700_000), false);
  assert.equal(isFinished(5_000, 0), false);
});

test("remembers only positions worth resuming", () => {
  const value = (positionMs: number, durationMs = 2_700_000) => ({ url: URL, positionMs, durationMs });
  assert.equal(shouldRemember(value(MIN_RESUME_MS)), true);
  assert.equal(shouldRemember(value(MIN_RESUME_MS - 1)), false);
  assert.equal(shouldRemember(value(2_700_000)), false);
});

test("the later position wins and offline progress is kept", () => {
  assert.equal(resumePosition(0, 90_000), 90_000);
  assert.equal(resumePosition(120_000, 90_000), 120_000);
  assert.equal(resumePosition(120_000, null), 120_000);
  assert.equal(resumePosition(120_000, undefined), 120_000);
  assert.equal(resumePosition(0, 0), 0);
  assert.equal(resumePosition(Number.NaN, -5), 0);
});

test("maps a database row to the api entry", () => {
  assert.deepEqual(
    toEntry({
      media_url: URL,
      position_ms: 1_500,
      duration_ms: 90_000,
      updated_at: "2026-11-12T10:00:00.000Z",
    }),
    {
      url: URL,
      positionMs: 1_500,
      durationMs: 90_000,
      updatedAt: "2026-11-12T10:00:00.000Z",
    },
  );
});
