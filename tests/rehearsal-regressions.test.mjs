import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import test from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../assets/js/brajesh-speeches.js", import.meta.url), "utf8");
const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");

function cssRule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = html.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, "m"));
  assert.ok(match, `Missing CSS rule: ${selector}`);
  return match[1];
}

test("index cache-bust points at an existing speeches module and README matches it", () => {
  const scriptMatch = html.match(/<script type="module" src="\.\/([^"]+brajesh-speeches\.js\?v=(\d+[a-z]))"><\/script>/);
  assert.ok(scriptMatch, "index.html should load the cache-busted speeches module");

  const [assetPath] = scriptMatch[1].split("?");
  assert.ok(existsSync(new URL(`../${assetPath}`, import.meta.url)), `Missing script asset: ${assetPath}`);
  assert.ok(readme.includes(`./${scriptMatch[1]}`), "README cache note should match index.html");
});

test("normal fullscreen cue playback anchors cues below the timer row", () => {
  const stageRule = cssRule('.fullscreen-body:not([data-intro-active="true"]):not([data-review-active="true"]) .fullscreen-stage');
  assert.match(stageRule, /grid-template-rows:\s*auto minmax\(0,\s*1fr\);/);
  assert.match(stageRule, /place-items:\s*stretch;/);

  const headRule = cssRule('.fullscreen-body:not([data-intro-active="true"]):not([data-review-active="true"]) .fullscreen-stage-head');
  assert.match(headRule, /position:\s*static;/);
  assert.match(headRule, /width:\s*100%;/);

  const bulletRule = cssRule('.fullscreen-body:not([data-intro-active="true"]):not([data-review-active="true"]) .fullscreen-bullet');
  assert.match(bulletRule, /margin-top:\s*28px;/);
  assert.match(bulletRule, /transform:\s*none;/);
  assert.match(bulletRule, /white-space:\s*normal;/);
  assert.doesNotMatch(bulletRule, /translateY\(/);
});

test("fullscreen cue fit subtracts timer row and cue gap before sizing text", () => {
  assert.match(appJs, /const cueGap = Number\.parseFloat\(bulletStyle\.marginTop\) \|\| 0;/);
  assert.match(appJs, /const stageHead = normalCue \? stage\.querySelector\("\.fullscreen-stage-head"\) : null;/);
  assert.match(appJs, /const reservedHeight = stageHead \? stageHead\.offsetHeight \+ cueGap : 0;/);
  assert.match(appJs, /stage\.clientHeight - paddingY - reservedHeight/);
});

test("fullscreen rehearsal supports remote keyboard, wheel, and scroll fallback navigation", () => {
  assert.match(appJs, /REHEARSAL_REMOTE_ADVANCE_THROTTLE_MS = 450/);
  assert.match(appJs, /event\.key === "ArrowDown"/);
  assert.match(appJs, /event\.key === "ArrowUp"/);
  assert.match(appJs, /function handleFullscreenRehearsalWheel\(event\)/);
  assert.match(appJs, /addEventListener\("wheel", handleFullscreenRehearsalWheel, \{ passive: false \}\)/);
  assert.match(appJs, /function handleFullscreenRehearsalScrollFallback\(\)/);
  assert.match(appJs, /window\.addEventListener\("scroll", handleFullscreenRehearsalScrollFallback, true\)/);
  assert.match(appJs, /restoreRehearsalScrollAnchor\(\{ returnToOriginal: true \}\)/);
});
