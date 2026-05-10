import {
  createBrajeshClient,
  requireBrajeshAdmin,
  sendBrajeshMagicLink,
  signOutBrajesh,
} from "./brajesh-auth.js";

const db = createBrajeshClient();
const SCRIPT_TEXT_SIZE_STORAGE_KEY = "brajesh_speeches_script_text_size";
const SCRIPT_TEXT_SIZE_MIN = 16;
const SCRIPT_TEXT_SIZE_MAX = 28;
const SCRIPT_TEXT_SIZE_DEFAULT = 20;

const state = {
  user: null,
  speeches: [],
  search: "",
  filter: "all",
  selectedSpeechId: null,
  selectedVersionId: null,
  selectedDeliveryId: null,
  tab: "overview",
  rehearsal: {
    speechId: null,
    versionId: null,
    index: 0,
  },
  preferences: {
    scriptTextSize: loadScriptTextSizePreference(),
  },
  panels: {
    "version-history": false,
    "rehearsal-bullets": false,
  },
  editor: {
    open: false,
    kind: null,
    intent: null,
    speechId: null,
    versionId: null,
    deliveryId: null,
    statusPreset: "draft",
    sourceVersionId: null,
  },
};
let pageLoadPromise = null;
let pageReloadQueued = false;
let editorBusy = false;
let speechDeleteBusy = false;
let versionDeleteBusy = false;

const elements = {
  pageStatus: document.querySelector("#pageStatus"),
  loginPanel: document.querySelector("#loginPanel"),
  loginForm: document.querySelector("#loginForm"),
  loginLogoutButton: document.querySelector("#loginLogoutButton"),
  sessionHint: document.querySelector("#sessionHint"),
  logoutButton: document.querySelector("#logoutButton"),
  adminIdentity: document.querySelector("#adminIdentity"),
  appShell: document.querySelector("#appShell"),
  searchInput: document.querySelector("#searchInput"),
  filterBar: document.querySelector("#filterBar"),
  totalCount: document.querySelector("#totalCount"),
  draftCount: document.querySelector("#draftCount"),
  deliveredCount: document.querySelector("#deliveredCount"),
  libraryStatus: document.querySelector("#libraryStatus"),
  speechList: document.querySelector("#speechList"),
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
  closeEditorButton: document.querySelector("#closeEditorButton"),
  cancelEditorButton: document.querySelector("#cancelEditorButton"),
  saveEditorButton: document.querySelector("#saveEditorButton"),
  fullscreenRehearsal: document.querySelector("#fullscreenRehearsal"),
  fullscreenBody: document.querySelector("#fullscreenBody"),
  fullscreenType: document.querySelector("#fullscreenType"),
  fullscreenTitle: document.querySelector("#fullscreenTitle"),
  fullscreenBullet: document.querySelector("#fullscreenBullet"),
  fullscreenProgress: document.querySelector("#fullscreenProgress"),
  fullscreenCounter: document.querySelector("#fullscreenCounter"),
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
    message.includes("brajesh_speeches")
    || message.includes("brajesh_speech_versions")
    || message.includes("brajesh_speech_runs")
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
  elements.newIdeaButton.hidden = true;
  elements.newSpeechButton.hidden = true;
  elements.logoutButton.hidden = !state.user;
  closeEditor();
  closeRehearsal();
}

function showApp() {
  elements.loginPanel.hidden = true;
  elements.appShell.hidden = false;
  elements.newIdeaButton.hidden = false;
  elements.newSpeechButton.hidden = false;
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
  state.speeches = [];
  state.selectedSpeechId = null;
  state.selectedVersionId = null;
  state.selectedDeliveryId = null;
  state.rehearsal.speechId = null;
  state.rehearsal.versionId = null;
  state.rehearsal.index = 0;
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

function clampScriptTextSize(value) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (Number.isNaN(parsed)) {
    return SCRIPT_TEXT_SIZE_DEFAULT;
  }

  return Math.min(SCRIPT_TEXT_SIZE_MAX, Math.max(SCRIPT_TEXT_SIZE_MIN, parsed));
}

function loadScriptTextSizePreference() {
  try {
    return clampScriptTextSize(window.localStorage?.getItem(SCRIPT_TEXT_SIZE_STORAGE_KEY));
  } catch {
    return SCRIPT_TEXT_SIZE_DEFAULT;
  }
}

function persistScriptTextSizePreference(value) {
  try {
    window.localStorage?.setItem(SCRIPT_TEXT_SIZE_STORAGE_KEY, String(value));
  } catch {}
}

function applyScriptTextSizePreference() {
  document.documentElement.style.setProperty("--script-text-size", `${state.preferences.scriptTextSize}px`);
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

function setScriptTextSize(value) {
  const nextValue = clampScriptTextSize(value);
  state.preferences.scriptTextSize = nextValue;
  persistScriptTextSizePreference(nextValue);
  applyScriptTextSizePreference();
  syncScriptTextSizeControls();
  scheduleAutoSizeRichTextareas(elements.editorShell);
}

function isPanelOpen(key) {
  return Boolean(state.panels[key]);
}

function autoSizeRichTextarea(textarea) {
  if (!(textarea instanceof HTMLTextAreaElement) || textarea.dataset.rich !== "true") {
    return;
  }

  textarea.style.height = "auto";
  const minHeight = Number.parseFloat(window.getComputedStyle(textarea).minHeight) || 0;
  textarea.style.height = `${Math.max(minHeight, textarea.scrollHeight)}px`;
}

function autoSizeRichTextareas(root = document) {
  root.querySelectorAll("textarea[data-rich='true']").forEach((textarea) => {
    autoSizeRichTextarea(textarea);
  });
}

function scheduleAutoSizeRichTextareas(root = document) {
  window.requestAnimationFrame(() => {
    autoSizeRichTextareas(root);
  });
}

function parseMinutes(value) {
  const parsed = Number.parseInt(cleanText(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
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

function mapSpeechData(speechRows, versionRows, runRows) {
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
    versions: [],
    deliveries: [],
  }));

  const bySpeechId = new Map(speeches.map((speech) => [speech.id, speech]));

  (versionRows || []).forEach((row) => {
    const speech = bySpeechId.get(row.speech_id);
    if (!speech) return;

    speech.versions.push({
      id: row.id,
      label: row.label || "Untitled Version",
      basedOn: row.based_on_version_id || null,
      estimatedMinutes: row.estimated_minutes || 0,
      updatedAt: row.updated_at || row.created_at || "",
      revisionNote: row.revision_note || "",
      speechBody: row.speech_body || "",
      rehearsalBullets: ensureTextArray(row.rehearsal_bullets),
    });
  });

  (runRows || []).forEach((row) => {
    const speech = bySpeechId.get(row.speech_id);
    if (!speech) return;

    speech.deliveries.push({
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
    });
  });

  speeches.forEach((speech) => {
    speech.versions.sort((a, b) => {
      const timeA = timestampMs(a.updatedAt);
      const timeB = timestampMs(b.updatedAt);
      return timeA - timeB;
    });

    if (!speech.activeVersionId && speech.versions.length) {
      speech.activeVersionId = speech.versions[speech.versions.length - 1].id;
    }
  });

  return speeches.sort((a, b) => {
    const timeA = timestampMs(a.updatedAt || a.createdAt);
    const timeB = timestampMs(b.updatedAt || b.createdAt);
    return timeB - timeA;
  });
}

async function loadSpeeches(options = {}) {
  if (!options.silent) {
    setPageStatus("Loading speeches.");
  }

  const [speechResult, versionResult, runResult] = await Promise.all([
    db
      .from("brajesh_speeches")
      .select("id, title, status, goal, core_idea, tags, notes, active_version_id, created_at, updated_at")
      .order("updated_at", { ascending: false }),
    db
      .from("brajesh_speech_versions")
      .select("id, speech_id, based_on_version_id, label, estimated_minutes, revision_note, speech_body, rehearsal_bullets, created_at, updated_at")
      .order("created_at", { ascending: true }),
    db
      .from("brajesh_speech_runs")
      .select("id, speech_id, version_id, delivered_at, location, city, program, event_level, speech_style, audience, result, actual_minutes, what_worked, what_missed, learnings, evaluator_notes, next_actions, created_at, updated_at")
      .order("delivered_at", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);

  if (speechResult.error) throw speechResult.error;
  if (versionResult.error) throw versionResult.error;
  if (runResult.error) throw runResult.error;

  state.speeches = mapSpeechData(speechResult.data, versionResult.data, runResult.data);
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

function speechWordCount(speech) {
  return versionWordCount(getSelectedVersionForSpeech(speech));
}

function excerpt(text, length = 130) {
  const cleaned = String(text || "").replace(/\s+/g, " ").trim();
  if (cleaned.length <= length) return cleaned;
  return `${cleaned.slice(0, length - 3)}...`;
}

function getSpeechById(id) {
  return state.speeches.find((speech) => speech.id === id) || null;
}

function getVersionById(speech, versionId) {
  return speech?.versions.find((version) => version.id === versionId) || null;
}

function getDeliveryById(speech, deliveryId) {
  return speech?.deliveries.find((delivery) => delivery.id === deliveryId) || null;
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

    const haystack = [
      speech.title,
      speech.coreIdea,
      speech.goal,
      speech.tags.join(" "),
      speech.notes,
      ...speech.versions.map((version) => `${version.label} ${version.speechBody} ${version.revisionNote} ${version.rehearsalBullets.join(" ")}`),
      ...speech.deliveries.map((delivery) => `${delivery.location} ${delivery.city} ${delivery.program} ${delivery.eventLevel} ${delivery.speechStyle}`),
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

function getSelectedVersionForSpeech(speech) {
  if (!speech) return null;

  const explicit = getVersionById(speech, state.selectedVersionId);
  if (explicit) return explicit;

  const active = getVersionById(speech, speech.activeVersionId);
  if (active) return active;

  return speech.versions[0] || null;
}

function getSelectedDeliveryForSpeech(speech) {
  if (!speech?.deliveries?.length) return null;

  const explicit = getDeliveryById(speech, state.selectedDeliveryId);
  if (explicit) return explicit;

  return sortDeliveries(speech.deliveries)[0];
}

function getLatestVersionForSpeech(speech, excludeVersionId = "") {
  if (!speech?.versions?.length) return null;

  const candidates = speech.versions.filter((version) => version.id !== excludeVersionId);
  return candidates.length ? candidates[candidates.length - 1] : null;
}

function setLibraryStatus(text, tone = "") {
  elements.libraryStatus.textContent = text;
  elements.libraryStatus.dataset.tone = tone;
}

function renderCounts() {
  const total = state.speeches.length;
  const inProgress = state.speeches.filter((speech) => ["idea", "draft", "rehearsal_ready"].includes(speech.status)).length;
  const delivered = state.speeches.filter((speech) => speech.deliveries.length > 0).length;

  elements.totalCount.textContent = `${total} speeches`;
  elements.draftCount.textContent = `${inProgress} in progress`;
  elements.deliveredCount.textContent = `${delivered} delivered`;
}

function renderFilters() {
  const filters = [
    { id: "all", label: "All" },
    { id: "idea", label: "Ideas" },
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

function renderSpeechList() {
  const filtered = getFilteredSpeeches();
  const selected = ensureSelection();

  if (!filtered.length) {
    elements.speechList.innerHTML = '<div class="empty-state">No speeches match this filter.</div>';
    setLibraryStatus("No matching speeches.", "");
    renderSpeechDetail(null);
    return;
  }

  elements.speechList.innerHTML = filtered.map((speech) => {
    const latestDelivery = sortDeliveries(speech.deliveries)[0];
    const latestRunLine = latestDelivery
      ? `Latest run: ${formatDate(latestDelivery.deliveredAt)}${latestDelivery.eventLevel ? ` · ${latestDelivery.eventLevel}` : ""}`
      : "No runs logged yet.";

    return `
      <button class="speech-card" type="button" data-speech-id="${speech.id}" aria-pressed="${String(selected?.id === speech.id)}">
        <div class="meta-row">
          <span class="status-chip" data-status="${speech.status}">${statusLabel(speech.status)}</span>
          <span class="meta-chip">${speech.versions.length} ${speech.versions.length === 1 ? "version" : "versions"}</span>
        </div>
        <h3>${displayText(speech.title)}</h3>
        <p>${displayText(excerpt(speech.coreIdea, 120), "No core idea yet.")}</p>
        <div class="tag-row">
          ${renderTagChips(speech.tags.slice(0, 3))}
        </div>
        <p>${displayText(latestRunLine)}</p>
      </button>
    `;
  }).join("");

  setLibraryStatus(state.search ? `Filtering speeches by "${state.search.trim()}".` : "Showing the current speech library.", "ok");
  renderSpeechDetail(selected);
}

function renderSpeechDetail(speech) {
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

  const version = getSelectedVersionForSpeech(speech);

  elements.speechMode.textContent = speech.deliveries.length ? "Speech + Run History" : "Speech in Progress";
  elements.speechTitle.textContent = speech.title;
  elements.speechStatusChip.textContent = statusLabel(speech.status);
  elements.speechStatusChip.dataset.status = speech.status;
  elements.speechGoalChip.textContent = speech.goal || "No goal yet";
  elements.speechCountChip.textContent = `${speech.deliveries.length} ${speech.deliveries.length === 1 ? "run" : "runs"}`;
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

function syncHeaderActions() {}

function renderFocusCard(speech, version) {
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

function renderTabContent(speech) {
  if (!speech) {
    elements.tabContent.innerHTML = '<div class="empty-state">No speech selected.</div>';
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
      <div class="panel-tools">
        ${renderScriptTextSizeControl()}
      </div>
      <div class="script-box">
        <p class="body-copy">${displayText(version?.speechBody, "No speech body yet.")}</p>
      </div>
    </div>
  `;
}

function renderVersionsTab(speech) {
  const selectedVersion = getSelectedVersionForSpeech(speech);
  const basedOnVersion = selectedVersion?.basedOn ? getVersionById(speech, selectedVersion.basedOn) : null;
  const versionHistoryOpen = isPanelOpen("version-history");
  const canDeleteVersion = Boolean(selectedVersion) && speech.versions.length > 1;
  const editTimestampLabel = selectedVersion ? `Last edited ${formatDateTime(selectedVersion.updatedAt)}` : "No version selected";

  return `
    <div class="reader-stack">
      <details class="collapse-card" data-collapse-key="version-history" ${versionHistoryOpen ? "open" : ""}>
        <summary class="collapse-summary">
          <div>
            <h4>Version History</h4>
            <p class="collapse-summary-copy">Selected version: ${displayText(selectedVersion?.label, "No version")}.</p>
          </div>
          <div class="collapse-summary-meta">
            <span class="meta-chip">${speech.versions.length} total</span>
            <span class="meta-chip">${versionHistoryOpen ? "Collapse" : "Expand"}</span>
          </div>
        </summary>
        <div class="collapse-content">
          <div class="version-list scroll-area">
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
      </details>

      <div class="card">
        <div class="panel-head">
          <h4>${displayText(selectedVersion?.label, "Version Detail")}</h4>
          <div class="button-row">
            <span class="meta-chip">${displayText(basedOnVersion ? `Based on ${basedOnVersion.label}` : "Original version")}</span>
            <span class="meta-chip">${displayText(editTimestampLabel)}</span>
            <button class="ghost-button" type="button" data-action="new-version">New Version</button>
            <button class="script-button" type="button" data-action="edit-version">Edit Script</button>
            ${canDeleteVersion ? '<button class="danger-button" type="button" data-action="delete-version">Delete Version</button>' : '<span class="meta-chip">Keep at least 1 version</span>'}
          </div>
        </div>
        <div class="panel-tools">
          ${renderScriptTextSizeControl()}
        </div>
        <div class="script-box script-box-compact scroll-area" style="margin-bottom: 14px;">
          <p class="body-copy">${displayText(selectedVersion?.speechBody, "No speech body yet.")}</p>
        </div>
        <div class="notes-box">
          <div class="panel-head">
            <h4>Revision Note</h4>
            <span class="meta-chip">${selectedVersion?.rehearsalBullets.length || 0} bullets</span>
          </div>
          <p class="body-copy" style="font-size: 1rem; font-family: var(--sans); line-height: 1.55;">${displayText(selectedVersion?.revisionNote, "No revision note.")}</p>
        </div>
      </div>
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
  const leftTitle = speech.status === "idea" ? "Idea Prompts" : "Rehearsal Bullets";
  const rightTitle = speech.status === "idea" ? "Prompt View" : "Fullscreen Rehearsal";
  const buttonLabel = speech.status === "idea" ? "Open Prompt View" : "Start Fullscreen Rehearsal";

  return `
    <div class="two-up">
      <div class="card">
        <div class="panel-head">
          <h4>${leftTitle}</h4>
          <span class="meta-chip">${bullets.length} bullets</span>
        </div>
        ${bullets.length ? `
          <div class="bullet-list">
            ${bullets.map((bullet, index) => `
              <div class="bullet-card">
                <strong>Bullet ${String(index + 1).padStart(2, "0")}</strong>
                <p>${displayText(bullet)}</p>
              </div>
            `).join("")}
          </div>
        ` : `
          <div class="empty-state">No rehearsal bullets added yet.</div>
        `}
      </div>

      <div class="card">
        <div class="panel-head">
          <h4>${rightTitle}</h4>
          <div class="button-row">
            <span class="meta-chip">${version?.label || "No version"}</span>
            <button class="script-button" type="button" data-action="edit-version">${speech.status === "idea" ? "Edit Note" : "Edit Bullets"}</button>
          </div>
        </div>
        <div class="info-grid" style="margin-bottom: 16px;">
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
            <span>${version?.estimatedMinutes || "-"} min</span>
          </div>
        </div>
        <div class="button-row">
          <button class="primary-button" type="button" data-action="start-rehearsal">${buttonLabel}</button>
        </div>
      </div>
    </div>
  `;
}

function setEditorStatus(text = "", tone = "") {
  elements.editorStatus.textContent = text;
  elements.editorStatus.dataset.tone = tone;
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

  if (isBusy) {
    setSaveButtonLabel(busyLabel, true);
    return;
  }

  setSaveButtonLabel(elements.saveEditorButton.dataset.defaultLabel || elements.saveEditorButton.textContent);
}

function openSpeechEditor({ speechId = null, statusPreset = "draft" } = {}) {
  state.editor = {
    open: true,
    kind: "speech",
    intent: speechId ? "edit" : "create",
    speechId,
    versionId: null,
    deliveryId: null,
    statusPreset,
    sourceVersionId: null,
  };

  renderEditor();
}

function openVersionEditor({ speechId = null, versionId = null } = {}) {
  const speech = speechId ? getSpeechById(speechId) : ensureSelection();
  if (!speech) return;

  const selectedVersion = versionId
    ? getVersionById(speech, versionId)
    : getSelectedVersionForSpeech(speech);

  state.editor = {
    open: true,
    kind: "version",
    intent: versionId ? "edit" : "create",
    speechId: speech.id,
    versionId: versionId || null,
    deliveryId: null,
    statusPreset: speech.status,
    sourceVersionId: selectedVersion?.id || null,
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
    statusPreset: speech.status,
    sourceVersionId: null,
  };

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
    statusPreset: "draft",
    sourceVersionId: null,
  };

  elements.editorShell.dataset.layout = "";
  elements.editorShell.hidden = true;
  elements.editorFields.innerHTML = "";
  elements.editorContextNote.textContent = "";
  elements.editorFooterNote.textContent = "";
  setSaveButtonLabel(elements.saveEditorButton.dataset.defaultLabel || elements.saveEditorButton.textContent);
  elements.deleteEditorButton.hidden = true;
  elements.deleteEditorButton.textContent = "Delete Speech";
  setEditorStatus("");
  document.body.classList.remove("drawer-open");
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
        ${renderScriptTextSizeControl()}
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
          <span class="meta-chip">${panelOpen ? "Collapse" : "Expand"}</span>
        </div>
      </summary>
      <div class="collapse-content">
        <div class="field">
          <label for="${escapeHtml(bulletsId)}">Rehearsal Bullets</label>
          <textarea id="${escapeHtml(bulletsId)}" name="${escapeHtml(bulletsName)}" data-bullets="true">${escapeHtml(bulletValue)}</textarea>
          <p class="field-hint">One bullet per line. These feed the rehearsal tab and fullscreen cue mode.</p>
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
  const activeVersion = getSelectedVersionForSpeech(speech);
  const statusValue = isEdit ? speech.status : state.editor.statusPreset;
  const versionLabel = isEdit ? "" : defaultVersionLabel(statusValue);
  const footer = isEdit
    ? "Metadata and direction save here. Script and bullets live in Edit Script."
    : "Creating a speech also creates the first version so you can start writing immediately.";

  return {
    layout: "studio",
    modeLabel: isEdit ? "Edit Meta" : "New Speech",
    title: isEdit ? speech.title : (statusValue === "idea" ? "New Idea" : "New Speech"),
    context: isEdit
      ? `${speech.versions.length} versions · ${speech.deliveries.length} runs`
      : (statusValue === "idea" ? "Capture the speech before it becomes a draft." : "Start a new speech with the first version already attached."),
    footer,
    dismissLabel: "Back to Workspace",
    saveLabel: isEdit ? "Save Speech" : "Create Speech",
    fields: `
      <div class="studio-layout">
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
              <input id="speechTitleInput" name="title" type="text" value="${escapeHtml(isEdit ? speech.title : "")}" required>
            </div>
            <div class="field">
              <label for="speechStatusSelect">Status</label>
              <select id="speechStatusSelect" name="status">
                ${statusOptions(statusValue)}
              </select>
            </div>
            <div class="field" data-span="full">
              <label for="speechGoalInput">Goal</label>
              <input id="speechGoalInput" name="goal" type="text" value="${escapeHtml(isEdit ? speech.goal : "")}">
            </div>
            <div class="field" data-span="full">
              <label for="speechTagsInput">Tags</label>
              <input id="speechTagsInput" name="tags" type="text" value="${escapeHtml(isEdit ? speech.tags.join(", ") : "")}">
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
              <textarea id="speechIdeaInput" name="coreIdea" data-compact="true">${escapeHtml(isEdit ? speech.coreIdea : "")}</textarea>
            </div>
            <div class="field" data-span="full">
              <label for="speechNotesInput">Next Move</label>
              <textarea id="speechNotesInput" name="notes" data-compact="true">${escapeHtml(isEdit ? speech.notes : "")}</textarea>
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
                <input id="estimatedMinutesInput" name="estimatedMinutes" type="number" min="0" step="1" value="${statusValue === "idea" ? "" : "5"}">
              </div>
              <div class="field" data-span="full">
                <label for="revisionNoteInput">Revision Note</label>
                <textarea id="revisionNoteInput" name="revisionNote" data-compact="true">${escapeHtml(statusValue === "idea" ? "Capture the exact scene before writing the speech body." : "Build the first full pass, then tighten the opening and ending.")}</textarea>
              </div>
            </div>
          </div>

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

function renderEditor() {
  const speech = getSpeechById(state.editor.speechId);
  const version = speech
    ? getVersionById(speech, state.editor.versionId || state.editor.sourceVersionId)
    : null;
  const delivery = speech ? getDeliveryById(speech, state.editor.deliveryId) : null;

  let config = null;

  if (state.editor.kind === "speech" && (state.editor.intent === "create" || speech)) {
    config = speechEditorConfig(speech);
  } else if (state.editor.kind === "version" && speech && (state.editor.intent === "create" || version)) {
    config = versionEditorConfig(speech, version);
  } else if (state.editor.kind === "delivery" && speech && (state.editor.intent === "create" || delivery)) {
    config = deliveryEditorConfig(speech, delivery);
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
  scheduleAutoSizeRichTextareas(elements.editorShell);

  const showSpeechDelete = state.editor.kind === "speech" && state.editor.intent === "edit" && Boolean(speech);
  elements.deleteEditorButton.hidden = !showSpeechDelete;
  elements.deleteEditorButton.textContent = speech?.status === "idea" ? "Delete Idea" : "Delete Speech";

  requestAnimationFrame(() => {
    elements.editorFields.querySelector("input, textarea, select")?.focus();
  });
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
    state.tab = "versions";
    closeEditor();
    await loadSpeeches({ silent: true });
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
      : (state.editor.intent === "edit" ? "Saving Speech..." : "Creating Speech...");

  setEditorBusy(true, busyLabel);
  setEditorStatus(busyLabel, "ok");

  try {
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
    }
  } finally {
    if (!elements.editorShell.hidden) {
      setEditorBusy(false);
    }
  }
}

async function deleteSpeech() {
  const speech = ensureSelection();
  if (!speech || speechDeleteBusy) {
    return;
  }

  const speechLabel = speech.status === "idea" ? "idea" : "speech";
  const versionLabel = `${speech.versions.length} ${speech.versions.length === 1 ? "version" : "versions"}`;
  const runLabel = `${speech.deliveries.length} ${speech.deliveries.length === 1 ? "run" : "runs"}`;
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

  state.rehearsal.speechId = speech.id;
  state.rehearsal.versionId = version.id;
  state.rehearsal.index = 0;
  elements.fullscreenRehearsal.hidden = false;
  renderRehearsalScreen();
}

function closeRehearsal() {
  elements.fullscreenRehearsal.hidden = true;
}

function getRehearsalVersion() {
  const speech = getSpeechById(state.rehearsal.speechId);
  const version = getVersionById(speech, state.rehearsal.versionId);
  return { speech, version };
}

function renderRehearsalScreen() {
  const { speech, version } = getRehearsalVersion();
  const bullets = version?.rehearsalBullets || [];

  if (!speech || !version || !bullets.length) {
    closeRehearsal();
    return;
  }

  const index = Math.max(0, Math.min(state.rehearsal.index, bullets.length - 1));
  state.rehearsal.index = index;

  const progress = ((index + 1) / bullets.length) * 100;
  const nearEnd = bullets.length > 1 && index >= Math.max(1, bullets.length - Math.ceil(bullets.length * 0.25));

  elements.fullscreenType.textContent = `${speech.title} · ${version.label}`;
  elements.fullscreenTitle.textContent = `Bullet rehearsal · ${speech.goal}`;
  elements.fullscreenBullet.textContent = bullets[index];
  elements.fullscreenProgress.style.width = `${progress}%`;
  elements.fullscreenProgress.dataset.nearEnd = String(nearEnd);
  elements.fullscreenCounter.textContent = `${index + 1} / ${bullets.length}`;
  elements.prevBulletButton.disabled = index === 0;
  elements.nextBulletButton.disabled = index === bullets.length - 1;
}

function runAction(action) {
  const speech = ensureSelection();

  if (action === "new-idea") {
    openSpeechEditor({ statusPreset: "idea" });
    return;
  }

  if (action === "new-speech") {
    openSpeechEditor({ statusPreset: "draft" });
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

  if (action === "new-version" && speech) {
    openVersionEditor({ speechId: speech.id });
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
  if (!bullets.length) return;
  state.rehearsal.index = Math.min(state.rehearsal.index + 1, bullets.length - 1);
  renderRehearsalScreen();
}

function prevRehearsalBullet() {
  const { version } = getRehearsalVersion();
  const bullets = version?.rehearsalBullets || [];
  if (!bullets.length) return;
  state.rehearsal.index = Math.max(state.rehearsal.index - 1, 0);
  renderRehearsalScreen();
}

function renderApp() {
  renderCounts();
  renderFilters();
  renderSpeechList();
  syncScriptTextSizeControls(elements.tabContent);
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

elements.searchInput.addEventListener("input", () => {
  state.search = elements.searchInput.value;
  renderApp();
});

elements.filterBar.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");
  if (!button) return;

  state.filter = button.dataset.filter;
  renderApp();
});

elements.newIdeaButton.addEventListener("click", () => {
  runAction("new-idea");
});

elements.newSpeechButton.addEventListener("click", () => {
  runAction("new-speech");
});

elements.speechList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-speech-id]");
  if (!button) return;

  state.selectedSpeechId = button.dataset.speechId;
  state.selectedVersionId = null;
  state.selectedDeliveryId = null;
  renderApp();
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

  runAction(button.dataset.action);
});

elements.tabContent.addEventListener("click", (event) => {
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
    runAction(actionButton.dataset.action);
  }
});

function handleScriptTextSizeInput(event) {
  const slider = event.target.closest("[data-script-text-size-input]");
  if (!slider) return;

  setScriptTextSize(slider.value);
}

function handleEditorRichTextareaInput(event) {
  const textarea = event.target.closest("textarea[data-rich='true']");
  if (!textarea) return;

  autoSizeRichTextarea(textarea);
}

elements.tabContent.addEventListener("input", handleScriptTextSizeInput);
elements.editorShell.addEventListener("input", handleScriptTextSizeInput);
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
  deleteSpeech();
});

elements.editorForm.addEventListener("submit", saveEditor);

elements.fullscreenBody.addEventListener("click", () => {
  nextRehearsalBullet();
});

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
  applyScriptTextSizePreference();
  updateIdentityUI();
  renderApp();
  requestPageLoad().finally(clearAuthHash);
}

init();
