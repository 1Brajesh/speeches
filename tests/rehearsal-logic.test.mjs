import assert from "node:assert/strict";
import test from "node:test";
import {
  getRehearsalCues,
  getRehearsalTiming,
  parseRehearsalCue,
  parseRehearsalDurationValue,
  rehearsalSignaturesMatch,
} from "../assets/js/rehearsal-logic.js";

test("duration directives accept seconds, minutes, and clock values", () => {
  assert.equal(parseRehearsalDurationValue("5s"), 5);
  assert.equal(parseRehearsalDurationValue("3.5 seconds"), 3.5);
  assert.equal(parseRehearsalDurationValue("1m"), 60);
  assert.equal(parseRehearsalDurationValue("1:30"), 90);
  assert.equal(parseRehearsalDurationValue("0s"), null);
  assert.equal(parseRehearsalDurationValue("eventually"), null);
});

test("cue parsing strips valid trailing timing directives only", () => {
  assert.deepEqual(parseRehearsalCue("Opening beat //5s"), {
    rawText: "Opening beat //5s",
    text: "Opening beat",
    durationSeconds: 5,
    hasCustomDuration: true,
  });

  assert.deepEqual(parseRehearsalCue("Keep the literal marker //later"), {
    rawText: "Keep the literal marker //later",
    text: "Keep the literal marker //later",
    durationSeconds: null,
    hasCustomDuration: false,
  });
});

test("brace groups become one cue card with display lines and optional group duration", () => {
  const cues = getRehearsalCues([
    "Intro",
    "{",
    "Story setup",
    "Specific image",
    "} //45s",
    "Close //10s",
  ]);

  assert.equal(cues.length, 3);
  assert.equal(cues[0].text, "Intro");
  assert.equal(cues[1].isGroup, true);
  assert.deepEqual(cues[1].lines, ["Story setup", "Specific image"]);
  assert.equal(cues[1].text, "Story setup\nSpecific image");
  assert.equal(cues[1].durationSeconds, 45);
  assert.equal(cues[1].hasCustomDuration, true);
  assert.equal(cues[2].text, "Close");
  assert.equal(cues[2].durationSeconds, 10);
});

test("auto timing splits remaining target time around strict custom cards", () => {
  const timing = getRehearsalTiming(
    { estimatedMinutes: 1 },
    ["Opening //10s", "Middle", "Close"],
  );

  assert.equal(timing.cardCount, 3);
  assert.equal(timing.customDurationCount, 1);
  assert.equal(timing.timingSource, "custom");
  assert.deepEqual(timing.cardDurationsMs, [10000, 25000, 25000]);
  assert.equal(timing.defaultDurationSeconds, 25);
  assert.equal(timing.autoAvailable, true);
});

test("learned timing is used only when the cue signature still matches", () => {
  const version = {
    estimatedMinutes: 2,
    rehearsalTiming: {
      cardTexts: ["One", "Two"],
      durationsMs: [3000, 7000],
    },
  };

  const matching = getRehearsalTiming(version, ["One", "Two"]);
  assert.equal(matching.timingSource, "learned");
  assert.deepEqual(matching.cardDurationsMs, [3000, 7000]);
  assert.equal(matching.learnedDurationCount, 2);

  const stale = getRehearsalTiming(version, ["One changed", "Two"]);
  assert.equal(stale.timingSource, "auto");
  assert.deepEqual(stale.cardDurationsMs, [60000, 60000]);
  assert.equal(stale.learnedDurationCount, 0);
});

test("signature comparison is ordered and exact", () => {
  assert.equal(rehearsalSignaturesMatch(["a", "b"], ["a", "b"]), true);
  assert.equal(rehearsalSignaturesMatch(["a", "b"], ["b", "a"]), false);
  assert.equal(rehearsalSignaturesMatch(["a"], ["a", "b"]), false);
});
