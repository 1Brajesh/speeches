import {
  createBrajeshClient,
  requireBrajeshAdmin,
  sendBrajeshMagicLink,
  signOutBrajesh,
} from "./brajesh-auth.js";

const db = createBrajeshClient();
const USER_SETTINGS_TABLE = "brajesh_speech_user_settings";
const SCRIPT_TEXT_SIZE_MIN = 16;
const SCRIPT_TEXT_SIZE_MAX = 28;
const SCRIPT_TEXT_SIZE_DEFAULT = 25;
const SCRIPT_LINE_HEIGHT_MIN = 1.2;
const SCRIPT_LINE_HEIGHT_MAX = 2.2;
const SCRIPT_LINE_HEIGHT_STEP = 0.02;
const SCRIPT_LINE_HEIGHT_DEFAULT = 1.4;
const SCRIPT_PARAGRAPH_SPACING_MIN = 0.6;
const SCRIPT_PARAGRAPH_SPACING_MAX = 2.6;
const SCRIPT_PARAGRAPH_SPACING_STEP = 0.05;
const SCRIPT_PARAGRAPH_SPACING_DEFAULT = 1.2;
const REHEARSAL_MIN_CARD_SECONDS = 1;
const REHEARSAL_TIMER_TICK_MS = 250;
const REHEARSAL_INTRO_DURATION_MS = 1600;

const state = {
  user: null,
  ideas: [],
  speeches: [],
  playbookEntries: [],
  workspaceView: "speeches",
  ideaSearch: "",
  search: "",
  speechSearchResultQuery: "",
  speechSearchIds: null,
  speechSearchLoading: false,
  speechSearchError: "",
  playbookSearch: "",
  ideaFilter: "all",
  filter: "all",
  playbookFilter: "all",
  selectedIdeaId: null,
  selectedSpeechId: null,
  selectedVersionId: null,
  selectedDeliveryId: null,
  selectedPlaybookId: null,
  versionCompareOpen: false,
  tab: "overview",
  rehearsal: {
    speechId: null,
    versionId: null,
    index: 0,
    mode: "auto",
    nextAdvanceAt: 0,
    startedAt: 0,
    cardStartedAt: 0,
    introEndsAt: 0,
  },
  preferences: createDefaultPreferences(),
  settings: {
    loaded: false,
    saving: false,
    error: "",
    message: "Reading settings use account defaults.",
    tone: "",
  },
  panels: {
    "rehearsal-bullets": false,
  },
  editor: {
    open: false,
    kind: null,
    intent: null,
    speechId: null,
    versionId: null,
    deliveryId: null,
    ideaId: null,
    playbookId: null,
    statusPreset: "draft",
    sourceVersionId: null,
    sourceIdeaId: null,
    entryPoint: null,
  },
};
let pageLoadPromise = null;
let pageReloadQueued = false;
let editorBusy = false;
let ideaDeleteBusy = false;
let speechDeleteBusy = false;
let versionDeleteBusy = false;
let playbookDeleteBusy = false;
const speechDetailPromises = new Map();
let speechSearchTimer = null;
let speechSearchRequestToken = 0;
let rehearsalTickTimer = null;
let settingsSaveTimer = null;
let settingsSaveBusy = false;
let settingsSaveQueued = false;

const elements = {
  pageStatus: document.querySelector("#pageStatus"),
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  loginLogoutButton: document.querySelector("#loginLogoutButton"),
  sessionHint: document.querySelector("#sessionHint"),
  logoutButton: document.querySelector("#logoutButton"),
  adminIdentity: document.querySelector("#adminIdentity"),
  workspaceToggleButton: document.querySelector("#workspaceToggleButton"),
  settingsButton: document.querySelector("#settingsButton"),
  appShell: document.querySelector("#appShell"),
  libraryEyebrow: document.querySelector("#libraryEyebrow"),
  libraryTitle: document.querySelector("#libraryTitle"),
  searchInput: document.querySelector("#searchInput"),
  filterBar: document.querySelector("#filterBar"),
  totalCount: document.querySelector("#totalCount"),
  draftCount: document.querySelector("#draftCount"),
  deliveredCount: document.querySelector("#deliveredCount"),
  libraryStatus: document.querySelector("#libraryStatus"),
  speechList: document.querySelector("#speechList"),
  documentShell: document.querySelector("#documentShell"),
  speechMode: document.querySelector("#speechMode"),
  speechTitle: document.querySelector("#speechTitle"),
  speechStatusChip: document.querySelector("#speechStatusChip"),
  speechGoalChip: document.querySelector("#speechGoalChip"),
  speechCountChip: document.querySelector("#speechCountChip"),
  speechIdea: document.querySelector("#speechIdea"),
  speechTags: document.querySelector("#speechTags"),
  detailActionRow: document.querySelector("#detailActionRow"),
  focusCard: document.querySelector("#focusCard"),
  tabBar: document.querySelector("#tabBar"),
  tabContent: document.querySelector("#tabContent"),
  newIdeaButton: document.querySelector("#newIdeaButton"),
  newSpeechButton: document.querySelector("#newSpeechButton"),
  newPlaybookButton: document.querySelector("#newPlaybookButton"),
  editorShell: document.querySelector("#editorShell"),
  editorBackdrop: document.querySelector("#editorBackdrop"),
  editorModeLabel: document.querySelector("#editorModeLabel"),
  editorStatus: document.querySelector("#editorStatus"),
  editorTitle: document.querySelector("#editorTitle"),
  editorContextNote: document.querySelector("#editorContextNote"),
  editorForm: document.querySelector("#editorForm"),
  editorFields: document.querySelector("#editorFields"),
  editorFooterNote: document.querySelector("#editorFooterNote"),
  deleteEditorButton: document.querySelector("#deleteEditorButton"),
  copyEditorButton: document.querySelector("#copyEditorButton"),
  closeEditorButton: document.querySelector("#closeEditorButton"),
  cancelEditorButton: document.querySelector("#cancelEditorButton"),
  saveEditorButton: document.querySelector("#saveEditorButton"),
  fullscreenRehearsal: document.querySelector("#fullscreenRehearsal"),
  fullscreenBody: document.querySelector("#fullscreenBody"),
  fullscreenModeToggle: document.querySelector("#fullscreenModeToggle"),
  fullscreenCardTimer: document.querySelector("#fullscreenCardTimer"),
  fullscreenElapsedTimer: document.querySelector("#fullscreenElapsedTimer"),
  fullscreenBullet: document.querySelector("#fullscreenBullet"),
  fullscreenProgress: document.querySelector("#fullscreenProgress"),
  prevBulletButton: document.querySelector("#prevBulletButton"),
  nextBulletButton: document.querySelector("#nextBulletButton"),
  exitFullscreenButton: document.querySelector("#exitFullscreenButton"),
};

function setStatusElement(element, text, tone = "") {
  if (!element) return;
  element.textContent = text;
  element.dataset.tone = tone;
}

function setPageStatus(text, tone = "") {
  setStatusElement(elements.pageStatus, text, tone);
}

function reportEditorError(message) {
  if (elements.editorShell.hidden) {
    setPageStatus(message, "error");
    return;
  }

  setEditorStatus(message, "error");
}

function describeLoadError(error) {
  const message = String(error?.message || "").trim();

  if (
    message.includes("brajesh_speech_ideas")
    || message.includes("brajesh_speech_idea")
    || message.includes("brajesh_speeches")
    || message.includes("brajesh_speech_versions")
    || message.includes("brajesh_speech_runs")
    || message.includes("brajesh_speech_playbook")
    || message.toLowerCase().includes("relation")
  ) {
    return "The speeches database schema is not installed yet.";
  }

  return message || "Could not load speeches.";
}

function setLoginBusy(isBusy) {
  const submitButton = elements.loginForm.querySelector("button[type='submit']");
  elements.loginForm.elements.email.disabled = isBusy;
  elements.loginLogoutButton.disabled = isBusy;
  submitButton.disabled = isBusy;
  submitButton.textContent = isBusy ? "Sending Link..." : "Send Magic Link";
}

function updateIdentityUI() {
  elements.adminIdentity.textContent = state.user?.email || "";

  if (state.user?.email) {
    elements.sessionHint.textContent = `Signed in as ${state.user.email}. Use a different email if needed.`;
    elements.loginLogoutButton.hidden = false;
    return;
  }

  elements.sessionHint.textContent = "Use your approved admin email. A sign-in link will be emailed to you.";
  elements.loginLogoutButton.hidden = true;
}

function showLogin() {
  elements.loginPanel.hidden = false;
  elements.appShell.hidden = true;
  elements.workspaceToggleButton.hidden = true;
  elements.settingsButton.hidden = true;
  elements.newIdeaButton.hidden = true;
  elements.newSpeechButton.hidden = true;
  elements.newPlaybookButton.hidden = true;
  elements.logoutButton.hidden = !state.user;
  closeEditor();
  closeRehearsal();
}

function showApp() {
  elements.loginPanel.hidden = true;
  elements.appShell.hidden = false;
  elements.workspaceToggleButton.hidden = false;
  elements.settingsButton.hidden = false;
  elements.logoutButton.hidden = false;
}

function clearAuthHash() {
  if (!window.location.hash) return;

  const hash = window.location.hash.slice(1);
  const params = new URLSearchParams(hash);

  if (params.has("access_token") || params.has("refresh_token") || params.has("error_description")) {
    window.history.replaceState({}, document.title, `${window.location.pathname}${window.location.search}`);
  }
}

function resetSpeechState() {
  state.ideas = [];
  state.speeches = [];
  state.playbookEntries = [];
  speechDetailPromises.clear();
  window.clearTimeout(speechSearchTimer);
  speechSearchTimer = null;
  window.clearTimeout(settingsSaveTimer);
  settingsSaveTimer = null;
  settingsSaveBusy = false;
  settingsSaveQueued = false;
  speechSearchRequestToken += 1;
  state.workspaceView = "speeches";
  state.search = "";
  state.speechSearchResultQuery = "";
  state.speechSearchIds = null;
  state.speechSearchLoading = false;
  state.speechSearchError = "";
  state.selectedIdeaId = null;
  state.selectedSpeechId = null;
  state.selectedVersionId = null;
  state.selectedDeliveryId = null;
  state.selectedPlaybookId = null;
  state.versionCompareOpen = false;
  state.rehearsal.speechId = null;
  state.rehearsal.versionId = null;
  state.rehearsal.index = 0;
  state.rehearsal.nextAdvanceAt = 0;
  state.rehearsal.startedAt = 0;
  state.rehearsal.cardStartedAt = 0;
  state.rehearsal.introEndsAt = 0;
  state.preferences = createDefaultPreferences();
  state.settings.loaded = false;
  state.settings.saving = false;
  state.settings.error = "";
  state.settings.message = "Reading settings use account defaults.";
  state.settings.tone = "";
  applyScriptTextSizePreference();
  applyScriptLineHeightPreference();
  applyScriptParagraphSpacingPreference();
  closeEditor();
  closeRehearsal();
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function displayText(value, fallback = "-") {
  const text = String(value ?? "").trim();
  return escapeHtml(text || fallback);
}

function renderTagChips(tags = []) {
  return tags.map((tag) => `<span class="tag-chip">${displayText(tag, "")}</span>`).join("");
}

function renderTextList(items = [], emptyText = "Nothing yet.") {
  if (!items.length) {
    return `<li>${escapeHtml(emptyText)}</li>`;
  }

  return items.map((item) => `<li>${displayText(item)}</li>`).join("");
}

function multilineText(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

function parseLineList(value) {
  return multilineText(value)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseTagList(value) {
  return String(value ?? "")
    .replace(/[<>]/g, "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function linesToText(lines) {
  return Array.isArray(lines) ? lines.join("\n") : "";
}

function slugify(value) {
  const slug = cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "speech";
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function createDefaultPreferences() {
  return {
    scriptTextSize: SCRIPT_TEXT_SIZE_DEFAULT,
    scriptLineHeight: SCRIPT_LINE_HEIGHT_DEFAULT,
    scriptParagraphSpacing: SCRIPT_PARAGRAPH_SPACING_DEFAULT,
  };
}

function clampScriptTextSize(value) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (Number.isNaN(parsed)) {
    return SCRIPT_TEXT_SIZE_DEFAULT;
  }

  return Math.min(SCRIPT_TEXT_SIZE_MAX, Math.max(SCRIPT_TEXT_SIZE_MIN, parsed));
}

function clampScriptLineHeight(value) {
  const parsed = Number.parseFloat(String(value || ""));

  if (Number.isNaN(parsed)) {
    return SCRIPT_LINE_HEIGHT_DEFAULT;
  }

  const clamped = Math.min(SCRIPT_LINE_HEIGHT_MAX, Math.max(SCRIPT_LINE_HEIGHT_MIN, parsed));
  return Math.round(clamped * 100) / 100;
}

function clampScriptParagraphSpacing(value) {
  const parsed = Number.parseFloat(String(value || ""));

  if (Number.isNaN(parsed)) {
    return SCRIPT_PARAGRAPH_SPACING_DEFAULT;
  }

  const clamped = Math.min(SCRIPT_PARAGRAPH_SPACING_MAX, Math.max(SCRIPT_PARAGRAPH_SPACING_MIN, parsed));
  return Math.round(clamped * 100) / 100;
}

function applyScriptTextSizePreference() {
  document.documentElement.style.setProperty("--script-text-size", `${state.preferences.scriptTextSize}px`);
}

function applyScriptLineHeightPreference() {
  document.documentElement.style.setProperty("--script-line-height", String(state.preferences.scriptLineHeight));
}

function applyScriptParagraphSpacingPreference() {
  document.documentElement.style.setProperty("--script-paragraph-gap", `${state.preferences.scriptParagraphSpacing}em`);
}

function applyAllScriptPreferences() {
  applyScriptTextSizePreference();
  applyScriptLineHeightPreference();
  applyScriptParagraphSpacingPreference();
}

function syncScriptTextSizeControls(root = document) {
  const value = String(state.preferences.scriptTextSize);
  const displayValue = `${value}px`;

  root.querySelectorAll("[data-script-text-size-input]").forEach((input) => {
    if (input.value !== value) {
      input.value = value;
    }
  });

  root.querySelectorAll("[data-script-text-size-value]").forEach((element) => {
    element.textContent = displayValue;
  });
}

function formatScriptLineHeightValue(value) {
  return `${Number(value).toFixed(2)}x`;
}

function syncScriptLineHeightControls(root = document) {
  const value = state.preferences.scriptLineHeight.toFixed(2);
  const displayValue = formatScriptLineHeightValue(state.preferences.scriptLineHeight);

  root.querySelectorAll("[data-script-line-height-input]").forEach((input) => {
    if (input.value !== value) {
      input.value = value;
    }
  });

  root.querySelectorAll("[data-script-line-height-value]").forEach((element) => {
    element.textContent = displayValue;
  });
}

function formatScriptParagraphSpacingValue(value) {
  return `${Number(value).toFixed(2)}x`;
}

function syncScriptParagraphSpacingControls(root = document) {
  const value = state.preferences.scriptParagraphSpacing.toFixed(2);
  const displayValue = formatScriptParagraphSpacingValue(state.preferences.scriptParagraphSpacing);

  root.querySelectorAll("[data-script-paragraph-spacing-input]").forEach((input) => {
    if (input.value !== value) {
      input.value = value;
    }
  });

  root.querySelectorAll("[data-script-paragraph-spacing-value]").forEach((element) => {
    element.textContent = displayValue;
  });
}

function syncAllScriptPreferenceControls(root = document) {
  syncScriptTextSizeControls(root);
  syncScriptLineHeightControls(root);
  syncScriptParagraphSpacingControls(root);
}

function syncSettingsStatus(root = document) {
  root.querySelectorAll("[data-settings-status]").forEach((element) => {
    element.textContent = state.settings.message;
    element.dataset.tone = state.settings.tone;
  });
}

function setSettingsState(patch = {}) {
  Object.assign(state.settings, patch);
  syncSettingsStatus();
}

function settingsPayload() {
  return {
    user_id: state.user?.id || "",
    script_text_size: state.preferences.scriptTextSize,
    script_line_height: state.preferences.scriptLineHeight,
    script_paragraph_spacing: state.preferences.scriptParagraphSpacing,
  };
}

async function loadUserSettings() {
  if (!state.user?.id) {
    state.preferences = createDefaultPreferences();
    applyAllScriptPreferences();
    setSettingsState({
      loaded: false,
      saving: false,
      error: "",
      message: "Reading settings use account defaults.",
      tone: "",
    });
    return;
  }

  const { data, error } = await db
    .from(USER_SETTINGS_TABLE)
    .select("script_text_size, script_line_height, script_paragraph_spacing")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    state.preferences = createDefaultPreferences();
    applyAllScriptPreferences();
    setSettingsState({
      loaded: true,
      saving: false,
      error: error.message || "Could not load reading settings.",
      message: error.message || "Could not load reading settings. Using defaults for now.",
      tone: "error",
    });
    return;
  }

  state.preferences = {
    scriptTextSize: clampScriptTextSize(data?.script_text_size),
    scriptLineHeight: clampScriptLineHeight(data?.script_line_height),
    scriptParagraphSpacing: clampScriptParagraphSpacing(data?.script_paragraph_spacing),
  };
  applyAllScriptPreferences();
  setSettingsState({
    loaded: true,
    saving: false,
    error: "",
    message: data
      ? "Reading settings loaded from your account."
      : "Using account defaults. Changes here save to your account automatically.",
    tone: "",
  });
}

function queueUserSettingsSave() {
  if (!state.user?.id) {
    setSettingsState({
      loaded: false,
      saving: false,
      error: "",
      message: "Sign in to save reading settings to your account.",
      tone: "warn",
    });
    return;
  }

  window.clearTimeout(settingsSaveTimer);
  setSettingsState({
    loaded: true,
    saving: true,
    error: "",
    message: "Saving reading settings to your account...",
    tone: "ok",
  });

  settingsSaveTimer = window.setTimeout(() => {
    settingsSaveTimer = null;
    void persistUserSettings();
  }, 320);
}

async function persistUserSettings() {
  if (!state.user?.id) {
    return;
  }

  if (settingsSaveBusy) {
    settingsSaveQueued = true;
    return;
  }

  settingsSaveBusy = true;

  try {
    const { error } = await db
      .from(USER_SETTINGS_TABLE)
      .upsert(settingsPayload(), { onConflict: "user_id" });

    if (error) {
      throw error;
    }

    setSettingsState({
      loaded: true,
      saving: false,
      error: "",
      message: "Reading settings saved to your account.",
      tone: "ok",
    });
  } catch (error) {
    setSettingsState({
      loaded: true,
      saving: false,
      error: error.message || "Could not save reading settings.",
      message: error.message || "Could not save reading settings.",
      tone: "error",
    });
  } finally {
    settingsSaveBusy = false;

    if (settingsSaveQueued) {
      settingsSaveQueued = false;
      void persistUserSettings();
    }
  }
}

function setScriptTextSize(value) {
  const nextValue = clampScriptTextSize(value);
  const preserveScrollContainer = elements.editorShell.dataset.layout === "studio"
    ? elements.editorFields
    : null;
  state.preferences.scriptTextSize = nextValue;
  applyScriptTextSizePreference();
  syncScriptTextSizeControls();
  if (state.workspaceView === "settings") {
    renderCounts();
  }
  queueUserSettingsSave();
  scheduleAutoSizeRichTextareas(elements.editorShell, { preserveScrollContainer });
}

function setScriptLineHeight(value) {
  const nextValue = clampScriptLineHeight(value);
  const preserveScrollContainer = elements.editorShell.dataset.layout === "studio"
    ? elements.editorFields
    : null;
  state.preferences.scriptLineHeight = nextValue;
  applyScriptLineHeightPreference();
  syncScriptLineHeightControls();
  if (state.workspaceView === "settings") {
    renderCounts();
  }
  queueUserSettingsSave();
  scheduleAutoSizeRichTextareas(elements.editorShell, { preserveScrollContainer });
}

function setScriptParagraphSpacing(value) {
  const nextValue = clampScriptParagraphSpacing(value);
  state.preferences.scriptParagraphSpacing = nextValue;
  applyScriptParagraphSpacingPreference();
  syncScriptParagraphSpacingControls();
  if (state.workspaceView === "settings") {
    renderCounts();
  }
  queueUserSettingsSave();
}

function isPanelOpen(key) {
  return Boolean(state.panels[key]);
}

function autoSizeRichTextarea(textarea, options = {}) {
  const { allowShrink = true } = options;

  if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset.rich !== "true") {
    return;
  }

  const minHeight = Number.parseFloat(window.getComputedStyle(textarea).minHeight) || 0;
  const currentHeight = Number.parseFloat(textarea.style.height) || textarea.getBoundingClientRect().height || 0;

  if (allowShrink) {
    textarea.style.height = "auto";
  }

  const nextHeight = Math.max(minHeight, textarea.scrollHeight);
  if (!allowShrink && nextHeight <= currentHeight + 1) {
    return;
  }

  textarea.style.height = `${nextHeight}px`;
}

function autoSizeRichTextareas(root = document) {
  root.querySelectorAll("textarea[data-rich='true']").forEach((textarea) => {
    autoSizeRichTextarea(textarea);
  });
}

function scheduleAutoSizeRichTextareas(root = document, options = {}) {
  const { preserveScrollContainer = null } = options;
  window.requestAnimationFrame(() => {
    const scrollTop = preserveScrollContainer?.scrollTop ?? 0;
    const scrollLeft = preserveScrollContainer?.scrollLeft ?? 0;
    autoSizeRichTextareas(root);

    if (preserveScrollContainer) {
      preserveScrollContainer.scrollTop = scrollTop;
      preserveScrollContainer.scrollLeft = scrollLeft;
    }
  });
}

function parseMinutes(value) {
  const parsed = Number.parseInt(cleanText(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function formatDurationLabel(totalSeconds) {
  const safeSeconds = Math.max(0, Math.round(Number(totalSeconds) || 0));

  if (!safeSeconds) {
    return "0s";
  }

  if (safeSeconds < 60) {
    return `${safeSeconds}s`;
  }

  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
}

function formatMinuteLabel(minutes) {
  const safeMinutes = Math.max(0, Number.parseInt(minutes, 10) || 0);
  return `${safeMinutes} ${safeMinutes === 1 ? "min" : "mins"}`;
}

function formatElapsedClock(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function formatSecondsPerCardLabel(totalSeconds) {
  const safeSeconds = Math.max(1, Math.round(Number(totalSeconds) || 0));

  if (safeSeconds < 60) {
    return `${safeSeconds} ${safeSeconds === 1 ? "second" : "seconds"} per card`;
  }

  return `${formatDurationLabel(safeSeconds)} per card`;
}

function getRehearsalIntroLabel(timing) {
  if (timing.customDurationCount) {
    return "Variable timing";
  }

  return formatSecondsPerCardLabel(timing.intervalMs / 1000);
}

function formatSecondsValue(totalSeconds, options = {}) {
  const { precision = 0 } = options;
  const safeSeconds = Math.max(0, Number(totalSeconds) || 0);
  const factor = 10 ** precision;
  const value = precision > 0
    ? Math.floor(safeSeconds * factor) / factor
    : Math.floor(safeSeconds);

  return value.toFixed(precision).replace(/\.?0+$/, "");
}

function parseRehearsalDurationValue(value) {
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

function parseRehearsalCue(rawBullet) {
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

function getRehearsalCues(bullets = []) {
  return (Array.isArray(bullets) ? bullets : []).map(parseRehearsalCue);
}

function getRehearsalTiming(version, bullets = version?.rehearsalBullets || []) {
  const cues = getRehearsalCues(bullets);
  const bulletCount = cues.length;
  const minutes = Math.max(0, Number.parseInt(version?.estimatedMinutes || 0, 10) || 0);
  const totalSeconds = minutes * 60;
  const customDurationCount = cues.filter((cue) => cue.hasCustomDuration).length;
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
  const intervalMs = cardDurationsMs[0] || (bulletCount && totalSeconds > 0
    ? Math.max(REHEARSAL_MIN_CARD_SECONDS * 1000, (totalSeconds * 1000) / bulletCount)
    : 0);

  return {
    bulletCount,
    cues,
    minutes,
    totalSeconds,
    intervalMs,
    cardDurationsMs,
    customDurationCount,
    defaultDurationSeconds,
    customDurationsExceedTarget: totalSeconds > 0 && customDurationSeconds > totalSeconds,
    autoAvailable: bulletCount > 0 && minutes > 0,
  };
}

function getRehearsalCardDurationMs(timing, index = state.rehearsal.index) {
  return timing.cardDurationsMs?.[index] || timing.intervalMs || 0;
}

function getEffectiveRehearsalMode(timing) {
  return state.rehearsal.mode === "auto" && timing.autoAvailable ? "auto" : "manual";
}

function renderRehearsalModeToggle(timing, options = {}) {
  const { ariaLabel = "Rehearsal pacing mode", extraClassName = "" } = options;
  const mode = getEffectiveRehearsalMode(timing);
  const className = ["pill-row", "rehearsal-mode-toggle", extraClassName].filter(Boolean).join(" ");

  return `
    <div class="${className}" role="group" aria-label="${escapeHtml(ariaLabel)}">
      <button class="tab-pill" type="button" data-rehearsal-mode="manual" aria-pressed="${mode === "manual"}">Manual</button>
      <button class="tab-pill" type="button" data-rehearsal-mode="auto" aria-pressed="${mode === "auto"}" ${timing.autoAvailable ? "" : "disabled"}>Auto</button>
    </div>
  `;
}

function getRehearsalTimingSummary(timing) {
  if (!timing.bulletCount) {
    return "Add rehearsal bullets to use cue cards.";
  }

  if (!timing.autoAvailable) {
    return "Manual pacing is active. Set Target Minutes above 0 to enable auto-advance.";
  }

  const cadence = formatDurationLabel(timing.intervalMs / 1000);
  const bulletLabel = formatCountLabel(timing.bulletCount, "bullet");
  const targetLabel = formatMinuteLabel(timing.minutes);
  const customLabel = formatCountLabel(timing.customDurationCount, "timed bullet");

  if (timing.customDurationsExceedTarget) {
    return `Timed bullets exceed the ${targetLabel} target. Custom timings stay strict; untimed cards use the minimum ${REHEARSAL_MIN_CARD_SECONDS}s pace.`;
  }

  if (timing.customDurationCount) {
    return `Custom timings are active for ${customLabel}. Untimed cards split the remaining time from a ${targetLabel} target.`;
  }

  if (getEffectiveRehearsalMode(timing) === "auto") {
    return `Auto pacing is selected. Cards will advance every ${cadence} across ${bulletLabel} from a ${targetLabel} target.`;
  }

  return `Manual pacing is active. Auto would advance every ${cadence} across ${bulletLabel} from a ${targetLabel} target.`;
}

function isRehearsalIntroActive() {
  return state.rehearsal.introEndsAt > Date.now();
}

function getRehearsalCardTimerLabel(timing) {
  if (getEffectiveRehearsalMode(timing) !== "auto" || !timing.autoAvailable) {
    return "Manual";
  }

  const durationSeconds = getRehearsalCardDurationMs(timing) / 1000;
  const allowedHasFraction = !Number.isInteger(durationSeconds);
  const precision = allowedHasFraction ? 1 : 0;
  const allowedLabel = formatSecondsValue(durationSeconds, { precision: allowedHasFraction ? 2 : 0 });

  if (isRehearsalIntroActive()) {
    return `0 of ${allowedLabel}s`;
  }

  const elapsedCardSeconds = Math.max(0, (Date.now() - state.rehearsal.cardStartedAt) / 1000);
  const elapsedLabel = formatSecondsValue(Math.min(elapsedCardSeconds, durationSeconds), { precision });
  return `${elapsedLabel} of ${allowedLabel}s`;
}

function getRehearsalElapsedLabel() {
  if (!state.rehearsal.startedAt) {
    return "0:00";
  }

  const elapsedSeconds = (Date.now() - state.rehearsal.startedAt) / 1000;
  return formatElapsedClock(elapsedSeconds);
}

function clearRehearsalTickTimer() {
  window.clearInterval(rehearsalTickTimer);
  rehearsalTickTimer = null;
  state.rehearsal.nextAdvanceAt = 0;
  state.rehearsal.cardStartedAt = 0;
  state.rehearsal.introEndsAt = 0;
}

function syncRehearsalTickTimer(options = {}) {
  const { timing, reset = false } = options;
  const shouldRun = !elements.fullscreenRehearsal.hidden;

  if (!shouldRun) {
    clearRehearsalTickTimer();
    return;
  }

  const autoMode = getEffectiveRehearsalMode(timing) === "auto" && timing.autoAvailable;
  const hasNextCard = state.rehearsal.index < timing.bulletCount - 1;
  const introActive = isRehearsalIntroActive();

  if (autoMode && !introActive && (reset || !state.rehearsal.cardStartedAt)) {
    state.rehearsal.cardStartedAt = Date.now();
  } else if (!autoMode) {
    state.rehearsal.cardStartedAt = 0;
  }

  if (autoMode && !introActive && hasNextCard && (reset || !state.rehearsal.nextAdvanceAt)) {
    // Reset the next deadline when the user changes cards or mode so each card gets a full interval.
    state.rehearsal.nextAdvanceAt = state.rehearsal.cardStartedAt + getRehearsalCardDurationMs(timing);
  } else if (!autoMode || introActive || !hasNextCard) {
    state.rehearsal.nextAdvanceAt = 0;
  }

  if (!rehearsalTickTimer) {
    rehearsalTickTimer = window.setInterval(tickRehearsalTimer, REHEARSAL_TIMER_TICK_MS);
  }
}

function updateRehearsalCardTimers(timing) {
  elements.fullscreenCardTimer.textContent = getRehearsalCardTimerLabel(timing);
  elements.fullscreenElapsedTimer.textContent = getRehearsalElapsedLabel();
}

function tickRehearsalTimer() {
  if (elements.fullscreenRehearsal.hidden) {
    clearRehearsalTickTimer();
    return;
  }

  const { speech, version } = getRehearsalVersion();
  const bullets = version?.rehearsalBullets || [];
  const timing = getRehearsalTiming(version, bullets);

  if (!speech || !version) {
    clearRehearsalTickTimer();
    return;
  }

  if (state.rehearsal.introEndsAt && !isRehearsalIntroActive()) {
    state.rehearsal.introEndsAt = 0;
    state.rehearsal.startedAt = Date.now();
    state.rehearsal.cardStartedAt = 0;
    renderRehearsalScreen({ resetAutoTimer: true });
    return;
  }

  const autoMode = getEffectiveRehearsalMode(timing) === "auto" && timing.autoAvailable;
  const hasNextCard = state.rehearsal.index < bullets.length - 1;
  const introActive = isRehearsalIntroActive();

  if (introActive) {
    updateRehearsalCardTimers(timing);
    return;
  }

  if (!state.rehearsal.startedAt) {
    state.rehearsal.startedAt = Date.now();
  }

  if (autoMode && hasNextCard && !state.rehearsal.nextAdvanceAt) {
    if (!state.rehearsal.cardStartedAt) {
      state.rehearsal.cardStartedAt = Date.now();
    }
    state.rehearsal.nextAdvanceAt = state.rehearsal.cardStartedAt + getRehearsalCardDurationMs(timing);
  }

  if (autoMode && hasNextCard && Date.now() >= state.rehearsal.nextAdvanceAt) {
    state.rehearsal.index = Math.min(state.rehearsal.index + 1, bullets.length - 1);
    renderRehearsalScreen({ resetAutoTimer: true });
    return;
  }

  updateRehearsalCardTimers(timing);
}

function setRehearsalMode(mode, options = {}) {
  const nextMode = mode === "auto" ? "auto" : "manual";
  state.rehearsal.mode = nextMode;

  if (elements.fullscreenRehearsal.hidden) {
    clearRehearsalTickTimer();
    renderApp();
    return;
  }

  if (nextMode !== "auto") {
    state.rehearsal.introEndsAt = 0;
    if (!state.rehearsal.startedAt) {
      state.rehearsal.startedAt = Date.now();
    }
  }

  renderRehearsalScreen({ resetAutoTimer: options.resetTimer !== false });
}

function defaultVersionLabel(status) {
  return status === "idea" ? "Idea Note" : "Draft 1";
}

function createUniqueSpeechId(title) {
  const base = slugify(title);
  const ids = new Set(state.speeches.map((speech) => speech.id));
  let candidate = base;
  let counter = 2;

  while (ids.has(candidate)) {
    candidate = `${base}-${counter}`;
    counter += 1;
  }

  return candidate;
}

function createUniqueVersionId(speech) {
  let counter = speech.versions.length + 1;
  let candidate = `${speech.id}-v${counter}`;

  while (speech.versions.some((version) => version.id === candidate)) {
    counter += 1;
    candidate = `${speech.id}-v${counter}`;
  }

  return candidate;
}

function createUniqueDeliveryId(speech) {
  let counter = speech.deliveries.length + 1;
  let candidate = `${speech.id}-delivery-${counter}`;

  while (speech.deliveries.some((delivery) => delivery.id === candidate)) {
    counter += 1;
    candidate = `${speech.id}-delivery-${counter}`;
  }

  return candidate;
}

function parseDateOnlyValue(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;

  const date = new Date(`${normalizedValue.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimestampValue(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) return null;

  const date = normalizedValue.includes("T")
    ? new Date(normalizedValue)
    : new Date(`${normalizedValue}T12:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

function timestampMs(value) {
  return parseTimestampValue(value)?.getTime() || 0;
}

function ensureTextArray(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function clearSpeechSearchState() {
  window.clearTimeout(speechSearchTimer);
  speechSearchTimer = null;
  speechSearchRequestToken += 1;
  state.speechSearchResultQuery = "";
  state.speechSearchIds = null;
  state.speechSearchLoading = false;
  state.speechSearchError = "";
}

function createSpeechSearchText({ title = "", coreIdea = "", goal = "", tags = [], notes = "" }) {
  return [
    title,
    coreIdea,
    goal,
    Array.isArray(tags) ? tags.join(" ") : "",
    notes,
  ].join(" ").toLowerCase();
}

function mapSpeechSummaries(speechRows, versionRows, runRows) {
  const versionCounts = new Map();
  const runSummaries = new Map();

  (versionRows || []).forEach((row) => {
    const speechId = row.speech_id;
    versionCounts.set(speechId, (versionCounts.get(speechId) || 0) + 1);
  });

  (runRows || []).forEach((row) => {
    const speechId = row.speech_id;
    const existing = runSummaries.get(speechId) || {
      count: 0,
      latestDeliveryAt: "",
      latestDeliveryEventLevel: "",
      latestSortValue: 0,
    };
    const sortValue = timestampMs(row.delivered_at || row.created_at || "");

    existing.count += 1;

    if (!existing.latestDeliveryAt || sortValue >= existing.latestSortValue) {
      existing.latestDeliveryAt = row.delivered_at || "";
      existing.latestDeliveryEventLevel = row.event_level || "";
      existing.latestSortValue = sortValue;
    }

    runSummaries.set(speechId, existing);
  });

  const speeches = (speechRows || []).map((row) => ({
    id: row.id,
    title: row.title || "Untitled Speech",
    status: row.status || "draft",
    coreIdea: row.core_idea || "",
    goal: row.goal || "",
    tags: ensureTextArray(row.tags),
    notes: row.notes || "",
    activeVersionId: row.active_version_id || null,
    createdAt: row.created_at || "",
    updatedAt: row.updated_at || row.created_at || "",
    versionCount: versionCounts.get(row.id) || 0,
    deliveryCount: runSummaries.get(row.id)?.count || 0,
    latestDeliveryAt: runSummaries.get(row.id)?.latestDeliveryAt || "",
    latestDeliveryEventLevel: runSummaries.get(row.id)?.latestDeliveryEventLevel || "",
    searchText: createSpeechSearchText({
      title: row.title || "",
      coreIdea: row.core_idea || "",
      goal: row.goal || "",
      tags: ensureTextArray(row.tags),
      notes: row.notes || "",
    }),
    versions: [],
    deliveries: [],
    detailLoaded: false,
    detailLoading: false,
    detailError: "",
  }));

  return speeches.sort((a, b) => {
    const timeA = timestampMs(a.updatedAt || a.createdAt);
    const timeB = timestampMs(b.updatedAt || b.createdAt);
    return timeB - timeA;
  });
}

function buildSpeechVersions(versionRows) {
  const versions = (versionRows || []).map((row) => ({
    id: row.id,
    label: row.label || "Untitled Version",
    basedOn: row.based_on_version_id || null,
    estimatedMinutes: row.estimated_minutes || 0,
    updatedAt: row.updated_at || row.created_at || "",
    revisionNote: row.revision_note || "",
    speechBody: row.speech_body || "",
    rehearsalBullets: ensureTextArray(row.rehearsal_bullets),
  }));

  versions.sort((a, b) => timestampMs(a.updatedAt) - timestampMs(b.updatedAt));
  return versions;
}

function buildSpeechDeliveries(runRows) {
  return (runRows || []).map((row) => ({
    id: row.id,
    versionId: row.version_id || null,
    deliveredAt: row.delivered_at || "",
    location: row.location || "",
    city: row.city || "",
    program: row.program || "",
    eventLevel: row.event_level || "",
    speechStyle: row.speech_style || "",
    audience: row.audience || "",
    result: row.result || "",
    actualMinutes: row.actual_minutes || "-",
    feedback: {
      whatWorked: row.what_worked || "",
      whatMissed: row.what_missed || "",
      learnings: row.learnings || "",
      evaluatorNotes: ensureTextArray(row.evaluator_notes),
      nextActions: ensureTextArray(row.next_actions),
    },
  }));
}

function applySpeechDetail(speechId, versionRows, runRows) {
  const speech = getSpeechById(speechId);
  if (!speech) return null;

  speech.versions = buildSpeechVersions(versionRows);
  speech.deliveries = buildSpeechDeliveries(runRows);
  speech.versionCount = speech.versions.length;
  speech.deliveryCount = speech.deliveries.length;

  if (!speech.activeVersionId && speech.versions.length) {
    speech.activeVersionId = speech.versions[speech.versions.length - 1].id;
  }

  const latestDelivery = sortDeliveries(speech.deliveries)[0];
  speech.latestDeliveryAt = latestDelivery?.deliveredAt || "";
  speech.latestDeliveryEventLevel = latestDelivery?.eventLevel || "";
  speech.detailLoaded = true;
  speech.detailError = "";

  return speech;
}

async function loadSpeechDetail(speechId, options = {}) {
  const { force = false, renderPending = false, renderAfter = true } = options;
  const speech = getSpeechById(speechId);
  if (!speech) return null;

  if (speech.detailLoaded && !force) {
    return speech;
  }

  const existingPromise = speechDetailPromises.get(speechId);
  if (existingPromise && !force) {
    return existingPromise;
  }

  speech.detailLoading = true;
  speech.detailError = "";

  if (renderPending) {
    renderApp();
  }

  const promise = Promise.all([
    db
      .from("brajesh_speech_versions")
      .select("id, speech_id, based_on_version_id, label, estimated_minutes, revision_note, speech_body, rehearsal_bullets, created_at, updated_at")
      .eq("speech_id", speechId)
      .order("created_at", { ascending: true }),
    db
      .from("brajesh_speech_runs")
      .select("id, speech_id, version_id, delivered_at, location, city, program, event_level, speech_style, audience, result, actual_minutes, what_worked, what_missed, learnings, evaluator_notes, next_actions, created_at, updated_at")
      .eq("speech_id", speechId)
      .order("delivered_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]).then(([versionResult, runResult]) => {
    if (versionResult.error) throw versionResult.error;
    if (runResult.error) throw runResult.error;

    return applySpeechDetail(speechId, versionResult.data, runResult.data);
  }).catch((error) => {
    const currentSpeech = getSpeechById(speechId);
    if (currentSpeech) {
      currentSpeech.detailError = error.message || "Could not load this speech.";
    }
    setPageStatus(error.message || "Could not load that speech.", "error");
    throw error;
  }).finally(() => {
    const currentSpeech = getSpeechById(speechId);
    if (currentSpeech) {
      currentSpeech.detailLoading = false;
    }
    speechDetailPromises.delete(speechId);

    if (renderAfter) {
      renderApp();
    }
  });

  speechDetailPromises.set(speechId, promise);
  return promise;
}

async function loadSpeechSearchResults(query, options = {}) {
  const { renderPending = false, renderAfter = true } = options;
  const normalizedQuery = String(query || "").trim();

  if (!normalizedQuery) {
    clearSpeechSearchState();
    if (renderAfter) {
      renderApp();
    }
    return new Set();
  }

  const requestToken = ++speechSearchRequestToken;
  state.speechSearchLoading = true;
  state.speechSearchError = "";

  if (renderPending) {
    renderApp();
  }

  try {
    const { data, error } = await db.rpc("search_brajesh_speeches", {
      search_query: normalizedQuery,
    });

    if (error) throw error;

    if (requestToken !== speechSearchRequestToken) {
      return state.speechSearchIds;
    }

    state.speechSearchResultQuery = normalizedQuery.toLowerCase();
    state.speechSearchIds = new Set((data || []).map((row) => row.speech_id).filter(Boolean));
    state.speechSearchError = "";
    return state.speechSearchIds;
  } catch (error) {
    if (requestToken !== speechSearchRequestToken) {
      return state.speechSearchIds;
    }

    state.speechSearchResultQuery = "";
    state.speechSearchIds = null;
    state.speechSearchError = error.message || "Could not search all speeches.";
    return null;
  } finally {
    if (requestToken === speechSearchRequestToken) {
      state.speechSearchLoading = false;
      if (renderAfter) {
        renderApp();
      }
    }
  }
}

function queueSpeechSearch(query = state.search) {
  window.clearTimeout(speechSearchTimer);
  speechSearchTimer = null;

  const normalizedQuery = String(query || "").trim();
  if (!normalizedQuery) {
    clearSpeechSearchState();
    renderApp();
    return;
  }

  state.speechSearchLoading = true;
  state.speechSearchError = "";
  renderApp();

  speechSearchTimer = window.setTimeout(() => {
    speechSearchTimer = null;
    void loadSpeechSearchResults(normalizedQuery, { renderPending: false, renderAfter: true });
  }, 180);
}

function mapIdeaData(ideaRows) {
  return (ideaRows || [])
    .map((row) => ({
      id: row.id,
      title: row.title || "Untitled Idea",
      idea: row.idea || "",
      tags: ensureTextArray(row.tags),
      expandedSpeechId: row.expanded_speech_id || null,
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || row.created_at || "",
    }))
    .sort((a, b) => {
      if (Boolean(a.expandedSpeechId) !== Boolean(b.expandedSpeechId)) {
        return a.expandedSpeechId ? 1 : -1;
      }

      return timestampMs(b.updatedAt || b.createdAt) - timestampMs(a.updatedAt || a.createdAt);
    });
}

function mapPlaybookData(playbookRows) {
  return (playbookRows || [])
    .map((row) => ({
      id: row.id,
      title: row.title || "Untitled Principle",
      category: row.category || "",
      principle: row.principle || "",
      whyItWorks: row.why_it_works || "",
      tags: ensureTextArray(row.tags),
      pinned: Boolean(row.pinned),
      createdAt: row.created_at || "",
      updatedAt: row.updated_at || row.created_at || "",
    }))
    .sort((a, b) => {
      if (a.pinned !== b.pinned) {
        return a.pinned ? -1 : 1;
      }

      return timestampMs(b.updatedAt || b.createdAt) - timestampMs(a.updatedAt || a.createdAt);
    });
}

async function loadSpeeches(options = {}) {
  if (!options.silent) {
    setPageStatus("Loading speeches.");
  }

  const [ideaResult, speechResult, versionResult, runResult, playbookResult] = await Promise.all([
    db
      .from("brajesh_speech_ideas")
      .select("id, title, idea, tags, expanded_speech_id, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    db
      .from("brajesh_speeches")
      .select("id, title, status, goal, core_idea, tags, notes, active_version_id, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    db
      .from("brajesh_speech_versions")
      .select("id, speech_id")
      .order("created_at", { ascending: true }),
    db
      .from("brajesh_speech_runs")
      .select("id, speech_id, delivered_at, event_level, created_at")
      .order("delivered_at", { ascending: false })
      .order("created_at", { ascending: false }),
    db
      .from("brajesh_speech_playbook")
      .select("id, title, category, principle, why_it_works, tags, pinned, created_at, updated_at")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false }),
  ]);

  if (ideaResult.error) throw ideaResult.error;
  if (speechResult.error) throw speechResult.error;
  if (versionResult.error) throw versionResult.error;
  if (runResult.error) throw runResult.error;
  if (playbookResult.error) throw playbookResult.error;

  state.ideas = mapIdeaData(ideaResult.data);
  state.speeches = mapSpeechSummaries(speechResult.data, versionResult.data, runResult.data);
  state.playbookEntries = mapPlaybookData(playbookResult.data);

  if (state.workspaceView === "speeches") {
    if (state.search.trim()) {
      try {
        await loadSpeechSearchResults(state.search, { renderAfter: false });
      } catch {
        // Search can fall back to summary text if the RPC is unavailable.
      }
    } else {
      clearSpeechSearchState();
    }

    const selectedSpeech = ensureSelection();
    if (selectedSpeech) {
      try {
        await loadSpeechDetail(selectedSpeech.id, { renderAfter: false });
      } catch {
        // Keep the library usable even if the selected speech detail fails to load.
      }
    }
  }

  showApp();
  renderApp();

  if (!options.silent) {
    setPageStatus("");
  }
}

async function loadPage(options = {}) {
  try {
    if (!options.silent) {
      setPageStatus("Checking access.");
    }

    const { user, isAdmin } = await requireBrajeshAdmin(db);
    state.user = user;
    updateIdentityUI();

    if (!user) {
      resetSpeechState();
      renderApp();
      showLogin();
      if (!options.silent) {
        setPageStatus("Enter your email to receive a magic link.");
      }
      return;
    }

    if (!isAdmin) {
      resetSpeechState();
      renderApp();
      showLogin();
      setPageStatus(`${user.email} is signed in, but this email does not have speeches access.`, "error");
      return;
    }

    await loadUserSettings();
    await loadSpeeches(options);
  } catch (error) {
    resetSpeechState();
    renderApp();
    showLogin();
    setPageStatus(describeLoadError(error), "error");
  }
}

async function requestPageLoad(options = {}) {
  if (pageLoadPromise) {
    pageReloadQueued = true;
    return pageLoadPromise;
  }

  pageLoadPromise = loadPage(options).finally(async () => {
    pageLoadPromise = null;

    if (pageReloadQueued) {
      pageReloadQueued = false;
      await requestPageLoad({ silent: true });
    }
  });

  return pageLoadPromise;
}

async function handleSignOut(successMessage = "Signed out.") {
  let signOutFailed = false;

  try {
    await signOutBrajesh(db);
  } catch (error) {
    signOutFailed = true;
    setPageStatus(error.message || "Could not sign out.", "error");
  }

  if (signOutFailed) {
    return;
  }

  state.user = null;
  updateIdentityUI();
  resetSpeechState();
  renderApp();
  showLogin();
  setPageStatus(successMessage, "ok");
}

function titleCase(value) {
  return String(value || "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function statusLabel(status) {
  if (status === "rehearsal_ready") return "Rehearsal Ready";
  return titleCase(status);
}

function formatDate(value) {
  if (!value) return "Undated";

  const date = parseDateOnlyValue(value);
  if (!date) return String(value);

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "Unknown";

  const date = parseTimestampValue(value);
  if (!date) return String(value);

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function versionWordCount(version) {
  if (!version?.speechBody) return 0;
  return String(version.speechBody).trim().split(/\s+/).filter(Boolean).length;
}

function ideaWordCount(idea) {
  if (!idea?.idea) return 0;
  return String(idea.idea).trim().split(/\s+/).filter(Boolean).length;
}

function speechWordCount(speech) {
  return versionWordCount(getSelectedVersionForSpeech(speech));
}

function normalizeCompareText(value) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .trim();
}

function splitCompareSegments(text) {
  const normalized = normalizeCompareText(text);
  if (!normalized) {
    return [];
  }

  const paragraphs = normalized
    .split(/\n\s*\n+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (paragraphs.length > 1) {
    return paragraphs;
  }

  return normalized
    .split("\n")
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitDisplayParagraphs(text) {
  const normalized = normalizeCompareText(text);
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n\s*\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function diffCompareSegments(previousSegments, nextSegments) {
  const rowCount = previousSegments.length + 1;
  const columnCount = nextSegments.length + 1;
  const table = Array.from({ length: rowCount }, () => Array(columnCount).fill(0));

  for (let row = 1; row < rowCount; row += 1) {
    for (let column = 1; column < columnCount; column += 1) {
      if (previousSegments[row - 1] === nextSegments[column - 1]) {
        table[row][column] = table[row - 1][column - 1] + 1;
      } else {
        table[row][column] = Math.max(table[row - 1][column], table[row][column - 1]);
      }
    }
  }

  let row = previousSegments.length;
  let column = nextSegments.length;
  const operations = [];

  while (row > 0 && column > 0) {
    if (previousSegments[row - 1] === nextSegments[column - 1]) {
      operations.push({ type: "same", text: previousSegments[row - 1] });
      row -= 1;
      column -= 1;
      continue;
    }

    if (table[row - 1][column] >= table[row][column - 1]) {
      operations.push({ type: "remove", text: previousSegments[row - 1] });
      row -= 1;
      continue;
    }

    operations.push({ type: "add", text: nextSegments[column - 1] });
    column -= 1;
  }

  while (row > 0) {
    operations.push({ type: "remove", text: previousSegments[row - 1] });
    row -= 1;
  }

  while (column > 0) {
    operations.push({ type: "add", text: nextSegments[column - 1] });
    column -= 1;
  }

  operations.reverse();
  return operations;
}

function buildVersionScriptCompare(previousVersion, selectedVersion) {
  const previousSegments = splitCompareSegments(previousVersion?.speechBody);
  const selectedSegments = splitCompareSegments(selectedVersion?.speechBody);
  const operations = diffCompareSegments(previousSegments, selectedSegments);
  const previousBlocks = [];
  const selectedBlocks = [];
  let addedCount = 0;
  let removedCount = 0;

  operations.forEach((operation) => {
    if (operation.type === "same") {
      previousBlocks.push({ state: "same", text: operation.text });
      selectedBlocks.push({ state: "same", text: operation.text });
      return;
    }

    if (operation.type === "remove") {
      removedCount += 1;
      previousBlocks.push({ state: "removed", text: operation.text });
      return;
    }

    addedCount += 1;
    selectedBlocks.push({ state: "added", text: operation.text });
  });

  return {
    previousBlocks,
    selectedBlocks,
    addedCount,
    removedCount,
  };
}

function renderCompareBlocks(blocks = [], emptyText = "Nothing here yet.") {
  if (!blocks.length) {
    return `<p class="compare-empty">${displayText(emptyText)}</p>`;
  }

  return `
    <div class="compare-segment-list">
      ${blocks.map((block) => `
        <p class="compare-segment" data-state="${block.state}">${displayText(block.text)}</p>
      `).join("")}
    </div>
  `;
}

function renderScriptBodyText(text, fallback = "No speech body yet.") {
  const paragraphs = splitDisplayParagraphs(text);

  if (!paragraphs.length) {
    return `<p class="body-copy">${displayText(fallback)}</p>`;
  }

  return `
    <div class="script-paragraphs">
      ${paragraphs.map((paragraph) => `<p class="body-copy">${displayText(paragraph)}</p>`).join("")}
    </div>
  `;
}

function formatSignedDelta(value, singular, plural = `${singular}s`) {
  if (!value) {
    return `No ${singular} change`;
  }

  const amount = Math.abs(value);
  return `${value > 0 ? "+" : "-"}${amount} ${amount === 1 ? singular : plural}`;
}

function formatCountLabel(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

function excerpt(text, length = 130) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= length) return cleaned;
  return `${cleaned.slice(0, length - 3)}...`;
}

function getSpeechById(id) {
  return state.speeches.find((speech) => speech.id === id) || null;
}

function getIdeaById(id) {
  return state.ideas.find((idea) => idea.id === id) || null;
}

function getPlaybookById(id) {
  return state.playbookEntries.find((entry) => entry.id === id) || null;
}

function getVersionById(speech, versionId) {
  return speech?.versions.find((version) => version.id === versionId) || null;
}

function getDeliveryById(speech, deliveryId) {
  return speech?.deliveries.find((delivery) => delivery.id === deliveryId) || null;
}

function getPinnedPlaybookEntries() {
  return state.playbookEntries.filter((entry) => entry.pinned);
}

function sortDeliveries(deliveries) {
  return [...deliveries].sort((a, b) => {
    const timeA = a.deliveredAt ? new Date(`${a.deliveredAt}T12:00:00`).getTime() : 0;
    const timeB = b.deliveredAt ? new Date(`${b.deliveredAt}T12:00:00`).getTime() : 0;
    return timeB - timeA;
  });
}

function getFilteredSpeeches() {
  const query = state.search.trim().toLowerCase();

  return state.speeches.filter((speech) => {
    if (state.filter !== "all" && speech.status !== state.filter) {
      return false;
    }

    if (!query) {
      return true;
    }

    if (state.speechSearchResultQuery === query && state.speechSearchIds instanceof Set) {
      return state.speechSearchIds.has(speech.id);
    }

    return (speech.searchText || "").includes(query);
  });
}

function getFilteredIdeas() {
  const query = state.ideaSearch.trim().toLowerCase();

  return state.ideas.filter((idea) => {
    if (state.ideaFilter === "open" && idea.expandedSpeechId) {
      return false;
    }

    if (state.ideaFilter === "expanded" && !idea.expandedSpeechId) {
      return false;
    }

    if (!query) {
      return true;
    }

    const linkedSpeech = idea.expandedSpeechId ? getSpeechById(idea.expandedSpeechId) : null;
    const haystack = [
      idea.title,
      idea.idea,
      idea.tags.join(" "),
      linkedSpeech?.title || "",
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });
}

function getFilteredPlaybookEntries() {
  const query = state.playbookSearch.trim().toLowerCase();

  return state.playbookEntries.filter((entry) => {
    if (state.playbookFilter === "pinned" && !entry.pinned) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [
      entry.title,
      entry.category,
      entry.principle,
      entry.whyItWorks,
      entry.tags.join(" "),
    ].join(" ").toLowerCase();

    return haystack.includes(query);
  });
}

function ensureSelection() {
  const filtered = getFilteredSpeeches();

  if (!filtered.length) {
    state.selectedSpeechId = null;
    state.selectedVersionId = null;
    state.selectedDeliveryId = null;
    return null;
  }

  let speech = getSpeechById(state.selectedSpeechId);
  if (!speech || !filtered.some((item) => item.id === speech.id)) {
    speech = filtered[0];
    state.selectedSpeechId = speech.id;
  }

  const version = getSelectedVersionForSpeech(speech);
  state.selectedVersionId = version?.id || null;

  const delivery = getSelectedDeliveryForSpeech(speech);
  state.selectedDeliveryId = delivery?.id || null;

  return speech;
}

function ensureIdeaSelection() {
  const filtered = getFilteredIdeas();

  if (!filtered.length) {
    state.selectedIdeaId = null;
    return null;
  }

  let idea = getIdeaById(state.selectedIdeaId);
  if (!idea || !filtered.some((item) => item.id === idea.id)) {
    idea = filtered[0];
    state.selectedIdeaId = idea.id;
  }

  return idea;
}

function ensurePlaybookSelection() {
  const filtered = getFilteredPlaybookEntries();

  if (!filtered.length) {
    state.selectedPlaybookId = null;
    return null;
  }

  let entry = getPlaybookById(state.selectedPlaybookId);
  if (!entry || !filtered.some((item) => item.id === entry.id)) {
    entry = filtered[0];
    state.selectedPlaybookId = entry.id;
  }

  return entry;
}

function getSelectedVersionForSpeech(speech) {
  if (!speech) return null;

  const explicit = getVersionById(speech, state.selectedVersionId);
  if (explicit) return explicit;

  const active = getVersionById(speech, speech.activeVersionId);
  if (active) return active;

  return speech.versions[0] || null;
}

function scrollTabAnchorIntoView(anchorName) {
  if (!anchorName) return;

  window.requestAnimationFrame(() => {
    const anchor = elements.tabContent.querySelector(`[data-tab-anchor="${anchorName}"]`);
    anchor?.scrollIntoView({ block: "start", inline: "nearest" });
  });
}

function getSelectedDeliveryForSpeech(speech) {
  if (!speech?.deliveries?.length) return null;

  const explicit = getDeliveryById(speech, state.selectedDeliveryId);
  if (explicit) return explicit;

  return sortDeliveries(speech.deliveries)[0];
}

function getSpeechVersionCount(speech) {
  if (!speech) return 0;
  return speech.detailLoaded ? speech.versions.length : (speech.versionCount || 0);
}

function getSpeechDeliveryCount(speech) {
  if (!speech) return 0;
  return speech.detailLoaded ? speech.deliveries.length : (speech.deliveryCount || 0);
}

function getSpeechLatestDeliverySummary(speech) {
  if (!speech) return null;

  if (speech.detailLoaded) {
    const latestDelivery = sortDeliveries(speech.deliveries)[0];
    if (latestDelivery) {
      return {
        deliveredAt: latestDelivery.deliveredAt,
        eventLevel: latestDelivery.eventLevel,
      };
    }
  }

  if (!speech.latestDeliveryAt) {
    return null;
  }

  return {
    deliveredAt: speech.latestDeliveryAt,
    eventLevel: speech.latestDeliveryEventLevel || "",
  };
}

function getSpeechLatestRunLine(speech) {
  const latestDelivery = getSpeechLatestDeliverySummary(speech);
  return latestDelivery
    ? `Latest run: ${formatDate(latestDelivery.deliveredAt)}${latestDelivery.eventLevel ? ` · ${latestDelivery.eventLevel}` : ""}`
    : "No runs logged yet.";
}

function getLatestVersionForSpeech(speech, excludeVersionId = "") {
  if (!speech?.versions?.length) return null;

  const candidates = speech.versions.filter((version) => version.id !== excludeVersionId);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function getCompareReferenceVersion(speech, selectedVersion) {
  if (!speech || !selectedVersion) {
    return { version: null, mode: "none", label: "No comparison available." };
  }

  const basedOnVersion = selectedVersion.basedOn
    ? getVersionById(speech, selectedVersion.basedOn)
    : null;

  if (basedOnVersion) {
    return {
      version: basedOnVersion,
      mode: "base",
      label: `Base version: ${basedOnVersion.label}`,
      helper: "This draft already points to a specific base version, so compare uses that authored link first.",
    };
  }

  const selectedIndex = speech.versions.findIndex((version) => version.id === selectedVersion.id);
  if (selectedIndex > 0) {
    const previousVersion = speech.versions[selectedIndex - 1];
    return {
      version: previousVersion,
      mode: "previous",
      label: `Previous version: ${previousVersion.label}`,
      helper: "No base version is set, so compare falls back to the version edited just before this one.",
    };
  }

  return {
    version: null,
    mode: "none",
    label: "No earlier version to compare.",
    helper: "This is the first version in the timeline.",
  };
}

function setLibraryStatus(text, tone = "") {
  elements.libraryStatus.textContent = text;
  elements.libraryStatus.dataset.tone = tone;
}

function renderTopActions() {
  const showIdeas = state.workspaceView === "ideas";
  const showSpeeches = state.workspaceView === "speeches";
  const showPlaybook = state.workspaceView === "playbook";
  const showSettings = state.workspaceView === "settings";

  elements.workspaceToggleButton.hidden = !state.user;
  elements.settingsButton.hidden = !state.user;
  elements.newIdeaButton.hidden = !state.user;
  elements.newSpeechButton.hidden = !state.user;
  elements.newPlaybookButton.hidden = !state.user;
  elements.settingsButton.textContent = "Settings";
  elements.settingsButton.className = showSettings ? "primary-button" : "ghost-button";

  if (showSpeeches) {
    elements.workspaceToggleButton.textContent = "Playbook";
    elements.workspaceToggleButton.className = "ghost-button";
    elements.newIdeaButton.textContent = "New Idea";
    elements.newIdeaButton.className = "ghost-button";
    elements.newSpeechButton.hidden = false;
    elements.newSpeechButton.textContent = "New Speech";
    elements.newSpeechButton.className = "primary-button";
    elements.newPlaybookButton.hidden = true;
    return;
  }

  if (showIdeas) {
    elements.workspaceToggleButton.textContent = "Speech Library";
    elements.workspaceToggleButton.className = "ghost-button";
    elements.newIdeaButton.textContent = "Playbook";
    elements.newIdeaButton.className = "ghost-button";
    elements.newSpeechButton.hidden = false;
    elements.newSpeechButton.textContent = "New Idea";
    elements.newSpeechButton.className = "primary-button";
    elements.newPlaybookButton.hidden = true;
    return;
  }

  if (showSettings) {
    elements.workspaceToggleButton.textContent = "Speech Library";
    elements.workspaceToggleButton.className = "ghost-button";
    elements.newIdeaButton.textContent = "Ideas";
    elements.newIdeaButton.className = "ghost-button";
    elements.newSpeechButton.hidden = false;
    elements.newSpeechButton.textContent = "Playbook";
    elements.newSpeechButton.className = "ghost-button";
    elements.newPlaybookButton.hidden = true;
    return;
  }

  elements.workspaceToggleButton.textContent = "Speech Library";
  elements.workspaceToggleButton.className = "ghost-button";
  elements.newIdeaButton.textContent = "Ideas";
  elements.newIdeaButton.className = "ghost-button";
  elements.newSpeechButton.hidden = true;
  elements.newPlaybookButton.hidden = false;
  elements.newPlaybookButton.textContent = "New Principle";
  elements.newPlaybookButton.className = "primary-button";
}

function renderWorkspaceRail() {
  if (state.workspaceView === "settings") {
    elements.libraryEyebrow.textContent = "Settings";
    elements.libraryTitle.textContent = "Reading";
    elements.searchInput.hidden = true;
    elements.filterBar.hidden = true;
    elements.searchInput.value = "";
    return;
  }

  elements.searchInput.hidden = false;
  elements.filterBar.hidden = false;

  if (state.workspaceView === "ideas") {
    elements.libraryEyebrow.textContent = "Ideas";
    elements.libraryTitle.textContent = "Idea Seeds";
    if (elements.searchInput.value !== state.ideaSearch) {
      elements.searchInput.value = state.ideaSearch;
    }
    elements.searchInput.placeholder = "Search ideas";
    return;
  }

  if (state.workspaceView === "playbook") {
    elements.libraryEyebrow.textContent = "Playbook";
    elements.libraryTitle.textContent = "Principles";
    if (elements.searchInput.value !== state.playbookSearch) {
      elements.searchInput.value = state.playbookSearch;
    }
    elements.searchInput.placeholder = "Search principles";
    return;
  }

  elements.libraryEyebrow.textContent = "Library";
  elements.libraryTitle.textContent = "Speeches";
  if (elements.searchInput.value !== state.search) {
    elements.searchInput.value = state.search;
  }
  elements.searchInput.placeholder = "Search speeches";
}

function playbookCategoryCount() {
  return new Set(
    state.playbookEntries
      .map((entry) => entry.category.trim())
      .filter(Boolean),
  ).size;
}

function renderCounts() {
  if (state.workspaceView === "settings") {
    elements.totalCount.textContent = `${state.preferences.scriptTextSize}px text`;
    elements.draftCount.textContent = `${formatScriptLineHeightValue(state.preferences.scriptLineHeight)} line`;
    elements.deliveredCount.textContent = `${formatScriptParagraphSpacingValue(state.preferences.scriptParagraphSpacing)} paragraph`;
    return;
  }

  if (state.workspaceView === "ideas") {
    const total = state.ideas.length;
    const open = state.ideas.filter((idea) => !idea.expandedSpeechId).length;
    const expanded = state.ideas.filter((idea) => idea.expandedSpeechId).length;

    elements.totalCount.textContent = `${total} ${total === 1 ? "idea" : "ideas"}`;
    elements.draftCount.textContent = `${open} open`;
    elements.deliveredCount.textContent = `${expanded} expanded`;
    return;
  }

  if (state.workspaceView === "playbook") {
    const total = state.playbookEntries.length;
    const pinned = state.playbookEntries.filter((entry) => entry.pinned).length;
    const categories = playbookCategoryCount();

    elements.totalCount.textContent = `${total} ${total === 1 ? "principle" : "principles"}`;
    elements.draftCount.textContent = `${pinned} pinned`;
    elements.deliveredCount.textContent = `${categories} ${categories === 1 ? "category" : "categories"}`;
    return;
  }

  const total = state.speeches.length;
  const inProgress = state.speeches.filter((speech) => ["idea", "draft", "rehearsal_ready"].includes(speech.status)).length;
  const delivered = state.speeches.filter((speech) => getSpeechDeliveryCount(speech) > 0).length;

  elements.totalCount.textContent = `${total} speeches`;
  elements.draftCount.textContent = `${inProgress} in progress`;
  elements.deliveredCount.textContent = `${delivered} delivered`;
}

function renderFilters() {
  if (state.workspaceView === "settings") {
    elements.filterBar.innerHTML = "";
    return;
  }

  if (state.workspaceView === "ideas") {
    const filters = [
      { id: "all", label: "All" },
      { id: "open", label: "Open" },
      { id: "expanded", label: "Expanded" },
    ];

    elements.filterBar.innerHTML = filters.map((filter) => `
      <button
        class="filter-pill"
        type="button"
        data-filter="${filter.id}"
        aria-pressed="${String(state.ideaFilter === filter.id)}"
      >
        ${filter.label}
      </button>
    `).join("");
    return;
  }

  if (state.workspaceView === "playbook") {
    const filters = [
      { id: "all", label: "All" },
      { id: "pinned", label: "Pinned" },
    ];

    elements.filterBar.innerHTML = filters.map((filter) => `
      <button
        class="filter-pill"
        type="button"
        data-filter="${filter.id}"
        aria-pressed="${String(state.playbookFilter === filter.id)}"
      >
        ${filter.label}
      </button>
    `).join("");
    return;
  }

  const filters = [
    { id: "all", label: "All" },
    { id: "idea", label: "Legacy Ideas" },
    { id: "draft", label: "Drafts" },
    { id: "rehearsal_ready", label: "Rehearsal Ready" },
    { id: "delivered", label: "Delivered" },
  ];

  elements.filterBar.innerHTML = filters.map((filter) => `
    <button
      class="filter-pill"
      type="button"
      data-filter="${filter.id}"
      aria-pressed="${String(state.filter === filter.id)}"
    >
      ${filter.label}
    </button>
  `).join("");
}

function renderIdeaBody(idea) {
  if (!idea) {
    return `
      <div class="empty-state">
        Capture sparks, fragments, and little thoughts here before they become full speeches.
      </div>
    `;
  }

  const linkedSpeech = idea.expandedSpeechId ? getSpeechById(idea.expandedSpeechId) : null;
  const updatedLabel = idea.updatedAt ? `Last edited ${formatDateTime(idea.updatedAt)}` : "Not edited yet";

  return `
    <div class="reader-stack">
      <div class="card">
        <div class="panel-head">
          <h4>Idea Note</h4>
          <div class="button-row">
            <span class="meta-chip">${updatedLabel}</span>
            <span class="meta-chip">${ideaWordCount(idea)} words</span>
          </div>
        </div>
        <div class="notes-box">
          ${renderScriptBodyText(idea.idea, "No idea note yet.")}
        </div>
      </div>

      <div class="card">
        <div class="panel-head">
          <h4>Expansion</h4>
          <span class="meta-chip">${linkedSpeech ? "Expanded" : "Open"}</span>
        </div>
        <div class="info-grid">
          <div class="info-row">
            <strong>Linked Speech</strong>
            <span>${displayText(linkedSpeech?.title || "Not expanded yet.")}</span>
          </div>
          <div class="info-row">
            <strong>Created</strong>
            <span>${displayText(formatDateTime(idea.createdAt || idea.updatedAt || ""))}</span>
          </div>
          <div class="info-row">
            <strong>Tags</strong>
            <div class="tag-row">${idea.tags.length ? renderTagChips(idea.tags) : '<span>No tags yet.</span>'}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderIdeaDetail(idea) {
  elements.tabBar.hidden = true;
  syncDocumentScrollMode(null);

  if (!idea) {
    elements.speechMode.textContent = "Idea";
    elements.speechTitle.textContent = state.ideas.length ? "No matching idea" : "Capture an idea";
    elements.speechStatusChip.textContent = "Idea";
    elements.speechStatusChip.dataset.status = "idea";
    elements.speechGoalChip.textContent = "Seed";
    elements.speechCountChip.textContent = `${state.ideas.length} ${state.ideas.length === 1 ? "idea" : "ideas"}`;
    elements.speechIdea.textContent = state.ideas.length
      ? "Adjust the search or filter to see an idea."
      : "Save the small sparks you might want to turn into full speeches later.";
    elements.speechTags.innerHTML = "";
    elements.detailActionRow.innerHTML = `
      <button class="primary-button" type="button" data-action="new-idea">New Idea</button>
      <button class="ghost-button" type="button" data-action="show-speeches">Speech Library</button>
    `;
    elements.focusCard.innerHTML = `
      <div class="focus-block" data-size="wide">
        <strong>What Belongs Here</strong>
        <p>Store little thoughts, scenes, openings, tensions, or emotional arcs before they deserve full speech structure.</p>
      </div>
      <div class="focus-block">
        <strong>Expansion Flow</strong>
        <p>Capture first, expand later.</p>
        <span class="helper-copy">Ideas stay lightweight until you deliberately turn one into a speech.</span>
      </div>
    `;
    elements.tabContent.innerHTML = `
      <div class="empty-state">
        ${state.ideas.length ? "No ideas match the current search." : "No idea seeds yet. Start with the next thought you do not want to lose."}
      </div>
    `;
    syncHeaderActions();
    return;
  }

  const linkedSpeech = idea.expandedSpeechId ? getSpeechById(idea.expandedSpeechId) : null;

  elements.speechMode.textContent = linkedSpeech ? "Idea + Linked Speech" : "Idea Seed";
  elements.speechTitle.textContent = idea.title;
  elements.speechStatusChip.textContent = linkedSpeech ? "Expanded" : "Idea";
  elements.speechStatusChip.dataset.status = linkedSpeech ? "expanded" : "idea";
  elements.speechGoalChip.textContent = linkedSpeech ? "Linked to speech" : "Open seed";
  elements.speechCountChip.textContent = `${idea.tags.length} ${idea.tags.length === 1 ? "tag" : "tags"}`;
  elements.speechIdea.textContent = "";
  elements.speechTags.innerHTML = renderTagChips(idea.tags);
  elements.detailActionRow.innerHTML = `
    <button class="meta-button" type="button" data-action="edit-idea">Edit Idea</button>
    <button class="primary-button" type="button" data-action="${linkedSpeech ? "open-linked-speech" : "expand-idea"}">${linkedSpeech ? "Open Speech" : "Expand to Speech"}</button>
    <button class="danger-button" type="button" data-action="delete-idea">Delete Idea</button>
  `;
  elements.focusCard.innerHTML = "";
  elements.tabContent.innerHTML = renderIdeaBody(idea);
  syncHeaderActions();
}

function renderIdeaList() {
  const filtered = getFilteredIdeas();
  const selected = ensureIdeaSelection();

  if (!filtered.length) {
    elements.speechList.innerHTML = `<div class="empty-state">${state.ideas.length ? "No ideas match this filter." : "No ideas saved yet."}</div>`;
    setLibraryStatus(
      state.ideas.length
        ? (state.ideaSearch ? `Filtering ideas by "${state.ideaSearch.trim()}".` : "No ideas match this filter.")
        : "Start an idea seed the moment a promising thought appears.",
      state.ideas.length ? "" : "ok",
    );
    renderIdeaDetail(null);
    return;
  }

  elements.speechList.innerHTML = filtered.map((idea) => {
    const linkedSpeech = idea.expandedSpeechId ? getSpeechById(idea.expandedSpeechId) : null;

    return `
      <button class="speech-card" type="button" data-idea-id="${idea.id}" aria-pressed="${String(selected?.id === idea.id)}">
        <div class="meta-row">
          <span class="status-chip" data-status="${linkedSpeech ? "expanded" : "idea"}">${linkedSpeech ? "Expanded" : "Idea"}</span>
          <span class="meta-chip">${ideaWordCount(idea)} words</span>
        </div>
        <h3>${displayText(idea.title)}</h3>
        <p>${displayText(excerpt(idea.idea, 140), "No idea note yet.")}</p>
        <div class="tag-row">
          ${renderTagChips(idea.tags.slice(0, 3))}
        </div>
        <p>${displayText(linkedSpeech ? `Linked to ${linkedSpeech.title}` : (idea.updatedAt ? `Last edited ${formatDateTime(idea.updatedAt)}` : "Not edited yet."))}</p>
      </button>
    `;
  }).join("");

  setLibraryStatus(
    state.ideaSearch
      ? `Filtering ideas by "${state.ideaSearch.trim()}".`
      : "Showing lightweight idea seeds for later expansion.",
    "ok",
  );
  renderIdeaDetail(selected);
}

function renderPlaybookBody(entry) {
  if (!entry) {
    return `
      <div class="empty-state">
        Capture the speaking moves, emotional arcs, and structural lessons you want to keep using.
      </div>
    `;
  }

  const updatedLabel = entry.updatedAt ? `Last edited ${formatDateTime(entry.updatedAt)}` : "Not edited yet";

  return `
    <div class="reader-stack">
      <div class="card">
        <div class="panel-head">
          <h4>Guiding Principle</h4>
          <div class="button-row">
            <span class="meta-chip">${displayText(entry.category || "Uncategorized")}</span>
            <span class="meta-chip">${entry.pinned ? "Pinned in writing" : "Playbook only"}</span>
          </div>
        </div>
        <p class="playbook-principle">${displayText(entry.principle, "No principle saved yet.")}</p>
      </div>

      <div class="two-up">
        <div class="card">
          <div class="panel-head">
            <h4>Why It Works</h4>
            <span class="meta-chip">${updatedLabel}</span>
          </div>
          <div class="notes-box">
            <p class="body-copy">${displayText(entry.whyItWorks, "Add the reason behind this principle so future drafts use it deliberately, not mechanically.")}</p>
          </div>
        </div>

        <div class="card">
          <div class="panel-head">
            <h4>Use In Writing</h4>
            <span class="meta-chip">${entry.tags.length} ${entry.tags.length === 1 ? "tag" : "tags"}</span>
          </div>
          <div class="playbook-meta-stack">
            <div class="info-grid">
              <div class="info-row">
                <strong>Pinned in Editors</strong>
                <span>${entry.pinned ? "Yes. This appears at the top of script-writing editors." : "No. Keep it in Playbook until it becomes a recurring rule."}</span>
              </div>
              <div class="info-row">
                <strong>Created</strong>
                <span>${displayText(formatDateTime(entry.createdAt || entry.updatedAt || ""))}</span>
              </div>
              <div class="info-row">
                <strong>Category</strong>
                <span>${displayText(entry.category || "Uncategorized")}</span>
              </div>
            </div>
            <div class="tag-row">
              ${renderTagChips(entry.tags)}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderPlaybookDetail(entry) {
  elements.tabBar.hidden = true;
  syncDocumentScrollMode(null);

  if (!entry) {
    elements.speechMode.textContent = "Playbook";
    elements.speechTitle.textContent = state.playbookEntries.length ? "No matching principle" : "Build your speaking playbook";
    elements.speechStatusChip.textContent = "Playbook";
    elements.speechStatusChip.dataset.status = "playbook";
    elements.speechGoalChip.textContent = "Global guidance";
    elements.speechCountChip.textContent = `${state.playbookEntries.length} ${state.playbookEntries.length === 1 ? "principle" : "principles"}`;
    elements.speechIdea.textContent = state.playbookEntries.length
      ? "Adjust the search or filter to see a principle."
      : "Capture the lessons you want every future speech to remember.";
    elements.speechTags.innerHTML = "";
    elements.detailActionRow.innerHTML = `
      <button class="primary-button" type="button" data-action="new-playbook">New Principle</button>
      <button class="ghost-button" type="button" data-action="show-speeches">Speech Library</button>
    `;
    elements.focusCard.innerHTML = `
      <div class="focus-block" data-size="wide">
        <strong>What Belongs Here</strong>
        <p>Store reusable speaking principles, emotional arcs, structural patterns, and stagecraft lessons that should outlive any single speech.</p>
      </div>
      <div class="focus-block">
        <strong>Pinned Guidance</strong>
        <p>${getPinnedPlaybookEntries().length} pinned</p>
        <span class="helper-copy">Pinned principles show up inside script-writing editors.</span>
      </div>
    `;
    elements.tabContent.innerHTML = `
      <div class="empty-state">
        ${state.playbookEntries.length ? "No principles match the current search." : "No playbook principles yet. Start with one lesson you never want to forget."}
      </div>
    `;
    syncHeaderActions();
    return;
  }

  elements.speechMode.textContent = entry.pinned ? "Pinned Playbook Principle" : "Playbook Principle";
  elements.speechTitle.textContent = entry.title;
  elements.speechStatusChip.textContent = entry.pinned ? "Pinned" : "Playbook";
  elements.speechStatusChip.dataset.status = entry.pinned ? "pinned" : "playbook";
  elements.speechGoalChip.textContent = entry.category || "Uncategorized";
  elements.speechCountChip.textContent = `${entry.tags.length} ${entry.tags.length === 1 ? "tag" : "tags"}`;
  elements.speechIdea.textContent = entry.principle || "No principle saved yet.";
  elements.speechTags.innerHTML = renderTagChips(entry.tags);
  elements.detailActionRow.innerHTML = `
    <button class="meta-button" type="button" data-action="edit-playbook">Edit Principle</button>
    <button class="primary-button" type="button" data-action="new-playbook">New Principle</button>
    <button class="danger-button" type="button" data-action="delete-playbook">Delete Principle</button>
  `;
  elements.focusCard.innerHTML = `
    <div class="focus-block" data-size="wide">
      <strong>Why It Works</strong>
      <p>${displayText(entry.whyItWorks, "Add why this principle works so the rule stays memorable and intentional.")}</p>
      <span class="helper-copy">${displayText(entry.updatedAt ? `Last edited ${formatDateTime(entry.updatedAt)}` : "Not edited yet.")}</span>
    </div>
    <div class="focus-block">
      <strong>Writing Use</strong>
      <p>${entry.pinned ? "Pinned in editors" : "Playbook only"}</p>
      <span class="helper-copy">${entry.pinned ? "This shows up while drafting." : "Pin it when it becomes a recurring rule."}</span>
    </div>
  `;
  elements.tabContent.innerHTML = renderPlaybookBody(entry);
  syncHeaderActions();
}

function renderPlaybookList() {
  const filtered = getFilteredPlaybookEntries();
  const selected = ensurePlaybookSelection();

  if (!filtered.length) {
    elements.speechList.innerHTML = `<div class="empty-state">${state.playbookEntries.length ? "No principles match this filter." : "No playbook principles yet."}</div>`;
    setLibraryStatus(
      state.playbookEntries.length
        ? (state.playbookSearch ? `Filtering principles by "${state.playbookSearch.trim()}".` : "No principles match this filter.")
        : "Start your playbook with a lesson you want to reuse.",
      state.playbookEntries.length ? "" : "ok",
    );
    renderPlaybookDetail(null);
    return;
  }

  elements.speechList.innerHTML = filtered.map((entry) => `
    <button class="speech-card" type="button" data-playbook-id="${entry.id}" aria-pressed="${String(selected?.id === entry.id)}">
      <div class="meta-row">
        <span class="status-chip" data-status="${entry.pinned ? "pinned" : "playbook"}">${entry.pinned ? "Pinned" : "Playbook"}</span>
        <span class="meta-chip">${displayText(entry.category || "Uncategorized")}</span>
      </div>
      <h3>${displayText(entry.title)}</h3>
      <p>${displayText(excerpt(entry.principle, 140), "No principle saved yet.")}</p>
      <div class="tag-row">
        ${renderTagChips(entry.tags.slice(0, 3))}
      </div>
      <p>${displayText(entry.updatedAt ? `Last edited ${formatDateTime(entry.updatedAt)}` : "Not edited yet.")}</p>
    </button>
  `).join("");

  setLibraryStatus(
    state.playbookSearch
      ? `Filtering principles by "${state.playbookSearch.trim()}".`
      : "Showing your reusable speaking principles.",
    "ok",
  );
  renderPlaybookDetail(selected);
}

function renderSettingsBody() {
  return `
    <div class="reader-stack">
      <div class="card">
        <div class="panel-head">
          <div>
            <h4>Reading Layout</h4>
            <p class="helper-copy">These controls affect speech reading views, compare mode, and the script editor across the whole app.</p>
          </div>
          <span class="meta-chip">Account-backed</span>
        </div>
        <p class="status" data-settings-status>${escapeHtml(state.settings.message)}</p>
        <div class="panel-tools">
          ${renderScriptReadingControls()}
        </div>
      </div>

      <div class="two-up">
        <div class="card">
          <div class="panel-head">
            <h4>Current Defaults</h4>
            <span class="meta-chip">Applied live</span>
          </div>
          <div class="info-grid">
            <div class="info-row">
              <strong>Script Text</strong>
              <span>${state.preferences.scriptTextSize}px</span>
            </div>
            <div class="info-row">
              <strong>Line Spacing</strong>
              <span>${formatScriptLineHeightValue(state.preferences.scriptLineHeight)}</span>
            </div>
            <div class="info-row">
              <strong>Paragraph Spacing</strong>
              <span>${formatScriptParagraphSpacingValue(state.preferences.scriptParagraphSpacing)}</span>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="panel-head">
            <h4>Preview</h4>
            <span class="meta-chip">Live sample</span>
          </div>
          <div class="script-box">
            ${renderScriptBodyText("This is how your script body will read across overview, versions, and script editing.\n\nAdjust the spacing until the page feels calm enough to rehearse from without wasting vertical space.")}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsDetail() {
  elements.tabBar.hidden = true;
  syncDocumentScrollMode(null);
  elements.speechMode.textContent = "Settings";
  elements.speechTitle.textContent = "Reading Settings";
  elements.speechStatusChip.textContent = "Settings";
  elements.speechStatusChip.dataset.status = "settings";
  elements.speechGoalChip.textContent = "Per admin account";
  elements.speechCountChip.textContent = "Auto-saved";
  elements.speechIdea.textContent = "Keep reading controls out of the way here, then let the rest of the app stay focused on writing and rehearsal.";
  elements.speechTags.innerHTML = "";
  elements.detailActionRow.innerHTML = `
    <button class="ghost-button" type="button" data-action="show-speeches">Speech Library</button>
  `;
  elements.focusCard.innerHTML = `
    <div class="focus-block" data-size="wide">
      <strong>Why This Moved</strong>
      <p>Script text size and spacing now live in a dedicated settings workspace instead of taking room inside speech reading and editing surfaces.</p>
    </div>
    <div class="focus-block">
      <strong>Defaults</strong>
      <p>25px · 1.40x · 1.20x</p>
      <span class="helper-copy">Changes save to your Supabase-backed admin settings.</span>
    </div>
  `;
  elements.tabContent.innerHTML = renderSettingsBody();
  syncAllScriptPreferenceControls(elements.tabContent);
  syncSettingsStatus(elements.tabContent);
  syncHeaderActions();
}

function renderSettingsList() {
  elements.speechList.innerHTML = `
    <div class="empty-state">
      Reading settings are saved per admin account and applied across the full speeches workspace.
    </div>
  `;
  setLibraryStatus("Showing account-level reading settings.", "ok");
  renderSettingsDetail();
}

function renderSpeechList() {
  const filtered = getFilteredSpeeches();
  const selected = ensureSelection();
  const searchQuery = state.search.trim();

  if (!filtered.length) {
    if (searchQuery && state.speechSearchLoading) {
      elements.speechList.innerHTML = '<div class="empty-state">Searching all speeches...</div>';
      setLibraryStatus(`Searching all speeches for "${searchQuery}"...`, "ok");
      renderSpeechDetail(null);
      return;
    }

    elements.speechList.innerHTML = '<div class="empty-state">No speeches match this filter.</div>';
    setLibraryStatus(searchQuery ? `No speeches match "${searchQuery}".` : "No matching speeches.", "");
    renderSpeechDetail(null);
    return;
  }

  elements.speechList.innerHTML = filtered.map((speech) => {
    return `
      <button class="speech-card" type="button" data-speech-id="${speech.id}" aria-pressed="${String(selected?.id === speech.id)}">
        <div class="meta-row">
          <span class="status-chip" data-status="${speech.status}">${statusLabel(speech.status)}</span>
          <span class="meta-chip">${getSpeechVersionCount(speech)} ${getSpeechVersionCount(speech) === 1 ? "version" : "versions"}</span>
        </div>
        <h3>${displayText(speech.title)}</h3>
        <p>${displayText(excerpt(speech.coreIdea, 120), "No core idea yet.")}</p>
        <div class="tag-row">
          ${renderTagChips(speech.tags.slice(0, 3))}
        </div>
        <p>${displayText(getSpeechLatestRunLine(speech))}</p>
      </button>
    `;
  }).join("");

  if (searchQuery) {
    if (state.speechSearchLoading) {
      setLibraryStatus(`Searching all speeches for "${searchQuery}"...`, "ok");
    } else if (state.speechSearchError) {
      setLibraryStatus(`Showing summary matches for "${searchQuery}". Full-text search is temporarily unavailable.`, "warn");
    } else {
      setLibraryStatus(`Searching all speeches for "${searchQuery}".`, "ok");
    }
  } else {
    setLibraryStatus("Showing the current speech library.", "ok");
  }
  renderSpeechDetail(selected);
}

function renderSpeechDetail(speech) {
  elements.tabBar.hidden = false;

  if (!speech) {
    elements.speechMode.textContent = "Speech";
    elements.speechTitle.textContent = "Select a speech";
    elements.speechStatusChip.textContent = "Idea";
    elements.speechStatusChip.dataset.status = "idea";
    elements.speechGoalChip.textContent = "Goal";
    elements.speechCountChip.textContent = "0 runs";
    elements.speechIdea.textContent = "";
    elements.speechTags.innerHTML = "";
    renderDetailActions(null);
    elements.focusCard.innerHTML = "";
    renderTabs();
    renderTabContent(null);
    syncHeaderActions(null);
    return;
  }

  const detailLoaded = Boolean(speech.detailLoaded);
  const version = detailLoaded ? getSelectedVersionForSpeech(speech) : null;
  const deliveryCount = getSpeechDeliveryCount(speech);

  elements.speechMode.textContent = deliveryCount ? "Speech + Run History" : "Speech in Progress";
  elements.speechTitle.textContent = speech.title;
  elements.speechStatusChip.textContent = statusLabel(speech.status);
  elements.speechStatusChip.dataset.status = speech.status;
  elements.speechGoalChip.textContent = speech.goal || "No goal yet";
  elements.speechCountChip.textContent = `${deliveryCount} ${deliveryCount === 1 ? "run" : "runs"}`;
  elements.speechIdea.textContent = speech.coreIdea || "No core idea yet.";
  elements.speechTags.innerHTML = renderTagChips(speech.tags);
  renderDetailActions(speech);
  renderFocusCard(speech, version);

  renderTabs();
  renderTabContent(speech, version);
  syncHeaderActions(speech);
}

function renderDetailActions(speech) {
  if (!speech) {
    elements.detailActionRow.innerHTML = `
      <button class="ghost-button" type="button" data-action="new-idea">New Idea</button>
      <button class="primary-button" type="button" data-action="new-speech">New Speech</button>
    `;
    return;
  }

  if (speech.status === "idea") {
    elements.detailActionRow.innerHTML = `
      <button class="meta-button" type="button" data-action="edit-speech">Edit Idea</button>
      <button class="script-button" type="button" data-action="edit-version">Edit Note</button>
      <button class="danger-button" type="button" data-action="delete-speech">Delete Idea</button>
    `;
    return;
  }

  elements.detailActionRow.innerHTML = `
    <button class="meta-button" type="button" data-action="edit-speech">Edit Meta</button>
    <button class="script-button" type="button" data-action="edit-version">Edit Script</button>
    <button class="primary-button" type="button" data-action="new-delivery">Log Run</button>
    <button class="danger-button" type="button" data-action="delete-speech">Delete Speech</button>
  `;
}

function syncHeaderActions() {
  renderTopActions();
}

function renderFocusCard(speech, version) {
  if (!speech.detailLoaded) {
    const detailStatus = speech.detailError
      ? "Could not load full speech detail."
      : (speech.detailLoading ? "Loading versions, runs, and rehearsal cues..." : "Loading full speech detail...");

    elements.focusCard.innerHTML = `
      <div class="focus-block" data-size="wide">
        <strong>Speech Detail</strong>
        <p>${displayText(detailStatus)}</p>
        <span class="helper-copy">${getSpeechVersionCount(speech)} versions · ${getSpeechDeliveryCount(speech)} runs</span>
      </div>
      <div class="focus-block">
        <strong>Latest Run</strong>
        <p>${displayText(getSpeechLatestRunLine(speech))}</p>
        <span class="helper-copy">${speech.detailError ? "Try opening the speech again to reload it." : "Full version history loads only for the selected speech."}</span>
      </div>
    `;
    return;
  }

  const delivery = getSelectedDeliveryForSpeech(speech);
  const revisionNote = version?.revisionNote || "No revision note yet.";
  const nextMove = speech.notes || delivery?.feedback?.nextActions?.[0] || "No next move yet.";
  const writingLine = speech.status === "idea"
    ? `${version?.rehearsalBullets.length || 0} prompts`
    : `${speechWordCount(speech)} words · ${version?.rehearsalBullets.length || 0} bullets`;
  const runLine = delivery
    ? `${formatDate(delivery.deliveredAt)}${delivery.eventLevel ? ` · ${delivery.eventLevel}` : ""}${delivery.result ? ` · ${delivery.result}` : ""}`
    : "No run logged yet";
  const runMeta = delivery
    ? [delivery.location, delivery.city].filter(Boolean).join(", ")
    : `${version?.estimatedMinutes || "-"} min target`;

  elements.focusCard.innerHTML = `
    <div class="focus-block" data-size="wide">
      <strong>Active Version</strong>
      <p>${displayText(version?.label)}</p>
      <span class="helper-copy">${displayText(writingLine)}</span>
      <div class="focus-details">
        <div class="focus-detail">
          <span class="focus-label">Revision Note</span>
          <p>${displayText(revisionNote)}</p>
        </div>
        <div class="focus-detail">
          <span class="focus-label">Next Move</span>
          <p>${displayText(nextMove)}</p>
        </div>
      </div>
    </div>
    <div class="focus-block">
      <strong>Latest Run</strong>
      <p>${displayText(runLine)}</p>
      <span class="helper-copy">${displayText(runMeta)}</span>
    </div>
  `;
}

function renderTabs() {
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "versions", label: "Versions" },
    { id: "runs", label: "Runs" },
    { id: "rehearsal", label: "Rehearsal" },
  ];

  elements.tabBar.innerHTML = tabs.map((tab) => `
    <button
      class="tab-pill"
      type="button"
      data-tab="${tab.id}"
      aria-pressed="${String(state.tab === tab.id)}"
    >
      ${tab.label}
    </button>
  `).join("");
}

function syncDocumentScrollMode(speech) {
  if (!elements.documentShell) return;

  const usePageScroll = Boolean(
    state.workspaceView === "speeches"
    && speech
    && (state.tab === "overview" || state.tab === "versions" || state.tab === "runs" || state.tab === "rehearsal"),
  );

  elements.documentShell.dataset.scrollMode = usePageScroll ? "page" : "panel";
}

function renderTabContent(speech) {
  syncDocumentScrollMode(speech);

  if (!speech) {
    elements.tabContent.innerHTML = '<div class="empty-state">No speech selected.</div>';
    return;
  }

  if (!speech.detailLoaded) {
    if (!speech.detailLoading && !speech.detailError) {
      void loadSpeechDetail(speech.id);
    }

    elements.tabContent.innerHTML = speech.detailError
      ? `
        <div class="empty-state">
          <p>Could not load the full speech detail.</p>
          <div class="button-row" style="justify-content: center; margin-top: 12px;">
            <button class="ghost-button" type="button" data-action="reload-speech-detail">Try Again</button>
          </div>
        </div>
      `
      : '<div class="empty-state">Loading versions, runs, and rehearsal detail for this speech.</div>';
    return;
  }

  if (state.tab === "versions") {
    elements.tabContent.innerHTML = renderVersionsTab(speech);
    return;
  }

  if (state.tab === "runs") {
    elements.tabContent.innerHTML = renderRunsTab(speech);
    return;
  }

  if (state.tab === "rehearsal") {
    elements.tabContent.innerHTML = renderRehearsalTab(speech);
    return;
  }

  elements.tabContent.innerHTML = renderOverviewTab(speech);
}

function renderOverviewTab(speech) {
  const version = getSelectedVersionForSpeech(speech);

  if (speech.status === "idea") {
    const prompts = version?.rehearsalBullets || [];

    return `
      <div class="two-up">
        <div class="card">
          <div class="panel-head">
            <h4>Idea Note</h4>
            <span class="meta-chip">${version?.label || "No version"}</span>
          </div>
          <div class="metric-row">
            <span class="metric-chip">${prompts.length} prompts</span>
            <span class="metric-chip">${speech.tags.length} tags</span>
          </div>
          <div class="notes-box" style="margin-bottom: 14px;">
            <p class="body-copy" style="font-size: 1rem; font-family: var(--sans); line-height: 1.55;">${displayText(speech.coreIdea, "No idea note yet.")}</p>
          </div>
          <div class="bullet-list">
            ${prompts.map((prompt, index) => `
              <div class="bullet-card">
                <strong>Prompt ${String(index + 1).padStart(2, "0")}</strong>
                <p>${displayText(prompt)}</p>
              </div>
            `).join("")}
          </div>
        </div>

        <div class="card">
          <div class="panel-head">
            <h4>Direction</h4>
            <span class="meta-chip">Idea</span>
          </div>
          <div class="info-grid">
            <div class="info-row">
              <strong>Goal</strong>
              <span>${displayText(speech.goal)}</span>
            </div>
            <div class="info-row">
              <strong>Next Draft Step</strong>
              <p>${displayText(version?.revisionNote)}</p>
            </div>
            <div class="info-row">
              <strong>Current Note</strong>
              <p>${displayText(speech.notes)}</p>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="card">
      <div class="panel-head">
        <h4>Speech Body</h4>
        <div class="button-row">
          <span class="meta-chip">${version?.label || "No version"}</span>
          <button class="script-button" type="button" data-action="edit-version">Edit Script</button>
        </div>
      </div>
      <div class="metric-row">
        <span class="metric-chip">${version?.estimatedMinutes || "-"} min target</span>
        <span class="metric-chip">${speechWordCount(speech)} words</span>
        <span class="metric-chip">${version?.rehearsalBullets?.length || 0} rehearsal bullets</span>
      </div>
      <div class="script-box">
        ${renderScriptBodyText(version?.speechBody, "No speech body yet.")}
      </div>
    </div>
  `;
}

function renderVersionsTab(speech) {
  const selectedVersion = getSelectedVersionForSpeech(speech);
  const basedOnVersion = selectedVersion?.basedOn ? getVersionById(speech, selectedVersion.basedOn) : null;
  const compareReference = getCompareReferenceVersion(speech, selectedVersion);
  const compareVersion = compareReference.version;
  const canDeleteVersion = Boolean(selectedVersion) && speech.versions.length > 1;
  const editTimestampLabel = selectedVersion ? `Last edited ${formatDateTime(selectedVersion.updatedAt)}` : "No version selected";
  const compareOpen = Boolean(state.versionCompareOpen && selectedVersion && compareVersion);
  const compareData = compareOpen ? buildVersionScriptCompare(compareVersion, selectedVersion) : null;
  const wordDelta = selectedVersion && compareVersion
    ? versionWordCount(selectedVersion) - versionWordCount(compareVersion)
    : 0;
  const minuteDelta = selectedVersion && compareVersion
    ? selectedVersion.estimatedMinutes - compareVersion.estimatedMinutes
    : 0;
  const bulletDelta = selectedVersion && compareVersion
    ? selectedVersion.rehearsalBullets.length - compareVersion.rehearsalBullets.length
    : 0;
  const revisionNoteChanged = Boolean(compareVersion)
    && normalizeCompareText(selectedVersion?.revisionNote) !== normalizeCompareText(compareVersion.revisionNote);

  return `
    <div class="reader-stack">
      <div class="card">
        <div class="panel-head">
          <div>
            <h4>Version History</h4>
            <p class="helper-copy">Selected version: ${displayText(selectedVersion?.label, "No version")}.</p>
          </div>
          <div class="button-row">
            <span class="meta-chip">${speech.versions.length} total</span>
          </div>
        </div>
        <div class="version-list">
          ${speech.versions.map((version) => `
            <div class="version-card" data-selected="${String(selectedVersion?.id === version.id)}">
              <button class="version-button" type="button" data-version-id="${version.id}">
                <div class="version-title">${displayText(version.label)}</div>
                <div class="timeline-meta">
                  <span>${displayText(`Last edited ${formatDateTime(version.updatedAt)}`)}</span>
                  <span>${version.estimatedMinutes} min</span>
                  <span>${versionWordCount(version)} words</span>
                  <span>${version.rehearsalBullets.length} bullets</span>
                </div>
                <p class="helper-copy">${displayText(version.revisionNote, "No revision note.")}</p>
              </button>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="card">
        <div class="panel-head">
          <h4>${displayText(selectedVersion?.label, "Version Detail")}</h4>
          <div class="button-row">
            <span class="meta-chip">${displayText(basedOnVersion ? `Based on ${basedOnVersion.label}` : "Original version")}</span>
            <span class="meta-chip">${displayText(editTimestampLabel)}</span>
          <button class="ghost-button" type="button" data-action="new-version">New Version</button>
          <button class="script-button" type="button" data-action="edit-version">Edit Script</button>
          ${compareVersion
              ? `<button class="ghost-button" type="button" data-action="toggle-version-compare" aria-pressed="${String(compareOpen)}">${compareOpen ? "Hide Compare" : "Compare"}</button>`
              : `<span class="meta-chip">${displayText(compareReference.label)}</span>`}
            ${canDeleteVersion ? '<button class="danger-button" type="button" data-action="delete-version">Delete Version</button>' : '<span class="meta-chip">Keep at least 1 version</span>'}
          </div>
        </div>
        <div class="script-box version-script-box" style="margin-bottom: 14px;">
          ${renderScriptBodyText(selectedVersion?.speechBody, "No speech body yet.")}
        </div>
        <div class="notes-box">
          <div class="panel-head">
            <h4>Revision Note</h4>
            <span class="meta-chip">${selectedVersion?.rehearsalBullets.length || 0} bullets</span>
          </div>
          <p class="body-copy" style="font-size: 1rem; font-family: var(--sans); line-height: 1.55;">${displayText(selectedVersion?.revisionNote, "No revision note.")}</p>
        </div>
      </div>

      ${compareOpen ? `
        <div class="card">
          <div class="panel-head">
            <div>
              <h4>Compare Versions</h4>
              <p class="helper-copy compare-context">Comparing ${displayText(selectedVersion?.label)} against ${displayText(compareVersion?.label)}. ${displayText(compareReference.helper || "")}</p>
            </div>
            <div class="button-row">
              <span class="meta-chip">${displayText(compareReference.label)}</span>
              <span class="meta-chip">${displayText(formatSignedDelta(wordDelta, "word"))}</span>
              <span class="meta-chip">${displayText(formatSignedDelta(minuteDelta, "min", "min"))}</span>
              <span class="meta-chip">${displayText(formatSignedDelta(bulletDelta, "bullet"))}</span>
              <span class="meta-chip">${displayText(compareData?.addedCount ? `${formatCountLabel(compareData.addedCount, "new section")}` : "No new sections")}</span>
              <span class="meta-chip">${displayText(compareData?.removedCount ? `${formatCountLabel(compareData.removedCount, "removed section")}` : "No removed sections")}</span>
              <span class="meta-chip">${revisionNoteChanged ? "Revision note changed" : "Revision note unchanged"}</span>
            </div>
          </div>

          <div class="two-up compare-grid">
            <div class="compare-pane">
              <div class="panel-head compare-pane-head">
                <div>
                  <h4>${displayText(compareVersion?.label, "Earlier Version")}</h4>
                  <p class="helper-copy">Reference draft</p>
                </div>
                <div class="button-row">
                  <span class="meta-chip">${displayText(`Last edited ${formatDateTime(compareVersion?.updatedAt)}`)}</span>
                  <span class="meta-chip">${compareVersion?.estimatedMinutes || "-"} min</span>
                  <span class="meta-chip">${versionWordCount(compareVersion)} words</span>
                </div>
              </div>
              <div class="notes-box compare-note-box" data-compare-state="${revisionNoteChanged ? "changed" : "same"}">
                <div class="panel-head">
                  <h4>Revision Note</h4>
                  <span class="meta-chip">${compareVersion?.rehearsalBullets.length || 0} bullets</span>
                </div>
                <p class="body-copy">${displayText(compareVersion?.revisionNote, "No revision note.")}</p>
              </div>
              <div class="script-box compare-script-box scroll-area">
                ${renderCompareBlocks(compareData?.previousBlocks || [], "No speech body yet.")}
              </div>
            </div>

            <div class="compare-pane">
              <div class="panel-head compare-pane-head">
                <div>
                  <h4>${displayText(selectedVersion?.label, "Selected Version")}</h4>
                  <p class="helper-copy">Current draft</p>
                </div>
                <div class="button-row">
                  <span class="meta-chip">${displayText(`Last edited ${formatDateTime(selectedVersion?.updatedAt)}`)}</span>
                  <span class="meta-chip">${selectedVersion?.estimatedMinutes || "-"} min</span>
                  <span class="meta-chip">${versionWordCount(selectedVersion)} words</span>
                </div>
              </div>
              <div class="notes-box compare-note-box" data-compare-state="${revisionNoteChanged ? "changed" : "same"}">
                <div class="panel-head">
                  <h4>Revision Note</h4>
                  <span class="meta-chip">${selectedVersion?.rehearsalBullets.length || 0} bullets</span>
                </div>
                <p class="body-copy">${displayText(selectedVersion?.revisionNote, "No revision note.")}</p>
              </div>
              <div class="script-box compare-script-box scroll-area">
                ${renderCompareBlocks(compareData?.selectedBlocks || [], "No speech body yet.")}
              </div>
            </div>
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderRunsTab(speech) {
  const deliveries = sortDeliveries(speech.deliveries);
  const selectedDelivery = getSelectedDeliveryForSpeech(speech);

  if (!deliveries.length) {
    return `
      <div class="card">
        <div class="panel-head">
          <h4>Runs</h4>
          <button class="primary-button" type="button" data-action="new-delivery">Log Run</button>
        </div>
        <div class="empty-state">No runs logged yet.</div>
      </div>
    `;
  }

  const feedback = selectedDelivery?.feedback || {
    whatWorked: "",
    whatMissed: "",
    learnings: "",
    evaluatorNotes: [],
    nextActions: [],
  };

  return `
    <div class="two-up">
      <div class="card">
        <div class="panel-head">
          <h4>Run Timeline</h4>
          <div class="button-row">
            <span class="meta-chip">${deliveries.length} runs</span>
            <button class="primary-button" type="button" data-action="new-delivery">Log Run</button>
          </div>
        </div>
        <div class="delivery-list">
          ${deliveries.map((delivery) => `
            <div class="delivery-card" data-selected="${String(selectedDelivery?.id === delivery.id)}">
              <button class="delivery-button" type="button" data-delivery-id="${delivery.id}">
                <div class="timeline-meta">
                  <span class="timeline-dot"></span>
                  <span>${formatDate(delivery.deliveredAt)}</span>
                  <span>${displayText(delivery.eventLevel)}</span>
                </div>
                <div class="delivery-title">${displayText(delivery.program)}</div>
                <p class="helper-copy">${displayText([delivery.location, delivery.city].filter(Boolean).join(", ") || delivery.speechStyle || "No location logged.")}${delivery.speechStyle ? ` · ${displayText(delivery.speechStyle, "")}` : ""}</p>
                <div class="meta-row">
                  <span class="meta-chip">${displayText(delivery.result)}</span>
                  <span class="meta-chip">${displayText(delivery.actualMinutes)}</span>
                </div>
              </button>
            </div>
          `).join("")}
        </div>
      </div>

      <div class="card">
        <div class="panel-head">
          <h4>Selected Run</h4>
          <div class="button-row">
            <span class="meta-chip">${displayText(selectedDelivery?.result)}</span>
            <button class="ghost-button" type="button" data-action="edit-delivery">Edit Run</button>
          </div>
        </div>
        <div class="info-grid" style="margin-bottom: 14px;">
          <div class="info-row">
            <strong>Version Used</strong>
            <span>${displayText(getVersionById(speech, selectedDelivery.versionId)?.label || selectedDelivery.versionId)}</span>
          </div>
          <div class="info-row">
            <strong>Date</strong>
            <span>${formatDate(selectedDelivery.deliveredAt)}</span>
          </div>
          <div class="info-row">
            <strong>Program / Level / Style</strong>
            <span>${displayText([selectedDelivery.program, selectedDelivery.eventLevel, selectedDelivery.speechStyle].filter(Boolean).join(" · "))}</span>
          </div>
          <div class="info-row">
            <strong>Location / Audience</strong>
            <span>${displayText([[selectedDelivery.location, selectedDelivery.city].filter(Boolean).join(", "), selectedDelivery.audience].filter(Boolean).join(" · "))}</span>
          </div>
          <div class="info-row">
            <strong>Actual Time</strong>
            <span>${displayText(selectedDelivery.actualMinutes)}</span>
          </div>
        </div>
        <div class="feedback-list">
          <div class="feedback-card">
            <strong>What Worked</strong>
            <p>${displayText(feedback.whatWorked)}</p>
          </div>
          <div class="feedback-card">
            <strong>What Missed</strong>
            <p>${displayText(feedback.whatMissed)}</p>
          </div>
          <div class="feedback-card">
            <strong>Learnings</strong>
            <p>${displayText(feedback.learnings)}</p>
          </div>
        </div>
        <div class="feedback-card" style="margin-top: 12px; margin-bottom: 12px;">
          <strong>Evaluator Notes</strong>
          <ul class="action-list">
            ${renderTextList(feedback.evaluatorNotes || [], "No evaluator notes yet.")}
          </ul>
        </div>
        <div class="feedback-card">
          <strong>Next Time</strong>
          <ul class="action-list">
            ${renderTextList(feedback.nextActions || [], "No next actions yet.")}
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderRehearsalTab(speech) {
  const version = getSelectedVersionForSpeech(speech);
  const bullets = version?.rehearsalBullets || [];
  const timing = getRehearsalTiming(version, bullets);
  const cues = timing.cues || [];
  const leftTitle = speech.status === "idea" ? "Idea Prompts" : "Rehearsal Bullets";
  const rightTitle = speech.status === "idea" ? "Prompt View" : "Fullscreen Rehearsal";
  const buttonLabel = speech.status === "idea"
    ? "Open Prompt View"
    : (getEffectiveRehearsalMode(timing) === "auto" ? "Start Timed Rehearsal" : "Start Fullscreen Rehearsal");
  const editLabel = speech.status === "idea" ? "Edit Note" : "Edit Bullets";
  const launchCopy = speech.status === "idea"
    ? "Open one prompt at a time in a clean fullscreen view."
    : "Open a larger cue card. Tap the right side to advance and the left side to go back.";
  const targetText = version ? `${version.estimatedMinutes} min` : "-";
  const cadenceText = timing.autoAvailable
    ? (timing.customDurationCount ? "Variable timing" : `${formatDurationLabel(timing.intervalMs / 1000)} / card`)
    : "Set target minutes";

  return `
    <div class="two-up rehearsal-layout">
      <div class="card rehearsal-card" data-tab-anchor="rehearsal-bullets">
        <div class="panel-head">
          <h4>${leftTitle}</h4>
          <span class="meta-chip">${bullets.length} bullets</span>
        </div>
        ${bullets.length ? `
          <div class="bullet-list rehearsal-bullet-list">
            ${cues.map((cue, index) => `
              <div class="bullet-card">
                <strong>Bullet ${String(index + 1).padStart(2, "0")}</strong>
                <p>${displayText(cue.text)}</p>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state rehearsal-empty-state">No rehearsal bullets added yet.</div>
        `}
      </div>

      <div class="card rehearsal-card rehearsal-launch-card">
        <div class="panel-head">
          <h4>${rightTitle}</h4>
          <span class="meta-chip">${version?.label || "No version"}</span>
        </div>
        <div class="rehearsal-pacing-panel">
          <div class="rehearsal-pacing-head">
            <div>
              <strong>Pacing</strong>
              <p class="helper-copy rehearsal-pacing-copy">${escapeHtml(getRehearsalTimingSummary(timing))}</p>
            </div>
            ${renderRehearsalModeToggle(timing)}
          </div>
        </div>
        <div class="rehearsal-launch-actions">
          <button class="script-button" type="button" data-action="edit-version-bullets">${editLabel}</button>
          <button class="primary-button rehearsal-launch-button" type="button" data-action="start-rehearsal">${buttonLabel}</button>
          <p class="helper-copy rehearsal-launch-copy">${launchCopy}</p>
        </div>
        <div class="info-grid">
          <div class="info-row">
            <strong>Version</strong>
            <span>${displayText(version?.label)}</span>
          </div>
          <div class="info-row">
            <strong>Bullets</strong>
            <span>${bullets.length}</span>
          </div>
          <div class="info-row">
            <strong>Target</strong>
            <span>${escapeHtml(targetText)}</span>
          </div>
          <div class="info-row">
            <strong>Cadence</strong>
            <span>${escapeHtml(cadenceText)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function setEditorStatus(text = "", tone = "") {
  elements.editorStatus.textContent = text;
  elements.editorStatus.dataset.tone = tone;
}

function focusEditorEntryPoint() {
  if (state.editor.entryPoint === "rehearsal-bullets") {
    const panel = elements.editorFields.querySelector("[data-collapse-key='rehearsal-bullets']");
    const bulletField = elements.editorFields.querySelector("textarea[name='rehearsalBullets']");

    if (panel instanceof HTMLDetailsElement) {
      panel.open = true;
      panel.scrollIntoView({ block: "start", inline: "nearest" });
    }

    if (bulletField instanceof HTMLTextAreaElement) {
      bulletField.focus({ preventScroll: true });
      const caret = bulletField.value.length;
      bulletField.setSelectionRange(caret, caret);
      return;
    }
  }

  elements.editorFields.querySelector("input, textarea, select")?.focus();
}

function setSaveButtonLabel(label, isBusy = false) {
  if (isBusy) {
    elements.saveEditorButton.innerHTML = `
      <span class="button-content">
        <span class="button-spinner" aria-hidden="true"></span>
        <span>${escapeHtml(label)}</span>
      </span>
    `;
    return;
  }

  elements.saveEditorButton.textContent = label;
}

function setEditorBusy(isBusy, busyLabel = "Saving...") {
  editorBusy = isBusy;
  elements.editorShell.dataset.busy = String(isBusy);

  Array.from(elements.editorForm.elements).forEach((field) => {
    field.disabled = isBusy;
  });

  elements.closeEditorButton.disabled = isBusy;
  elements.cancelEditorButton.disabled = isBusy;
  elements.deleteEditorButton.disabled = isBusy;
  elements.copyEditorButton.disabled = isBusy;

  if (isBusy) {
    setSaveButtonLabel(busyLabel, true);
    return;
  }

  setSaveButtonLabel(elements.saveEditorButton.dataset.defaultLabel || elements.saveEditorButton.textContent);
}

function openSpeechEditor({ speechId = null, statusPreset = "draft", sourceIdeaId = null } = {}) {
  state.editor = {
    open: true,
    kind: "speech",
    intent: speechId ? "edit" : "create",
    speechId,
    versionId: null,
    deliveryId: null,
    ideaId: null,
    playbookId: null,
    statusPreset,
    sourceVersionId: null,
    sourceIdeaId: sourceIdeaId || null,
    entryPoint: null,
  };

  renderEditor();
}

function openIdeaEditor({ ideaId = null } = {}) {
  const entry = ideaId ? getIdeaById(ideaId) : ensureIdeaSelection();

  state.editor = {
    open: true,
    kind: "idea",
    intent: ideaId ? "edit" : "create",
    speechId: null,
    versionId: null,
    deliveryId: null,
    ideaId: ideaId || null,
    playbookId: null,
    statusPreset: "draft",
    sourceVersionId: null,
    sourceIdeaId: null,
    entryPoint: null,
  };

  if (!ideaId && entry?.id) {
    state.selectedIdeaId = entry.id;
  }

  renderEditor();
}

function openVersionEditor({ speechId = null, versionId = null, entryPoint = null } = {}) {
  const speech = speechId ? getSpeechById(speechId) : ensureSelection();
  if (!speech) return;

  const selectedVersion = versionId
    ? getVersionById(speech, versionId)
    : getSelectedVersionForSpeech(speech);

  if (entryPoint === "rehearsal-bullets") {
    state.panels["rehearsal-bullets"] = true;
  }

  state.editor = {
    open: true,
    kind: "version",
    intent: versionId ? "edit" : "create",
    speechId: speech.id,
    versionId: versionId || null,
    deliveryId: null,
    ideaId: null,
    playbookId: null,
    statusPreset: speech.status,
    sourceVersionId: selectedVersion?.id || null,
    sourceIdeaId: null,
    entryPoint,
  };

  renderEditor();
}

function openDeliveryEditor({ speechId = null, deliveryId = null } = {}) {
  const speech = speechId ? getSpeechById(speechId) : ensureSelection();
  if (!speech) return;

  const selectedDelivery = deliveryId
    ? getDeliveryById(speech, deliveryId)
    : getSelectedDeliveryForSpeech(speech);

  state.editor = {
    open: true,
    kind: "delivery",
    intent: deliveryId ? "edit" : "create",
    speechId: speech.id,
    versionId: selectedDelivery?.versionId || getSelectedVersionForSpeech(speech)?.id || null,
    deliveryId: deliveryId || null,
    ideaId: null,
    playbookId: null,
    statusPreset: speech.status,
    sourceVersionId: null,
    sourceIdeaId: null,
    entryPoint: null,
  };

  renderEditor();
}

function openPlaybookEditor({ playbookId = null } = {}) {
  const entry = playbookId ? getPlaybookById(playbookId) : ensurePlaybookSelection();

  state.editor = {
    open: true,
    kind: "playbook",
    intent: playbookId ? "edit" : "create",
    speechId: null,
    versionId: null,
    deliveryId: null,
    ideaId: null,
    playbookId: playbookId || null,
    statusPreset: "draft",
    sourceVersionId: null,
    sourceIdeaId: null,
    entryPoint: null,
  };

  if (!playbookId && entry?.id) {
    state.selectedPlaybookId = entry.id;
  }

  renderEditor();
}

function closeEditor() {
  editorBusy = false;
  state.editor = {
    open: false,
    kind: null,
    intent: null,
    speechId: null,
    versionId: null,
    deliveryId: null,
    ideaId: null,
    playbookId: null,
    statusPreset: "draft",
    sourceVersionId: null,
    sourceIdeaId: null,
    entryPoint: null,
  };

  elements.editorShell.dataset.layout = "";
  elements.editorShell.hidden = true;
  elements.editorFields.innerHTML = "";
  elements.editorContextNote.textContent = "";
  elements.editorFooterNote.textContent = "";
  setSaveButtonLabel(elements.saveEditorButton.dataset.defaultLabel || elements.saveEditorButton.textContent);
  elements.deleteEditorButton.hidden = true;
  elements.deleteEditorButton.textContent = "Delete Speech";
  elements.copyEditorButton.hidden = true;
  elements.copyEditorButton.disabled = false;
  setEditorStatus("");
  document.body.classList.remove("drawer-open");
}

async function copyTextToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.setAttribute("readonly", "");
  helper.style.position = "fixed";
  helper.style.opacity = "0";
  helper.style.pointerEvents = "none";
  document.body.append(helper);
  helper.focus();
  helper.select();

  const copied = document.execCommand("copy");
  helper.remove();

  if (!copied) {
    throw new Error("Clipboard copy is not available in this browser.");
  }
}

function renderOptions(options, selectedValue) {
  return options.map((option) => `
    <option value="${escapeHtml(option.value)}" ${option.value === selectedValue ? "selected" : ""}>
      ${escapeHtml(option.label)}
    </option>
  `).join("");
}

function renderScriptTextSizeControl(label = "Script Text") {
  return `
    <label class="text-size-control">
      <span class="text-size-label">${escapeHtml(label)}</span>
      <input
        class="text-size-slider"
        type="range"
        min="${SCRIPT_TEXT_SIZE_MIN}"
        max="${SCRIPT_TEXT_SIZE_MAX}"
        step="1"
        value="${state.preferences.scriptTextSize}"
        data-script-text-size-input
        aria-label="Script text size"
      >
      <span class="meta-chip text-size-value" data-script-text-size-value>${state.preferences.scriptTextSize}px</span>
    </label>
  `;
}

function renderScriptLineHeightControl(label = "Line Spacing") {
  return `
    <label class="text-size-control">
      <span class="text-size-label">${escapeHtml(label)}</span>
      <input
        class="text-size-slider"
        type="range"
        min="${SCRIPT_LINE_HEIGHT_MIN}"
        max="${SCRIPT_LINE_HEIGHT_MAX}"
        step="${SCRIPT_LINE_HEIGHT_STEP}"
        value="${state.preferences.scriptLineHeight.toFixed(2)}"
        data-script-line-height-input
        aria-label="Script line spacing"
      >
      <span class="meta-chip text-size-value" data-script-line-height-value>${formatScriptLineHeightValue(state.preferences.scriptLineHeight)}</span>
    </label>
  `;
}

function renderScriptParagraphSpacingControl(label = "Paragraph Spacing") {
  return `
    <label class="text-size-control">
      <span class="text-size-label">${escapeHtml(label)}</span>
      <input
        class="text-size-slider"
        type="range"
        min="${SCRIPT_PARAGRAPH_SPACING_MIN}"
        max="${SCRIPT_PARAGRAPH_SPACING_MAX}"
        step="${SCRIPT_PARAGRAPH_SPACING_STEP}"
        value="${state.preferences.scriptParagraphSpacing.toFixed(2)}"
        data-script-paragraph-spacing-input
        aria-label="Script paragraph spacing"
      >
      <span class="meta-chip text-size-value" data-script-paragraph-spacing-value>${formatScriptParagraphSpacingValue(state.preferences.scriptParagraphSpacing)}</span>
    </label>
  `;
}

function renderScriptReadingControls(options = {}) {
  const { includeParagraphSpacing = true } = options;

  return `
    <div class="reading-controls">
      ${renderScriptTextSizeControl()}
      ${renderScriptLineHeightControl()}
      ${includeParagraphSpacing ? renderScriptParagraphSpacingControl() : ""}
    </div>
  `;
}

function renderPinnedPlaybookGuidance() {
  const pinnedEntries = getPinnedPlaybookEntries();

  if (!pinnedEntries.length) {
    return "";
  }

  return `
    <div class="editor-card">
      <div class="editor-card-head">
        <div>
          <h3>Playbook</h3>
          <p class="editor-card-copy">Pinned principles stay visible while you draft so the speech follows your best recurring lessons.</p>
        </div>
        <span class="meta-chip">${pinnedEntries.length} ${pinnedEntries.length === 1 ? "pinned principle" : "pinned principles"}</span>
      </div>
      <div class="playbook-guidance-grid">
        ${pinnedEntries.map((entry) => `
          <div class="playbook-guidance-card">
            <div class="meta-row">
              <span class="status-chip" data-status="pinned">Pinned</span>
              <span class="meta-chip">${displayText(entry.category || "Uncategorized")}</span>
            </div>
            <strong>${displayText(entry.title)}</strong>
            <p class="playbook-guidance-principle">${displayText(entry.principle)}</p>
            <p class="helper-copy">${displayText(excerpt(entry.whyItWorks || "Use this as a writing constraint while shaping the arc, tone, and emotional movement.", 150))}</p>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function renderScriptComposer({
  heading,
  copy,
  bodyId,
  bodyName,
  bodyValue,
  bulletsId,
  bulletsName,
  bulletValue,
  collapseKey = "rehearsal-bullets",
}) {
  const bulletCount = parseLineList(bulletValue).length;
  const panelOpen = isPanelOpen(collapseKey);

  return `
    <div class="editor-card">
      <div class="editor-card-head">
        <div>
          <h3>${escapeHtml(heading)}</h3>
          <p class="editor-card-copy">${escapeHtml(copy)}</p>
        </div>
      </div>
      <div class="field">
        <label for="${escapeHtml(bodyId)}">Speech Body</label>
        <textarea id="${escapeHtml(bodyId)}" name="${escapeHtml(bodyName)}" data-rich="true">${escapeHtml(bodyValue)}</textarea>
      </div>
    </div>

    <details class="collapse-card" data-collapse-key="${escapeHtml(collapseKey)}" ${panelOpen ? "open" : ""}>
      <summary class="collapse-summary">
        <div>
          <h4>Rehearsal Bullets</h4>
          <p class="collapse-summary-copy">Keep rehearsal prompts nearby without letting them compete with the draft.</p>
        </div>
        <div class="collapse-summary-meta">
          <span class="meta-chip">${bulletCount} ${bulletCount === 1 ? "bullet" : "bullets"}</span>
          <span class="meta-chip" data-collapse-label>${panelOpen ? "Collapse" : "Expand"}</span>
        </div>
      </summary>
      <div class="collapse-content">
        <div class="field">
          <label for="${escapeHtml(bulletsId)}">Rehearsal Bullets</label>
          <textarea id="${escapeHtml(bulletsId)}" name="${escapeHtml(bulletsName)}" data-bullets="true">${escapeHtml(bulletValue)}</textarea>
          <p class="field-hint">One bullet per line. Add a trailing //5s, //1m, or //1:30 to set an auto pacing duration for a cue.</p>
        </div>
      </div>
    </details>
  `;
}

function statusOptions(selectedValue) {
  return renderOptions([
    { value: "idea", label: "Idea" },
    { value: "draft", label: "Draft" },
    { value: "rehearsal_ready", label: "Rehearsal Ready" },
    { value: "delivered", label: "Delivered" },
  ], selectedValue);
}

function versionOptions(speech, selectedValue, includeBlank = false, excludeId = "") {
  const options = speech.versions
    .filter((version) => version.id !== excludeId)
    .map((version) => ({ value: version.id, label: version.label }));

  if (includeBlank) {
    options.unshift({ value: "", label: "None" });
  }

  return renderOptions(options, selectedValue);
}

function speechEditorConfig(speech) {
  const isEdit = state.editor.intent === "edit";
  const sourceIdea = !isEdit && state.editor.sourceIdeaId ? getIdeaById(state.editor.sourceIdeaId) : null;
  const activeVersion = getSelectedVersionForSpeech(speech);
  const statusValue = isEdit ? speech.status : state.editor.statusPreset;
  const versionLabel = isEdit ? "" : defaultVersionLabel(statusValue);
  const initialTitle = isEdit ? speech.title : (sourceIdea?.title || "");
  const initialGoal = isEdit ? speech.goal : "";
  const initialTags = isEdit ? speech.tags.join(", ") : (sourceIdea?.tags.join(", ") || "");
  const initialCoreIdea = isEdit ? speech.coreIdea : (sourceIdea?.idea || "");
  const initialNotes = isEdit ? speech.notes : "";
  const initialMinutes = statusValue === "idea" ? "" : "5";
  const initialRevisionNote = sourceIdea
    ? "Expand the seed into a first full draft without losing the original spark."
    : (statusValue === "idea" ? "Capture the exact scene before writing the speech body." : "Build the first full pass, then tighten the opening and ending.");
  const footer = isEdit
    ? "Metadata and direction save here. Script and bullets live in Edit Script."
    : "Creating a speech also creates the first version so you can start writing immediately.";

  return {
    layout: "studio",
    modeLabel: isEdit ? "Edit Meta" : "New Speech",
    title: isEdit ? speech.title : (sourceIdea ? `New Speech from ${sourceIdea.title}` : (statusValue === "idea" ? "New Idea" : "New Speech")),
    context: isEdit
      ? `${speech.versions.length} versions · ${speech.deliveries.length} runs`
      : (sourceIdea
        ? "Start a real speech from this lightweight idea seed."
        : (statusValue === "idea" ? "Capture the speech before it becomes a draft." : "Start a new speech with the first version already attached.")),
    footer,
    dismissLabel: "Back to Workspace",
    saveLabel: isEdit ? "Save Speech" : "Create Speech",
    fields: `
      <div class="studio-layout">
        ${sourceIdea ? `
          <div class="editor-card">
            <div class="editor-card-head">
              <div>
                <h3>Source Idea</h3>
                <p class="editor-card-copy">This seed stays lightweight in Ideas while you turn it into a full speech here.</p>
              </div>
              <span class="meta-chip">${ideaWordCount(sourceIdea)} words</span>
            </div>
            <div class="notes-box">
              ${renderScriptBodyText(sourceIdea.idea, "No source idea note yet.")}
            </div>
          </div>
        ` : ""}

        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <h3>Speech Settings</h3>
              <p class="editor-card-copy">Title, status, tags, and the direction for this speech.</p>
            </div>
            ${isEdit ? `<span class="meta-chip">${speech.versions.length} versions · ${speech.deliveries.length} runs</span>` : ""}
          </div>
          <div class="editor-grid">
            <div class="field">
              <label for="speechTitleInput">Title</label>
              <input id="speechTitleInput" name="title" type="text" value="${escapeHtml(initialTitle)}" required>
            </div>
            <div class="field">
              <label for="speechStatusSelect">Status</label>
              <select id="speechStatusSelect" name="status">
                ${statusOptions(statusValue)}
              </select>
            </div>
            <div class="field" data-span="full">
              <label for="speechGoalInput">Goal</label>
              <input id="speechGoalInput" name="goal" type="text" value="${escapeHtml(initialGoal)}">
            </div>
            <div class="field" data-span="full">
              <label for="speechTagsInput">Tags</label>
              <input id="speechTagsInput" name="tags" type="text" value="${escapeHtml(initialTags)}">
            </div>
            ${isEdit ? `
              <div class="field" data-span="full">
                <label for="activeVersionSelect">Active Version</label>
                <select id="activeVersionSelect" name="activeVersionId">
                  ${versionOptions(speech, speech.activeVersionId || activeVersion?.id || "")}
                </select>
              </div>
            ` : ""}
          </div>
        </div>

        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <h3>Direction</h3>
              <p class="editor-card-copy">Keep the core idea and the next move visible while you write.</p>
            </div>
            <span class="meta-chip">${statusValue === "idea" ? "Idea" : "Speech"}</span>
          </div>
          <div class="editor-grid">
            <div class="field" data-span="full">
              <label for="speechIdeaInput">Core Idea</label>
              <textarea id="speechIdeaInput" name="coreIdea" data-compact="true">${escapeHtml(initialCoreIdea)}</textarea>
            </div>
            <div class="field" data-span="full">
              <label for="speechNotesInput">Next Move</label>
              <textarea id="speechNotesInput" name="notes" data-compact="true">${escapeHtml(initialNotes)}</textarea>
            </div>
          </div>
        </div>

        ${isEdit ? "" : `
          <div class="editor-card">
            <div class="editor-card-head">
              <div>
                <h3>First Version</h3>
                <p class="editor-card-copy">Set the label, timing, and revision note before you move into the script.</p>
              </div>
            </div>
            <div class="editor-grid">
              <div class="field">
                <label for="versionLabelInput">Version Label</label>
                <input id="versionLabelInput" name="versionLabel" type="text" value="${escapeHtml(versionLabel)}">
              </div>
              <div class="field">
                <label for="estimatedMinutesInput">Target Minutes</label>
                <input id="estimatedMinutesInput" name="estimatedMinutes" type="number" min="0" step="1" value="${initialMinutes}">
              </div>
              <div class="field" data-span="full">
                <label for="revisionNoteInput">Revision Note</label>
                <textarea id="revisionNoteInput" name="revisionNote" data-compact="true">${escapeHtml(initialRevisionNote)}</textarea>
              </div>
            </div>
          </div>

          ${renderPinnedPlaybookGuidance()}

          ${renderScriptComposer({
            heading: "Speech Body",
            copy: "Give the draft the full width. Rehearsal bullets stay below in a collapsible panel.",
            bodyId: "speechBodyInput",
            bodyName: "speechBody",
            bodyValue: "",
            bulletsId: "rehearsalBulletsInput",
            bulletsName: "rehearsalBullets",
            bulletValue: statusValue === "idea" ? "Scene\nLine worth keeping\nWhat the audience should feel" : "",
          })}
        `}
      </div>
    `,
  };
}

function versionEditorConfig(speech, version) {
  const isEdit = state.editor.intent === "edit";
  const sourceVersion = isEdit
    ? version
    : getVersionById(speech, state.editor.sourceVersionId) || getSelectedVersionForSpeech(speech);

  const labelValue = isEdit
    ? version.label
    : `${sourceVersion?.label || "Version"} Next`;
  const revisionValue = isEdit
    ? version.revisionNote
    : (sourceVersion?.revisionNote || "");
  const bodyValue = isEdit
    ? version.speechBody
    : (sourceVersion?.speechBody || "");
  const bulletValue = isEdit
    ? linesToText(version.rehearsalBullets)
    : linesToText(sourceVersion?.rehearsalBullets || []);
  const basedOnValue = isEdit ? (version.basedOn || "") : (sourceVersion?.id || "");

  return {
    layout: "studio",
    modeLabel: isEdit ? "Edit Script" : "New Version",
    title: isEdit ? version.label : `New Version for ${speech.title}`,
    context: `${speech.title} · ${speech.versions.length} versions in library`,
    footer: isEdit
      ? "Saving here updates the selected version and keeps it active."
      : "New versions are created from the selected version and made active immediately.",
    dismissLabel: "Back to Workspace",
    saveLabel: isEdit ? "Save Version" : "Create Version",
    fields: `
      <div class="studio-layout">
        <div class="editor-card">
          <div class="editor-card-head">
            <div>
              <h3>Version Structure</h3>
              <p class="editor-card-copy">Treat the version like a writing studio, not a form.</p>
            </div>
            <span class="meta-chip">${isEdit ? "Active version" : "New version"}</span>
          </div>
          <div class="editor-grid">
            <div class="field">
              <label for="versionLabelInput">Version Label</label>
              <input id="versionLabelInput" name="label" type="text" value="${escapeHtml(labelValue)}" required>
            </div>
            <div class="field">
              <label for="versionMinutesInput">Target Minutes</label>
              <input id="versionMinutesInput" name="estimatedMinutes" type="number" min="0" step="1" value="${escapeHtml(String(isEdit ? version.estimatedMinutes : (sourceVersion?.estimatedMinutes || "")))}">
            </div>
            <div class="field" data-span="full">
              <label for="basedOnVersionSelect">Based On</label>
              <select id="basedOnVersionSelect" name="basedOn">
                ${versionOptions(speech, basedOnValue, true, isEdit ? version.id : "")}
              </select>
            </div>
            <div class="field" data-span="full">
              <label for="versionRevisionInput">Revision Note</label>
              <textarea id="versionRevisionInput" name="revisionNote" data-compact="true">${escapeHtml(revisionValue)}</textarea>
            </div>
          </div>
        </div>

        ${renderPinnedPlaybookGuidance()}

        ${renderScriptComposer({
          heading: "Speech Body",
          copy: "Keep the writing surface full-width. Rehearsal bullets are available below when you need cue edits.",
          bodyId: "versionBodyInput",
          bodyName: "speechBody",
          bodyValue,
          bulletsId: "versionBulletsInput",
          bulletsName: "rehearsalBullets",
          bulletValue,
        })}
      </div>
    `,
  };
}

function deliveryEditorConfig(speech, delivery) {
  const isEdit = state.editor.intent === "edit";
  const selectedVersion = getSelectedVersionForSpeech(speech);
  const currentDelivery = isEdit ? delivery : null;

  return {
    layout: "drawer",
    modeLabel: isEdit ? "Edit Run" : "Log Run",
    title: isEdit ? `${speech.title} Run` : `Log Run for ${speech.title}`,
    context: isEdit
      ? `${formatDate(currentDelivery.deliveredAt)} · ${currentDelivery.location}, ${currentDelivery.city}`
      : "Capture the run, feedback, and next actions right after the speech.",
    footer: "Run edits update the timeline, feedback, and selected speech state together.",
    dismissLabel: "Cancel",
    saveLabel: isEdit ? "Save Run" : "Add Run",
    fields: `
      <div class="editor-card">
        <h3>Run Details</h3>
        <div class="editor-grid">
          <div class="field">
            <label for="deliveryVersionSelect">Version Used</label>
            <select id="deliveryVersionSelect" name="versionId">
              ${versionOptions(speech, currentDelivery?.versionId || selectedVersion?.id || "")}
            </select>
          </div>
          <div class="field">
            <label for="deliveryDateInput">Date</label>
            <input id="deliveryDateInput" name="deliveredAt" type="date" value="${escapeHtml(currentDelivery?.deliveredAt || todayIso())}">
          </div>
          <div class="field">
            <label for="deliveryLocationInput">Location</label>
            <input id="deliveryLocationInput" name="location" type="text" value="${escapeHtml(currentDelivery?.location || "")}">
          </div>
          <div class="field">
            <label for="deliveryCityInput">City</label>
            <input id="deliveryCityInput" name="city" type="text" value="${escapeHtml(currentDelivery?.city || "")}">
          </div>
          <div class="field">
            <label for="deliveryProgramInput">Program</label>
            <input id="deliveryProgramInput" name="program" type="text" value="${escapeHtml(currentDelivery?.program || "")}">
          </div>
          <div class="field">
            <label for="deliveryLevelInput">Level</label>
            <input id="deliveryLevelInput" name="eventLevel" type="text" value="${escapeHtml(currentDelivery?.eventLevel || "")}">
          </div>
          <div class="field">
            <label for="deliveryStyleInput">Style</label>
            <input id="deliveryStyleInput" name="speechStyle" type="text" value="${escapeHtml(currentDelivery?.speechStyle || "")}">
          </div>
          <div class="field">
            <label for="deliveryAudienceInput">Audience</label>
            <input id="deliveryAudienceInput" name="audience" type="text" value="${escapeHtml(currentDelivery?.audience || "")}">
          </div>
          <div class="field">
            <label for="deliveryResultInput">Result</label>
            <input id="deliveryResultInput" name="result" type="text" value="${escapeHtml(currentDelivery?.result || "")}">
          </div>
          <div class="field">
            <label for="deliveryMinutesInput">Actual Minutes</label>
            <input id="deliveryMinutesInput" name="actualMinutes" type="text" value="${escapeHtml(currentDelivery?.actualMinutes || "")}">
          </div>
        </div>
      </div>

      <div class="editor-card">
        <h3>Feedback + Next Time</h3>
        <div class="editor-grid">
          <div class="field" data-span="full">
            <label for="workedInput">What Worked</label>
            <textarea id="workedInput" name="whatWorked" data-compact="true">${escapeHtml(currentDelivery?.feedback?.whatWorked || "")}</textarea>
          </div>
          <div class="field" data-span="full">
            <label for="missedInput">What Missed</label>
            <textarea id="missedInput" name="whatMissed" data-compact="true">${escapeHtml(currentDelivery?.feedback?.whatMissed || "")}</textarea>
          </div>
          <div class="field" data-span="full">
            <label for="learningsInput">Learnings</label>
            <textarea id="learningsInput" name="learnings" data-compact="true">${escapeHtml(currentDelivery?.feedback?.learnings || "")}</textarea>
          </div>
          <div class="field" data-span="full">
            <label for="evaluatorNotesInput">Evaluator Notes</label>
            <textarea id="evaluatorNotesInput" name="evaluatorNotes">${escapeHtml(linesToText(currentDelivery?.feedback?.evaluatorNotes || []))}</textarea>
          </div>
          <div class="field" data-span="full">
            <label for="nextActionsInput">Next Actions</label>
            <textarea id="nextActionsInput" name="nextActions">${escapeHtml(linesToText(currentDelivery?.feedback?.nextActions || []))}</textarea>
          </div>
        </div>
      </div>
    `,
  };
}

function ideaEditorConfig(entry) {
  const isEdit = state.editor.intent === "edit";
  const linkedSpeech = entry?.expandedSpeechId ? getSpeechById(entry.expandedSpeechId) : null;

  return {
    layout: isEdit ? "drawer" : "modal",
    modeLabel: isEdit ? "Edit Idea" : "New Idea",
    title: isEdit ? entry.title : "New Idea",
    context: isEdit
      ? (linkedSpeech ? `Linked to ${linkedSpeech.title} · Last edited ${formatDateTime(entry.updatedAt)}` : `Last edited ${formatDateTime(entry.updatedAt)}`)
      : "Capture the idea before it turns into a full speech.",
    footer: linkedSpeech
      ? "This stays a lightweight seed even after you expand it into a speech."
      : "Keep this small. Expand it into a speech only when you are ready for versions, rehearsal, and runs.",
    dismissLabel: "Back to Workspace",
    saveLabel: isEdit ? "Save Idea" : "Create Idea",
    fields: `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <h3>Idea Settings</h3>
            <p class="editor-card-copy">Name the seed and tag it so you can find it later.</p>
          </div>
          ${isEdit ? `<span class="meta-chip">${linkedSpeech ? "Expanded" : "Open"}</span>` : ""}
        </div>
        <div class="editor-grid">
          <div class="field">
            <label for="ideaTitleInput">Title</label>
            <input id="ideaTitleInput" name="title" type="text" value="${escapeHtml(entry?.title || "")}" required>
          </div>
          <div class="field">
            <label for="ideaTagsInput">Tags</label>
            <input id="ideaTagsInput" name="tags" type="text" value="${escapeHtml((entry?.tags || []).join(", "))}">
          </div>
        </div>
      </div>

      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <h3>Idea Note</h3>
            <p class="editor-card-copy">Store the thought exactly as you want to encounter it later.</p>
          </div>
          ${isEdit ? `<span class="meta-chip">${ideaWordCount(entry)} words</span>` : ""}
        </div>
        <div class="field">
          <label for="ideaBodyInput">Idea</label>
          <textarea id="ideaBodyInput" name="idea" data-rich="true">${escapeHtml(entry?.idea || "")}</textarea>
        </div>
      </div>
    `,
  };
}

function yesNoOptions(selectedValue) {
  return renderOptions([
    { value: "true", label: "Pinned in writing" },
    { value: "false", label: "Playbook only" },
  ], selectedValue);
}

function playbookEditorConfig(entry) {
  const isEdit = state.editor.intent === "edit";

  return {
    layout: "drawer",
    modeLabel: isEdit ? "Edit Principle" : "New Principle",
    title: isEdit ? entry.title : "New Playbook Principle",
    context: isEdit
      ? `${entry.category || "Uncategorized"} · Last edited ${formatDateTime(entry.updatedAt)}`
      : "Capture a reusable speaking principle so it can guide future drafts.",
    footer: "Pinned principles show up in the script-writing editors as live drafting guidance.",
    dismissLabel: "Back to Workspace",
    saveLabel: isEdit ? "Save Principle" : "Create Principle",
    fields: `
      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <h3>Principle Settings</h3>
            <p class="editor-card-copy">Name the lesson, categorize it, and decide whether it should stay visible while you write.</p>
          </div>
          ${isEdit ? `<span class="meta-chip">${entry.pinned ? "Pinned in writing" : "Playbook only"}</span>` : ""}
        </div>
        <div class="editor-grid">
          <div class="field">
            <label for="playbookTitleInput">Title</label>
            <input id="playbookTitleInput" name="title" type="text" value="${escapeHtml(entry?.title || "")}" required>
          </div>
          <div class="field">
            <label for="playbookCategoryInput">Category</label>
            <input id="playbookCategoryInput" name="category" type="text" value="${escapeHtml(entry?.category || "")}">
          </div>
          <div class="field" data-span="full">
            <label for="playbookTagsInput">Tags</label>
            <input id="playbookTagsInput" name="tags" type="text" value="${escapeHtml((entry?.tags || []).join(", "))}">
          </div>
          <div class="field" data-span="full">
            <label for="playbookPinnedSelect">Visibility While Writing</label>
            <select id="playbookPinnedSelect" name="pinned">
              ${yesNoOptions(entry?.pinned ? "true" : "false")}
            </select>
          </div>
        </div>
      </div>

      <div class="editor-card">
        <div class="editor-card-head">
          <div>
            <h3>Reusable Lesson</h3>
            <p class="editor-card-copy">Write the principle exactly as you want to see it during drafting.</p>
          </div>
        </div>
        <div class="field">
          <label for="playbookPrincipleInput">Principle</label>
          <textarea id="playbookPrincipleInput" name="principle" data-compact="true">${escapeHtml(entry?.principle || "")}</textarea>
        </div>
        <div class="field">
          <label for="playbookWhyInput">Why It Works</label>
          <textarea id="playbookWhyInput" name="whyItWorks" data-compact="true">${escapeHtml(entry?.whyItWorks || "")}</textarea>
        </div>
      </div>
    `,
  };
}

function renderEditor() {
  const ideaEntry = getIdeaById(state.editor.ideaId);
  const speech = getSpeechById(state.editor.speechId);
  const version = speech
    ? getVersionById(speech, state.editor.versionId || state.editor.sourceVersionId)
    : null;
  const delivery = speech ? getDeliveryById(speech, state.editor.deliveryId) : null;
  const playbookEntry = getPlaybookById(state.editor.playbookId);

  let config = null;

  if (state.editor.kind === "idea" && (state.editor.intent === "create" || ideaEntry)) {
    config = ideaEditorConfig(ideaEntry);
  } else if (state.editor.kind === "speech" && (state.editor.intent === "create" || speech)) {
    config = speechEditorConfig(speech);
  } else if (state.editor.kind === "version" && speech && (state.editor.intent === "create" || version)) {
    config = versionEditorConfig(speech, version);
  } else if (state.editor.kind === "delivery" && speech && (state.editor.intent === "create" || delivery)) {
    config = deliveryEditorConfig(speech, delivery);
  } else if (state.editor.kind === "playbook" && (state.editor.intent === "create" || playbookEntry)) {
    config = playbookEditorConfig(playbookEntry);
  }

  if (!config) {
    closeEditor();
    return;
  }

  elements.editorModeLabel.textContent = config.modeLabel;
  elements.editorTitle.textContent = config.title;
  elements.editorContextNote.textContent = config.context;
  elements.editorFooterNote.textContent = config.footer;
  elements.editorShell.dataset.layout = config.layout || "drawer";
  elements.closeEditorButton.textContent = config.dismissLabel || "Cancel";
  elements.cancelEditorButton.textContent = config.dismissLabel || "Close";
  elements.saveEditorButton.dataset.defaultLabel = config.saveLabel;
  setSaveButtonLabel(config.saveLabel);
  elements.editorFields.innerHTML = config.fields;
  setEditorStatus("");
  elements.editorShell.hidden = false;
  document.body.classList.add("drawer-open");
  setEditorBusy(false);
  syncScriptTextSizeControls(elements.editorShell);
  syncScriptLineHeightControls(elements.editorShell);
  syncScriptParagraphSpacingControls(elements.editorShell);
  scheduleAutoSizeRichTextareas(elements.editorShell);

  const showIdeaDelete = state.editor.kind === "idea" && state.editor.intent === "edit" && Boolean(ideaEntry);
  const showSpeechDelete = state.editor.kind === "speech" && state.editor.intent === "edit" && Boolean(speech);
  const showPlaybookDelete = state.editor.kind === "playbook" && state.editor.intent === "edit" && Boolean(playbookEntry);
  const showScriptCopy = state.editor.kind === "version";
  elements.deleteEditorButton.hidden = !(showIdeaDelete || showSpeechDelete || showPlaybookDelete);
  elements.deleteEditorButton.textContent = showPlaybookDelete
    ? "Delete Principle"
    : (showIdeaDelete ? "Delete Idea" : (speech?.status === "idea" ? "Delete Idea" : "Delete Speech"));
  elements.copyEditorButton.hidden = !showScriptCopy;
  elements.copyEditorButton.textContent = "Copy Speech";

  requestAnimationFrame(() => {
    focusEditorEntryPoint();
  });
}

async function copyEditorSpeechBody() {
  if (editorBusy || state.editor.kind !== "version") {
    return;
  }

  const bodyField = elements.editorFields.querySelector("textarea[data-rich='true']");
  const text = multilineText(bodyField?.value || "");

  if (!text) {
    setEditorStatus("Nothing to copy yet.", "warn");
    return;
  }

  const originalLabel = elements.copyEditorButton.textContent;
  elements.copyEditorButton.disabled = true;
  elements.copyEditorButton.textContent = "Copying...";

  try {
    await copyTextToClipboard(text);
    setEditorStatus("Speech copied to clipboard.", "ok");
  } catch (error) {
    setEditorStatus(error.message || "Could not copy the speech.", "error");
  } finally {
    elements.copyEditorButton.disabled = false;
    elements.copyEditorButton.textContent = originalLabel;
  }
}

async function saveIdea(formData) {
  const isEdit = state.editor.intent === "edit";
  const title = cleanText(formData.get("title"));
  const idea = multilineText(formData.get("idea"));

  if (!title) {
    setEditorStatus("Title is required.", "error");
    return;
  }

  if (!idea) {
    setEditorStatus("Idea text is required.", "error");
    return;
  }

  const payload = {
    title,
    idea,
    tags: parseTagList(formData.get("tags")),
  };

  try {
    let savedIdeaId = state.editor.ideaId;

    if (isEdit) {
      const entry = getIdeaById(state.editor.ideaId);
      if (!entry) return;

      const { error } = await db
        .from("brajesh_speech_ideas")
        .update(payload)
        .eq("id", entry.id);

      if (error) throw error;
      savedIdeaId = entry.id;
    } else {
      const { data, error } = await db
        .from("brajesh_speech_ideas")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      savedIdeaId = data.id;
    }

    state.selectedIdeaId = savedIdeaId;
    state.workspaceView = "ideas";
    closeEditor();
    await loadSpeeches({ silent: true });
    setPageStatus(isEdit ? "Idea saved." : "Idea created.", "ok");
  } catch (error) {
    reportEditorError(error.message || "Could not save that idea.");
  }
}

async function saveSpeech(formData) {
  const isEdit = state.editor.intent === "edit";
  const title = cleanText(formData.get("title"));
  if (!title) {
    setEditorStatus("Title is required.", "error");
    return;
  }

  const status = cleanText(formData.get("status")) || state.editor.statusPreset || "draft";
  const goal = cleanText(formData.get("goal"));
  const tags = parseTagList(formData.get("tags"));
  const coreIdea = multilineText(formData.get("coreIdea"));
  const notes = multilineText(formData.get("notes"));
  const speechPayload = {
    title,
    status,
    goal,
    core_idea: coreIdea,
    tags,
    notes,
  };

  try {
    if (isEdit) {
      const speech = getSpeechById(state.editor.speechId);
      if (!speech) return;

      const activeVersionId = cleanText(formData.get("activeVersionId"));
      const { error } = await db
        .from("brajesh_speeches")
        .update({
          ...speechPayload,
          active_version_id: activeVersionId || speech.activeVersionId || null,
        })
        .eq("id", speech.id);

      if (error) throw error;

      state.selectedSpeechId = speech.id;
      state.selectedVersionId = activeVersionId || speech.activeVersionId || state.selectedVersionId;
    } else {
      const versionLabel = cleanText(formData.get("versionLabel")) || defaultVersionLabel(status);
      const versionPayload = {
        label: versionLabel,
        based_on_version_id: null,
        estimated_minutes: parseMinutes(formData.get("estimatedMinutes")),
        revision_note: multilineText(formData.get("revisionNote")),
        speech_body: multilineText(formData.get("speechBody")),
        rehearsal_bullets: parseLineList(formData.get("rehearsalBullets")),
      };

      const { data: speechRow, error: speechError } = await db
        .from("brajesh_speeches")
        .insert(speechPayload)
        .select("id")
        .single();

      if (speechError) throw speechError;

      const { data: versionRow, error: versionError } = await db
        .from("brajesh_speech_versions")
        .insert({
          speech_id: speechRow.id,
          ...versionPayload,
        })
        .select("id")
        .single();

      if (versionError) throw versionError;

      const { error: updateSpeechError } = await db
        .from("brajesh_speeches")
        .update({ active_version_id: versionRow.id })
        .eq("id", speechRow.id);

      if (updateSpeechError) throw updateSpeechError;

      if (state.editor.sourceIdeaId) {
        const { error: linkIdeaError } = await db
          .from("brajesh_speech_ideas")
          .update({ expanded_speech_id: speechRow.id })
          .eq("id", state.editor.sourceIdeaId);

        if (linkIdeaError) throw linkIdeaError;
      }

      state.workspaceView = "speeches";
      state.selectedSpeechId = speechRow.id;
      state.selectedVersionId = versionRow.id;
      state.selectedDeliveryId = null;
      state.tab = "overview";
    }

    closeEditor();
    await loadSpeeches({ silent: true });
    setPageStatus(isEdit ? "Speech metadata saved." : "Speech created.", "ok");
  } catch (error) {
    reportEditorError(error.message || "Could not save that speech.");
  }
}

async function saveVersion(formData) {
  const isEdit = state.editor.intent === "edit";
  const speech = getSpeechById(state.editor.speechId);
  if (!speech) return;
  const returnToBullets = state.editor.entryPoint === "rehearsal-bullets";

  const label = cleanText(formData.get("label"));
  if (!label) {
    setEditorStatus("Version label is required.", "error");
    return;
  }

  const basedOn = cleanText(formData.get("basedOn"));
  const estimatedMinutes = parseMinutes(formData.get("estimatedMinutes"));
  const revisionNote = multilineText(formData.get("revisionNote"));
  const speechBody = multilineText(formData.get("speechBody"));
  const rehearsalBullets = parseLineList(formData.get("rehearsalBullets"));

  const versionPayload = {
    label,
    based_on_version_id: basedOn || null,
    estimated_minutes: estimatedMinutes,
    revision_note: revisionNote,
    speech_body: speechBody,
    rehearsal_bullets: rehearsalBullets,
  };

  try {
    let savedVersionId = state.editor.versionId;

    if (isEdit) {
      const version = getVersionById(speech, state.editor.versionId);
      if (!version) return;

      const { error } = await db
        .from("brajesh_speech_versions")
        .update(versionPayload)
        .eq("id", version.id);

      if (error) throw error;
      savedVersionId = version.id;
    } else {
      const { data, error } = await db
        .from("brajesh_speech_versions")
        .insert({
          speech_id: speech.id,
          ...versionPayload,
        })
        .select("id")
        .single();

      if (error) throw error;
      savedVersionId = data.id;
    }

    const { error: speechError } = await db
      .from("brajesh_speeches")
      .update({ active_version_id: savedVersionId })
      .eq("id", speech.id);

    if (speechError) throw speechError;

    state.selectedSpeechId = speech.id;
    state.selectedVersionId = savedVersionId;
    state.tab = returnToBullets ? "rehearsal" : "versions";
    closeEditor();
    await loadSpeeches({ silent: true });
    if (returnToBullets) {
      scrollTabAnchorIntoView("rehearsal-bullets");
    }
    setPageStatus(isEdit ? "Script saved." : "New version created.", "ok");
  } catch (error) {
    reportEditorError(error.message || "Could not save that version.");
  }
}

async function saveDelivery(formData) {
  const isEdit = state.editor.intent === "edit";
  const speech = getSpeechById(state.editor.speechId);
  if (!speech) return;

  const versionId = cleanText(formData.get("versionId")) || getSelectedVersionForSpeech(speech)?.id || "";
  if (!versionId || !getVersionById(speech, versionId)) {
    setEditorStatus("Choose a version for this delivery.", "error");
    return;
  }

  const deliveryRecord = {
    speech_id: speech.id,
    version_id: versionId,
    delivered_at: cleanText(formData.get("deliveredAt")) || null,
    location: cleanText(formData.get("location")),
    city: cleanText(formData.get("city")),
    program: cleanText(formData.get("program")),
    event_level: cleanText(formData.get("eventLevel")),
    speech_style: cleanText(formData.get("speechStyle")),
    audience: cleanText(formData.get("audience")),
    result: cleanText(formData.get("result")) || "Delivered",
    actual_minutes: cleanText(formData.get("actualMinutes")) || "-",
    what_worked: multilineText(formData.get("whatWorked")),
    what_missed: multilineText(formData.get("whatMissed")),
    learnings: multilineText(formData.get("learnings")),
    evaluator_notes: parseLineList(formData.get("evaluatorNotes")),
    next_actions: parseLineList(formData.get("nextActions")),
  };

  try {
    let savedRunId = state.editor.deliveryId;

    if (isEdit) {
      const { error } = await db
        .from("brajesh_speech_runs")
        .update(deliveryRecord)
        .eq("id", state.editor.deliveryId);

      if (error) throw error;
    } else {
      const { data, error } = await db
        .from("brajesh_speech_runs")
        .insert(deliveryRecord)
        .select("id")
        .single();

      if (error) throw error;
      savedRunId = data.id;
    }

    if (speech.status !== "idea" && String(deliveryRecord.result || "").toLowerCase() !== "scheduled") {
      const { error: speechError } = await db
        .from("brajesh_speeches")
        .update({ status: "delivered" })
        .eq("id", speech.id);

      if (speechError) throw speechError;
    }

    state.selectedSpeechId = speech.id;
    state.selectedVersionId = versionId;
    state.selectedDeliveryId = savedRunId;
    state.tab = "runs";
    closeEditor();
    await loadSpeeches({ silent: true });
    setPageStatus(isEdit ? "Run saved." : "Run logged.", "ok");
  } catch (error) {
    reportEditorError(error.message || "Could not save that run.");
  }
}

async function savePlaybookEntry(formData) {
  const isEdit = state.editor.intent === "edit";
  const title = cleanText(formData.get("title"));
  const principle = multilineText(formData.get("principle"));

  if (!title) {
    setEditorStatus("Title is required.", "error");
    return;
  }

  if (!principle) {
    setEditorStatus("Principle text is required.", "error");
    return;
  }

  const payload = {
    title,
    category: cleanText(formData.get("category")),
    tags: parseTagList(formData.get("tags")),
    pinned: cleanText(formData.get("pinned")) === "true",
    principle,
    why_it_works: multilineText(formData.get("whyItWorks")),
  };

  try {
    let savedEntryId = state.editor.playbookId;

    if (isEdit) {
      const entry = getPlaybookById(state.editor.playbookId);
      if (!entry) return;

      const { error } = await db
        .from("brajesh_speech_playbook")
        .update(payload)
        .eq("id", entry.id);

      if (error) throw error;
      savedEntryId = entry.id;
    } else {
      const { data, error } = await db
        .from("brajesh_speech_playbook")
        .insert(payload)
        .select("id")
        .single();

      if (error) throw error;
      savedEntryId = data.id;
    }

    state.selectedPlaybookId = savedEntryId;
    state.workspaceView = "playbook";
    closeEditor();
    await loadSpeeches({ silent: true });
    setPageStatus(isEdit ? "Playbook principle saved." : "Playbook principle created.", "ok");
  } catch (error) {
    reportEditorError(error.message || "Could not save that playbook principle.");
  }
}

async function saveEditor(event) {
  event.preventDefault();
  if (editorBusy) {
    return;
  }

  const formData = new FormData(elements.editorForm);
  const busyLabel = state.editor.kind === "delivery"
    ? (state.editor.intent === "edit" ? "Saving Run..." : "Logging Run...")
    : state.editor.kind === "version"
      ? (state.editor.intent === "edit" ? "Saving Script..." : "Creating Version...")
      : state.editor.kind === "idea"
        ? (state.editor.intent === "edit" ? "Saving Idea..." : "Creating Idea...")
      : state.editor.kind === "playbook"
        ? (state.editor.intent === "edit" ? "Saving Principle..." : "Creating Principle...")
      : (state.editor.intent === "edit" ? "Saving Speech..." : "Creating Speech...");

  setEditorBusy(true, busyLabel);
  setEditorStatus(busyLabel, "ok");

  try {
    if (state.editor.kind === "idea") {
      await saveIdea(formData);
      return;
    }

    if (state.editor.kind === "speech") {
      await saveSpeech(formData);
      return;
    }

    if (state.editor.kind === "version") {
      await saveVersion(formData);
      return;
    }

    if (state.editor.kind === "delivery") {
      await saveDelivery(formData);
      return;
    }

    if (state.editor.kind === "playbook") {
      await savePlaybookEntry(formData);
    }
  } finally {
    if (!elements.editorShell.hidden) {
      setEditorBusy(false);
    }
  }
}

async function deleteIdeaEntry(ideaId = state.editor.ideaId || state.selectedIdeaId) {
  const idea = getIdeaById(ideaId);
  if (!idea || ideaDeleteBusy) {
    return;
  }

  const linkedSpeech = idea.expandedSpeechId ? getSpeechById(idea.expandedSpeechId) : null;
  const confirmed = window.confirm(
    linkedSpeech
      ? `Delete "${idea.title}"?\n\nThis removes the lightweight idea seed, but keeps the linked speech "${linkedSpeech.title}".`
      : `Delete "${idea.title}"?\n\nThis permanently removes the idea seed from the workspace.`,
  );

  if (!confirmed) {
    return;
  }

  ideaDeleteBusy = true;
  setPageStatus(`Deleting "${idea.title}"...`);

  try {
    const { error } = await db
      .from("brajesh_speech_ideas")
      .delete()
      .eq("id", idea.id);

    if (error) throw error;

    if (state.editor.ideaId === idea.id) {
      closeEditor();
    }

    if (state.selectedIdeaId === idea.id) {
      state.selectedIdeaId = null;
    }

    state.workspaceView = "ideas";
    await loadSpeeches({ silent: true });
    setPageStatus(`Deleted "${idea.title}".`, "ok");
  } catch (error) {
    setPageStatus(error.message || `Could not delete "${idea.title}".`, "error");
  } finally {
    ideaDeleteBusy = false;
  }
}

async function deleteSpeech() {
  const speech = ensureSelection();
  if (!speech || speechDeleteBusy) {
    return;
  }

  const speechLabel = speech.status === "idea" ? "idea" : "speech";
  const versionCount = getSpeechVersionCount(speech);
  const deliveryCount = getSpeechDeliveryCount(speech);
  const versionLabel = `${versionCount} ${versionCount === 1 ? "version" : "versions"}`;
  const runLabel = `${deliveryCount} ${deliveryCount === 1 ? "run" : "runs"}`;
  const confirmed = window.confirm(
    `Delete "${speech.title}"?\n\nThis will permanently remove the ${speechLabel}, ${versionLabel}, and ${runLabel}.`,
  );

  if (!confirmed) {
    return;
  }

  speechDeleteBusy = true;
  setPageStatus(`Deleting "${speech.title}"...`);

  try {
    const speechId = speech.id;
    closeEditor();

    const { error } = await db
      .from("brajesh_speeches")
      .delete()
      .eq("id", speechId);

    if (error) throw error;

    if (state.selectedSpeechId === speechId) {
      state.selectedSpeechId = null;
      state.selectedVersionId = null;
      state.selectedDeliveryId = null;
    }

    await loadSpeeches({ silent: true });
    setPageStatus(`Deleted "${speech.title}".`, "ok");
  } catch (error) {
    setPageStatus(error.message || `Could not delete "${speech.title}".`, "error");
  } finally {
    speechDeleteBusy = false;
  }
}

async function deletePlaybookEntry(playbookId = state.editor.playbookId || state.selectedPlaybookId) {
  const entry = getPlaybookById(playbookId);
  if (!entry || playbookDeleteBusy) {
    return;
  }

  const confirmed = window.confirm(
    `Delete "${entry.title}"?\n\nThis permanently removes the playbook principle from the workspace and from pinned writing guidance.`,
  );

  if (!confirmed) {
    return;
  }

  playbookDeleteBusy = true;
  setPageStatus(`Deleting "${entry.title}"...`);

  try {
    const { error } = await db
      .from("brajesh_speech_playbook")
      .delete()
      .eq("id", entry.id);

    if (error) throw error;

    if (state.editor.playbookId === entry.id) {
      closeEditor();
    }

    if (state.selectedPlaybookId === entry.id) {
      state.selectedPlaybookId = null;
    }

    state.workspaceView = "playbook";
    await loadSpeeches({ silent: true });
    setPageStatus(`Deleted "${entry.title}".`, "ok");
  } catch (error) {
    setPageStatus(error.message || `Could not delete "${entry.title}".`, "error");
  } finally {
    playbookDeleteBusy = false;
  }
}

async function deleteVersion() {
  const speech = ensureSelection();
  const version = getSelectedVersionForSpeech(speech);

  if (!speech || !version || versionDeleteBusy) {
    return;
  }

  if (speech.versions.length <= 1) {
    setPageStatus("A speech must keep at least one version. Delete the speech if you want to remove everything.", "error");
    return;
  }

  const linkedRunCount = speech.deliveries.filter((delivery) => delivery.versionId === version.id).length;
  const basedOnCount = speech.versions.filter((candidate) => candidate.basedOn === version.id).length;
  const fallbackVersion = speech.activeVersionId && speech.activeVersionId !== version.id
    ? getVersionById(speech, speech.activeVersionId)
    : getLatestVersionForSpeech(speech, version.id);

  const confirmationLines = [
    `Delete version "${version.label}"?`,
    "",
    "This permanently removes the selected script version.",
  ];

  if (speech.activeVersionId === version.id && fallbackVersion) {
    confirmationLines.push(`The active version will switch to "${fallbackVersion.label}".`);
  }

  if (linkedRunCount) {
    confirmationLines.push(
      linkedRunCount === 1
        ? "1 run will keep its feedback, but its version-used link will be cleared."
        : `${linkedRunCount} runs will keep their feedback, but their version-used links will be cleared.`,
    );
  }

  if (basedOnCount) {
    confirmationLines.push(
      basedOnCount === 1
        ? "1 newer version will stay in place, but its based-on link will be cleared."
        : `${basedOnCount} newer versions will stay in place, but their based-on links will be cleared.`,
    );
  }

  const confirmed = window.confirm(confirmationLines.join("\n\n"));
  if (!confirmed) {
    return;
  }

  versionDeleteBusy = true;
  setPageStatus(`Deleting version "${version.label}"...`);

  try {
    if (speech.activeVersionId === version.id && fallbackVersion) {
      const { error: activeVersionError } = await db
        .from("brajesh_speeches")
        .update({ active_version_id: fallbackVersion.id })
        .eq("id", speech.id);

      if (activeVersionError) throw activeVersionError;
    }

    const { error } = await db
      .from("brajesh_speech_versions")
      .delete()
      .eq("id", version.id);

    if (error) throw error;

    state.selectedSpeechId = speech.id;
    state.selectedVersionId = fallbackVersion?.id || null;

    if (state.rehearsal.versionId === version.id) {
      state.rehearsal.speechId = null;
      state.rehearsal.versionId = null;
      state.rehearsal.index = 0;
      closeRehearsal();
    }

    await loadSpeeches({ silent: true });
    setPageStatus(`Deleted version "${version.label}".`, "ok");
  } catch (error) {
    setPageStatus(error.message || `Could not delete version "${version.label}".`, "error");
  } finally {
    versionDeleteBusy = false;
  }
}

function openRehearsal() {
  const speech = ensureSelection();
  const version = getSelectedVersionForSpeech(speech);

  if (!speech || !version?.rehearsalBullets?.length) {
    return;
  }

  const timing = getRehearsalTiming(version, version.rehearsalBullets || []);
  const useIntro = getEffectiveRehearsalMode(timing) === "auto" && timing.autoAvailable;

  state.rehearsal.speechId = speech.id;
  state.rehearsal.versionId = version.id;
  state.rehearsal.index = 0;
  state.rehearsal.startedAt = useIntro ? 0 : Date.now();
  state.rehearsal.cardStartedAt = 0;
  state.rehearsal.introEndsAt = useIntro ? Date.now() + REHEARSAL_INTRO_DURATION_MS : 0;
  elements.fullscreenRehearsal.hidden = false;
  renderRehearsalScreen({ resetAutoTimer: true });
}

function closeRehearsal() {
  clearRehearsalTickTimer();
  state.rehearsal.startedAt = 0;
  state.rehearsal.cardStartedAt = 0;
  state.rehearsal.introEndsAt = 0;
  elements.fullscreenRehearsal.hidden = true;
}

function getRehearsalVersion() {
  const speech = getSpeechById(state.rehearsal.speechId);
  const version = getVersionById(speech, state.rehearsal.versionId);
  return { speech, version };
}

function renderRehearsalScreen(options = {}) {
  const { resetAutoTimer = false } = options;
  const { speech, version } = getRehearsalVersion();
  const bullets = version?.rehearsalBullets || [];

  if (!speech || !version || !bullets.length) {
    closeRehearsal();
    return;
  }

  const index = Math.max(0, Math.min(state.rehearsal.index, bullets.length - 1));
  state.rehearsal.index = index;

  const timing = getRehearsalTiming(version, bullets);
  const cues = timing.cues || [];
  const progress = ((index + 1) / bullets.length) * 100;
  const nearEnd = bullets.length > 1 && index >= Math.max(1, bullets.length - Math.ceil(bullets.length * 0.25));
  const introActive = isRehearsalIntroActive();
  const stageCopy = introActive
    ? getRehearsalIntroLabel(timing)
    : (cues[index]?.text || bullets[index]);

  elements.fullscreenModeToggle.innerHTML = renderRehearsalModeToggle(timing, {
    ariaLabel: "Fullscreen rehearsal pacing mode",
    extraClassName: "fullscreen-mode-toggle",
  });
  elements.fullscreenBody.dataset.introActive = String(introActive);
  elements.fullscreenBullet.textContent = stageCopy;
  elements.fullscreenProgress.style.width = `${progress}%`;
  elements.fullscreenProgress.dataset.nearEnd = String(nearEnd);
  elements.prevBulletButton.disabled = introActive || index === 0;
  elements.nextBulletButton.disabled = introActive || index === bullets.length - 1;
  syncRehearsalTickTimer({ timing, reset: resetAutoTimer });
  updateRehearsalCardTimers(timing);
}

async function selectSpeech(speechId, options = {}) {
  const { renderPending = true } = options;

  state.selectedSpeechId = speechId;
  state.selectedVersionId = null;
  state.selectedDeliveryId = null;
  renderApp();

  try {
    await loadSpeechDetail(speechId, { renderPending });
  } catch {
    // The detail pane renders the error state; leave the selection in place.
  }
}

async function runAction(action) {
  const idea = ensureIdeaSelection();
  let speech = ensureSelection();
  const playbookEntry = ensurePlaybookSelection();

  const needsSpeechDetail = [
    "reload-speech-detail",
    "edit-speech",
    "edit-version",
    "edit-version-bullets",
    "new-version",
    "toggle-version-compare",
    "delete-version",
    "new-delivery",
    "edit-delivery",
    "start-rehearsal",
  ].includes(action);

  if (needsSpeechDetail) {
    if (!speech) {
      return;
    }

    try {
      speech = await loadSpeechDetail(speech.id, {
        force: action === "reload-speech-detail",
        renderPending: action !== "reload-speech-detail",
      });
    } catch {
      return;
    }

    if (!speech) {
      return;
    }
  }

  if (action === "new-idea") {
    openIdeaEditor();
    return;
  }

  if (action === "new-speech") {
    state.workspaceView = "speeches";
    openSpeechEditor({ statusPreset: "draft" });
    return;
  }

  if (action === "show-ideas") {
    state.workspaceView = "ideas";
    renderApp();
    return;
  }

  if (action === "show-speeches") {
    state.workspaceView = "speeches";
    renderApp();
    return;
  }

  if (action === "show-playbook") {
    state.workspaceView = "playbook";
    renderApp();
    return;
  }

  if (action === "show-settings") {
    state.workspaceView = "settings";
    renderApp();
    return;
  }

  if (action === "reload-speech-detail") {
    return;
  }

  if (action === "edit-idea" && idea) {
    state.workspaceView = "ideas";
    openIdeaEditor({ ideaId: idea.id });
    return;
  }

  if (action === "expand-idea" && idea) {
    openSpeechEditor({ statusPreset: "draft", sourceIdeaId: idea.id });
    return;
  }

  if (action === "open-linked-speech" && idea?.expandedSpeechId) {
    const linkedSpeech = getSpeechById(idea.expandedSpeechId);
    if (!linkedSpeech) {
      setPageStatus("The linked speech could not be found.", "error");
      return;
    }

    state.workspaceView = "speeches";
    void selectSpeech(linkedSpeech.id);
    return;
  }

  if (action === "delete-idea" && idea) {
    state.workspaceView = "ideas";
    deleteIdeaEntry(idea.id);
    return;
  }

  if (action === "edit-speech" && speech) {
    openSpeechEditor({ speechId: speech.id });
    return;
  }

  if (action === "edit-version" && speech) {
    openVersionEditor({
      speechId: speech.id,
      versionId: getSelectedVersionForSpeech(speech)?.id || null,
    });
    return;
  }

  if (action === "edit-version-bullets" && speech) {
    openVersionEditor({
      speechId: speech.id,
      versionId: getSelectedVersionForSpeech(speech)?.id || null,
      entryPoint: "rehearsal-bullets",
    });
    return;
  }

  if (action === "new-version" && speech) {
    openVersionEditor({ speechId: speech.id });
    return;
  }

  if (action === "new-playbook") {
    state.workspaceView = "playbook";
    openPlaybookEditor();
    return;
  }

  if (action === "edit-playbook" && playbookEntry) {
    state.workspaceView = "playbook";
    openPlaybookEditor({ playbookId: playbookEntry.id });
    return;
  }

  if (action === "delete-playbook" && playbookEntry) {
    state.workspaceView = "playbook";
    deletePlaybookEntry(playbookEntry.id);
    return;
  }

  if (action === "toggle-version-compare" && speech) {
    state.versionCompareOpen = !state.versionCompareOpen;
    renderApp();
    return;
  }

  if (action === "delete-version" && speech) {
    deleteVersion();
    return;
  }

  if (action === "new-delivery" && speech) {
    openDeliveryEditor({ speechId: speech.id });
    return;
  }

  if (action === "edit-delivery" && speech) {
    const delivery = getSelectedDeliveryForSpeech(speech);
    if (delivery) {
      openDeliveryEditor({ speechId: speech.id, deliveryId: delivery.id });
    } else {
      openDeliveryEditor({ speechId: speech.id });
    }
    return;
  }

  if (action === "start-rehearsal") {
    openRehearsal();
    return;
  }

  if (action === "delete-speech") {
    deleteSpeech();
  }
}

function nextRehearsalBullet() {
  const { version } = getRehearsalVersion();
  const bullets = version?.rehearsalBullets || [];
  if (!bullets.length || isRehearsalIntroActive()) return;
  state.rehearsal.index = Math.min(state.rehearsal.index + 1, bullets.length - 1);
  renderRehearsalScreen({ resetAutoTimer: true });
}

function prevRehearsalBullet() {
  const { version } = getRehearsalVersion();
  const bullets = version?.rehearsalBullets || [];
  if (!bullets.length || isRehearsalIntroActive()) return;
  state.rehearsal.index = Math.max(state.rehearsal.index - 1, 0);
  renderRehearsalScreen({ resetAutoTimer: true });
}

function handleFullscreenBodyClick(event) {
  const bounds = elements.fullscreenBody.getBoundingClientRect();
  const clickX = Number(event?.clientX);

  if (!Number.isFinite(clickX) || bounds.width <= 0) {
    nextRehearsalBullet();
    return;
  }

  const midpoint = bounds.left + (bounds.width / 2);

  if (clickX < midpoint) {
    prevRehearsalBullet();
    return;
  }

  nextRehearsalBullet();
}

function renderApp() {
  renderTopActions();
  renderWorkspaceRail();
  renderCounts();
  renderFilters();
  if (state.workspaceView === "ideas") {
    renderIdeaList();
  } else if (state.workspaceView === "playbook") {
    renderPlaybookList();
  } else if (state.workspaceView === "settings") {
    renderSettingsList();
  } else {
    renderSpeechList();
  }
  syncAllScriptPreferenceControls(elements.tabContent);
  syncSettingsStatus(elements.tabContent);
}

elements.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    setLoginBusy(true);
    const email = elements.loginForm.elements.email.value;
    const normalizedEmail = await sendBrajeshMagicLink(db, email, "/");
    elements.loginForm.reset();
    setPageStatus(`Magic link sent to ${normalizedEmail}. Open it in this browser.`, "ok");
  } catch (error) {
    setPageStatus(error.message || "Could not send the magic link.", "error");
  } finally {
    setLoginBusy(false);
  }
});

elements.loginLogoutButton.addEventListener("click", () => {
  handleSignOut("Signed out. You can use another email now.");
});

elements.logoutButton.addEventListener("click", () => {
  handleSignOut();
});

elements.workspaceToggleButton.addEventListener("click", () => {
  if (state.workspaceView === "speeches") {
    void runAction("show-playbook");
    return;
  }

  void runAction("show-speeches");
});

elements.settingsButton.addEventListener("click", () => {
  void runAction("show-settings");
});

elements.searchInput.addEventListener("input", () => {
  if (state.workspaceView === "ideas") {
    state.ideaSearch = elements.searchInput.value;
    renderApp();
  } else if (state.workspaceView === "playbook") {
    state.playbookSearch = elements.searchInput.value;
    renderApp();
  } else {
    state.search = elements.searchInput.value;
    queueSpeechSearch(state.search);
  }
});

elements.filterBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;

  if (state.workspaceView === "ideas") {
    state.ideaFilter = button.dataset.filter;
  } else if (state.workspaceView === "playbook") {
    state.playbookFilter = button.dataset.filter;
  } else {
    state.filter = button.dataset.filter;
  }
  renderApp();
});

elements.newIdeaButton.addEventListener("click", () => {
  if (state.workspaceView === "speeches") {
    void runAction("new-idea");
    return;
  }

  if (state.workspaceView === "ideas") {
    void runAction("show-playbook");
    return;
  }

  void runAction("show-ideas");
});

elements.newSpeechButton.addEventListener("click", () => {
  if (state.workspaceView === "ideas") {
    void runAction("new-idea");
    return;
  }

  if (state.workspaceView === "settings") {
    void runAction("show-playbook");
    return;
  }

  void runAction("new-speech");
});

elements.newPlaybookButton.addEventListener("click", () => {
  void runAction("new-playbook");
});

elements.speechList.addEventListener("click", (event) => {
  if (state.workspaceView === "ideas") {
    const button = event.target.closest("[data-idea-id]");
    if (!button) return;

    state.selectedIdeaId = button.dataset.ideaId;
    renderApp();
    return;
  }

  if (state.workspaceView === "playbook") {
    const button = event.target.closest("[data-playbook-id]");
    if (!button) return;

    state.selectedPlaybookId = button.dataset.playbookId;
    renderApp();
    return;
  }

  const button = event.target.closest("[data-speech-id]");
  if (!button) return;

  void selectSpeech(button.dataset.speechId);
});

elements.tabBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-tab]");
  if (!button) return;

  state.tab = button.dataset.tab;
  renderApp();
});

elements.detailActionRow.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;

  void runAction(button.dataset.action);
});

elements.tabContent.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-rehearsal-mode]");
  if (modeButton) {
    setRehearsalMode(modeButton.dataset.rehearsalMode);
    return;
  }

  const versionButton = event.target.closest("[data-version-id]");
  if (versionButton) {
    state.selectedVersionId = versionButton.dataset.versionId;
    renderApp();
    return;
  }

  const deliveryButton = event.target.closest("[data-delivery-id]");
  if (deliveryButton) {
    state.selectedDeliveryId = deliveryButton.dataset.deliveryId;
    renderApp();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (actionButton) {
    void runAction(actionButton.dataset.action);
  }
});

function handleScriptReadingInput(event) {
  const slider = event.target.closest("[data-script-text-size-input]");
  if (slider) {
    setScriptTextSize(slider.value);
    return;
  }

  const lineHeightSlider = event.target.closest("[data-script-line-height-input]");
  if (lineHeightSlider) {
    setScriptLineHeight(lineHeightSlider.value);
    return;
  }

  const paragraphSpacingSlider = event.target.closest("[data-script-paragraph-spacing-input]");
  if (!paragraphSpacingSlider) return;

  setScriptParagraphSpacing(paragraphSpacingSlider.value);
}

function handleEditorRichTextareaInput(event) {
  const textarea = event.target.closest("textarea[data-rich='true']");
  if (!textarea) return;

  autoSizeRichTextarea(textarea, { allowShrink: false });
}

elements.tabContent.addEventListener("input", handleScriptReadingInput);
elements.editorShell.addEventListener("input", handleScriptReadingInput);
elements.editorShell.addEventListener("input", handleEditorRichTextareaInput);

elements.editorBackdrop.addEventListener("click", () => {
  if (editorBusy) return;
  closeEditor();
});

elements.closeEditorButton.addEventListener("click", () => {
  if (editorBusy) return;
  closeEditor();
});

elements.cancelEditorButton.addEventListener("click", () => {
  if (editorBusy) return;
  closeEditor();
});

elements.deleteEditorButton.addEventListener("click", () => {
  if (editorBusy) return;
  if (state.editor.kind === "idea") {
    deleteIdeaEntry(state.editor.ideaId);
    return;
  }
  if (state.editor.kind === "playbook") {
    deletePlaybookEntry(state.editor.playbookId);
    return;
  }

  deleteSpeech();
});

elements.copyEditorButton.addEventListener("click", () => {
  copyEditorSpeechBody();
});

elements.editorForm.addEventListener("submit", saveEditor);

elements.fullscreenRehearsal.addEventListener("click", (event) => {
  const modeButton = event.target.closest("[data-rehearsal-mode]");
  if (!modeButton) return;

  event.stopPropagation();
  setRehearsalMode(modeButton.dataset.rehearsalMode);
});

elements.fullscreenBody.addEventListener("click", handleFullscreenBodyClick);

elements.nextBulletButton.addEventListener("click", (event) => {
  event.stopPropagation();
  nextRehearsalBullet();
});

elements.prevBulletButton.addEventListener("click", (event) => {
  event.stopPropagation();
  prevRehearsalBullet();
});

elements.exitFullscreenButton.addEventListener("click", (event) => {
  event.stopPropagation();
  closeRehearsal();
});

document.addEventListener("keydown", (event) => {
  if (!elements.fullscreenRehearsal.hidden) {
    if (event.key === "Escape") {
      closeRehearsal();
      return;
    }

    if (event.key === " " || event.key === "ArrowRight") {
      event.preventDefault();
      nextRehearsalBullet();
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      prevRehearsalBullet();
    }

    return;
  }

  if (!elements.editorShell.hidden && event.key === "Escape") {
    if (editorBusy) return;
    closeEditor();
  }
});

document.addEventListener("toggle", (event) => {
  const panel = event.target;

  if (!(panel instanceof HTMLDetailsElement)) {
    return;
  }

  const collapseKey = panel.dataset.collapseKey;
  if (!collapseKey) {
    return;
  }

  state.panels[collapseKey] = panel.open;

  const collapseLabel = panel.querySelector("[data-collapse-label]");
  if (collapseLabel) {
    collapseLabel.textContent = panel.open ? "Collapse" : "Expand";
  }
}, true);

db.auth.onAuthStateChange((event, session) => {
  if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) {
    return;
  }

  state.user = session?.user || null;
  updateIdentityUI();
  requestPageLoad({ silent: true }).finally(clearAuthHash);
});

function init() {
  applyAllScriptPreferences();
  updateIdentityUI();
  renderApp();
  requestPageLoad().finally(clearAuthHash);
}

init();
