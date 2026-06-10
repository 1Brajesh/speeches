const REHEARSAL_MIN_CARD_SECONDS = 1;

function cleanText(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim();
}

export function parseRehearsalDurationValue(value) {
  const text = cleanText(value).toLowerCase();
  const clockMatch = text.match(/^(\d+):([0-5]?\d(?:\.\d+)?)$/);

  if (clockMatch) {
    const minutes = Number.parseInt(clockMatch[1], 10);
    const seconds = Number.parseFloat(clockMatch[2]);
    const totalSeconds = (minutes * 60) + seconds;
    return totalSeconds > 0 ? totalSeconds : null;
  }

  const unitMatch = text.match(/^(\d+(?:\.\d+)?)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)$/);

  if (!unitMatch) {
    return null;
  }

  const amount = Number.parseFloat(unitMatch[1]);
  if (!(amount > 0)) {
    return null;
  }

  return unitMatch[2].startsWith("m") ? amount * 60 : amount;
}

export function parseRehearsalCue(rawBullet) {
  const rawText = cleanText(rawBullet);
  const directiveMatch = rawText.match(/^(.*?)\s*\/\/\s*([^/]+?)\s*$/);

  if (!directiveMatch) {
    return {
      rawText,
      text: rawText,
      durationSeconds: null,
      hasCustomDuration: false,
    };
  }

  const durationSeconds = parseRehearsalDurationValue(directiveMatch[2]);
  const cueText = cleanText(directiveMatch[1]);

  if (!durationSeconds || !cueText) {
    return {
      rawText,
      text: rawText,
      durationSeconds: null,
      hasCustomDuration: false,
    };
  }

  return {
    rawText,
    text: cueText,
    durationSeconds,
    hasCustomDuration: true,
  };
}

export function createRehearsalCard(cues, options = {}) {
  const { isGroup = false, groupDurationSeconds = null } = options;
  const cleanCues = (Array.isArray(cues) ? cues : []).filter((cue) => cue?.text);

  if (!cleanCues.length) {
    return null;
  }

  const everyCueTimed = cleanCues.every((cue) => cue.hasCustomDuration);
  const summedCueDurationSeconds = everyCueTimed
    ? cleanCues.reduce((total, cue) => total + (cue.durationSeconds || 0), 0)
    : null;
  const durationSeconds = groupDurationSeconds || summedCueDurationSeconds;

  return {
    rawText: cleanCues.map((cue) => cue.rawText).join("\n"),
    text: cleanCues.map((cue) => cue.text).join("\n"),
    lines: cleanCues.map((cue) => cue.text),
    durationSeconds,
    hasCustomDuration: durationSeconds > 0,
    isGroup,
  };
}

export function getRehearsalCues(bullets = []) {
  const lines = Array.isArray(bullets) ? bullets : [];
  const cards = [];
  let groupCues = null;
  let groupDurationSeconds = null;

  const pushGroup = () => {
    const card = createRehearsalCard(groupCues, {
      isGroup: true,
      groupDurationSeconds,
    });

    if (card) cards.push(card);
    groupCues = null;
    groupDurationSeconds = null;
  };

  lines.forEach((line) => {
    let text = cleanText(line);
    if (!text) return;

    const opensGroup = text.startsWith("{");
    if (opensGroup) {
      if (groupCues) pushGroup();
      groupCues = [];
      groupDurationSeconds = null;
      text = cleanText(text.slice(1));
    }

    const closingIndex = text.lastIndexOf("}");
    const closesGroup = closingIndex >= 0;
    let closingDurationSeconds = null;

    if (closesGroup) {
      const beforeBrace = cleanText(text.slice(0, closingIndex));
      const afterBrace = cleanText(text.slice(closingIndex + 1));
      text = beforeBrace;

      if (afterBrace.startsWith("//")) {
        closingDurationSeconds = parseRehearsalDurationValue(afterBrace.slice(2));
      }
    }

    if (groupCues) {
      if (text) groupCues.push(parseRehearsalCue(text));
      if (closingDurationSeconds) groupDurationSeconds = closingDurationSeconds;
      if (closesGroup) pushGroup();
      return;
    }

    if (text) {
      const card = createRehearsalCard([parseRehearsalCue(text)]);
      if (card) cards.push(card);
    }
  });

  if (groupCues) pushGroup();

  return cards;
}

export function getRehearsalCardSignature(cues = []) {
  return cues.map((cue) => cue.text);
}

export function rehearsalSignaturesMatch(left = [], right = []) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }

  return left.every((value, index) => value === right[index]);
}

export function getLearnedRehearsalDurationsMs(version, signature) {
  const learned = version?.rehearsalTiming || {};
  const cardTexts = Array.isArray(learned.cardTexts) ? learned.cardTexts : [];
  const durationsMs = Array.isArray(learned.durationsMs) ? learned.durationsMs : [];

  if (!rehearsalSignaturesMatch(cardTexts, signature) || durationsMs.length !== signature.length) {
    return [];
  }

  const normalized = durationsMs.map((durationMs) => Math.max(REHEARSAL_MIN_CARD_SECONDS * 1000, Number(durationMs) || 0));
  return normalized.every((durationMs) => durationMs > 0) ? normalized : [];
}

export function getRehearsalTiming(version, bullets = version?.rehearsalBullets || []) {
  const cues = getRehearsalCues(bullets);
  const signature = getRehearsalCardSignature(cues);
  const learnedDurationsMs = getLearnedRehearsalDurationsMs(version, signature);
  const bulletCount = cues.length;
  const rawBulletCount = Array.isArray(bullets) ? bullets.length : 0;
  const minutes = Math.max(0, Number.parseInt(version?.estimatedMinutes || 0, 10) || 0);
  const totalSeconds = minutes * 60;
  const customDurationCount = cues.filter((cue) => cue.hasCustomDuration).length;
  const allCardsHaveCustomDurations = bulletCount > 0 && customDurationCount === bulletCount;
  const remainingCueCount = Math.max(0, bulletCount - customDurationCount);
  const customDurationSeconds = cues.reduce((total, cue) => total + (cue.durationSeconds || 0), 0);
  const remainingSeconds = Math.max(0, totalSeconds - customDurationSeconds);
  const defaultDurationSeconds = remainingCueCount > 0 && totalSeconds > 0
    ? Math.max(REHEARSAL_MIN_CARD_SECONDS, remainingSeconds / remainingCueCount)
    : 0;
  const cardDurationsMs = cues.map((cue) => {
    const durationSeconds = cue.durationSeconds || defaultDurationSeconds;
    return durationSeconds > 0 ? Math.max(REHEARSAL_MIN_CARD_SECONDS * 1000, durationSeconds * 1000) : 0;
  });
  const effectiveCardDurationsMs = learnedDurationsMs.length === bulletCount ? learnedDurationsMs : cardDurationsMs;
  const intervalMs = effectiveCardDurationsMs[0] || (bulletCount && totalSeconds > 0
    ? Math.max(REHEARSAL_MIN_CARD_SECONDS * 1000, (totalSeconds * 1000) / bulletCount)
    : 0);
  const timingSource = learnedDurationsMs.length === bulletCount
    ? "learned"
    : (customDurationCount ? "custom" : "auto");

  return {
    bulletCount,
    cardCount: bulletCount,
    rawBulletCount,
    cues,
    signature,
    minutes,
    totalSeconds,
    intervalMs,
    cardDurationsMs: effectiveCardDurationsMs,
    customDurationCount,
    learnedDurationCount: learnedDurationsMs.length,
    defaultDurationSeconds,
    timingSource,
    customDurationsExceedTarget: totalSeconds > 0 && customDurationSeconds > totalSeconds,
    autoAvailable: bulletCount > 0 && (learnedDurationsMs.length === bulletCount || allCardsHaveCustomDurations || minutes > 0),
  };
}
