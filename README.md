# Speeches Website

Repo docs for the standalone `speeches` site.

Canonical Codex memory for this repo lives in `/Volumes/T7/kritika4/.codex/memories/speeches-codebase.md`.

## What This Folder Is

- This folder is the standalone speeches website repo.
- Production entrypoint in this repo: `index.html`
- The site is meant to publish from repo root to `https://speeches.brajesh.com/`.

## Main Files

- `index.html`
  - speech manager page shell, styles, and DOM structure
- `assets/js/brajesh-speeches.js`
  - real speeches app logic
- `assets/js/brajesh-auth.js`
  - shared Supabase magic-link auth helper
- `supabase/20260506143000_add_brajesh_speeches.sql`
  - speeches schema, triggers, indexes, and RLS
- `supabase/20260519230711_add_brajesh_speech_search.sql`
  - speech search index and RPC for global speech search
- `supabase/20260520231500_add_brajesh_speech_user_settings.sql`
  - per-admin reading settings for script text size and spacing

## Stack

- Plain HTML, CSS, and JavaScript
- No build step
- No package manifest
- No automated test suite
- Backend/auth uses Supabase

## Deployment

- This speeches site ships from its own `speeches` repo.
- Default expectation for live-facing speeches changes:
  - commit the change
  - push `main`
  - let GitHub Pages publish repo root
- Custom domain target: `https://speeches.brajesh.com/`
- Only keep changes local when explicitly asked.

## Access Model

- This page is private.
- Login is via Supabase email magic links.
- Admin access is checked against `brajesh_admins` through `public.is_brajesh_admin()`.

## Data Model

- `brajesh_speech_ideas`
  - lightweight idea seeds for later expansion
  - title, idea note, tags, optional linked speech
- `brajesh_speeches`
  - parent speech record
  - title, status, goal, core idea, tags, notes, active version, focus compare order
- `brajesh_speech_versions`
  - one speech can have many versions
  - full script, revision note, target minutes, rehearsal bullets
- `brajesh_speech_runs`
  - delivered instances / run history
  - date, venue, version used, feedback, evaluator notes, next actions
- `brajesh_speech_saved_lines`
  - harvested draft and rewrite lines for later composite editing
  - linked to a speech and optionally to the source version
- `brajesh_speech_playbook`
  - reusable cross-speech speaking principles
  - title, category, principle, why it works, tags, pinned state
- `brajesh_speech_user_settings`
  - per-admin reading preferences
  - script text size, line spacing, paragraph spacing

## Main UI Areas

- top-level ideas workspace for lightweight seed capture
- speech library with search and status filters
- top-level playbook workspace for reusable principles
- top-level settings workspace for reading preferences
- overview tab
- versions tab
- runs tab
- fullscreen rehearsal mode

## Important Behavior

- `New Idea` no longer creates a speech or version record.
- ideas are saved separately from speeches and can later be expanded into a real speech.
- expanding an idea opens the normal speech-creation studio prefilled from that idea and links the idea to the created speech on save.
- Creating a new speech also creates its first version.
- Saving a version updates the speech's `active_version_id`.
- The selected version can be deleted from `Versions`, but each speech keeps at least one version.
- Pinned playbook principles appear inside script-writing editors.
- Reading controls now live in a dedicated `Settings` workspace instead of inside the script and reading surfaces.
- Reading settings are saved per admin account in Supabase and default to `25px` text, `1.40x` line spacing, and `1.20x` paragraph spacing.
- Logging a run usually moves the speech to `delivered`, except when:
  - the speech is still `idea`
  - the run result is `scheduled`
- Rehearsal mode shows one bullet at a time.
- Rehearsal now supports optional auto-advance pacing based on the selected version's `Target Minutes`, splitting the total time evenly across the current rehearsal bullets, and defaults to `Auto` when timing is available.
- Rehearsal navigation:
  - right-side click/tap or `Space` / right arrow = next
  - left-side click/tap or left arrow = previous
  - `Escape` = exit

## Current UI State

- As of 2026-05-20:
  - `Ideas`, `Speeches`, and `Playbook` are separate top-level workspace views.
  - `Settings` is a separate top-level workspace for reading preferences.
  - the main speech workspace now uses a document-first layout with a slim dark library rail and one warm continuous detail canvas instead of stacked summary/body panels.
  - `Ideas` stores lightweight idea seeds instead of creating speech/version records up front.
  - idea seeds can be edited, deleted, searched, filtered by open vs expanded, and expanded into speeches later.
  - `Playbook` is a separate top-level workspace view, not a speech tab.
  - `Playbook` entries can be created, edited, deleted, tagged, categorized, and pinned.
  - pinned `Playbook` principles appear in the script-writing editors as drafting guidance.
  - `Versions` keeps `Version History` always visible.
  - `Versions` shows explicit `Last edited` timestamps with local time.
  - `Versions` shows each listed draft's word count in `Version History`.
  - `Versions` has a `Compare` mode beside `Edit Script`.
  - compare uses the version's authored base version first, and falls back to the previous version by time when no base version is set.
  - saved lines can be captured from selected version text and reused while editing later drafts.
  - `Focus Compare` opens a dedicated 2-3 column version comparison view with `Save Line` available from each source column.
  - selected Focus Compare versions can be moved left/right by clicking pill edges, and the order is saved on the speech for reuse across devices.
  - Focus Compare hides the speech library rail and expands the comparison workspace to full browser width.
  - Focus Compare shows a floating Save/Copy bubble next to highlighted text and keeps a collapsible Saved Lines drawer, so highlighted lines can be saved/copied without scrolling back to the top or bottom.
  - Focus Compare also supports direct source-to-target insertion. Highlight source text, choose `Insert`, pick a target version if needed, then tap a cursor location in the editable target rail. Inserted text is placed with blank-line spacing before and after. Target edits remain unsaved until `Save Target`.
  - `Overview` and `Versions` include `Edit Here`, a quick in-place body-only editor for the selected version. It turns the script surface into a textarea, saves only `speech_body`, and protects unsaved edits when leaving the view.
  - On touch/tablet devices, the Focus Compare Save/Copy bubble appears near the shared edge of a neighboring comparison column when possible, avoiding native text-selection handles while preserving the selected source version.
  - The open Focus Compare Saved Lines drawer measures the tallest comparison rail and stretches to match it across desktop, tablet, and mobile layouts.
  - Saved Lines cards default to a tight text-only collapsed view packed at the top of the drawer; expanding a line reveals source metadata and actions.
  - the selected version can be deleted from the `Versions` detail header when the speech has more than one version.
  - `Edit Script` uses a collapsible `Rehearsal Bullets` panel.
  - `Edit Bullets` from the rehearsal view opens a wide bullet-drafting workspace with rehearsal bullets beside a read-only speech reference, then returns to the rehearsal bullets section after save.
  - `Edit Script` footer includes a `Copy Speech` action that copies the current draft text, including unsaved edits.
  - script text size, line spacing, and paragraph spacing now live in the dedicated `Settings` workspace instead of taking room inside speech reading and editing surfaces.
  - reading settings are saved per admin account in Supabase-backed user settings, not local browser storage.
  - the default reading settings are `25px` text, `1.40x` line spacing, and `1.20x` paragraph spacing.
  - the same script text-size setting affects:
    - overview speech body
    - versions speech body
    - `Edit Script` speech-body textarea
  - the same script line-spacing setting affects:
    - overview speech body
    - versions speech body
    - compare mode speech body
    - `Edit Script` speech-body textarea
  - the same paragraph-spacing setting affects:
    - overview speech body
    - versions speech body
    - compare mode speech body
  - `Edit Script` speech body auto-sizes to content in the editor.
  - the `Versions` tab uses page-length scrolling, keeps `Version History` always visible, and lets the selected speech body expand to the full draft length instead of sitting inside a compact inner scroller.
  - the `Runs` tab also uses page-length scrolling so the selected run detail continues through `Learnings`, `Evaluator Notes`, and `Next Time` without an abrupt cutoff.
  - the `Rehearsal` workspace now defaults to `Auto` pacing when target minutes are available, while still supporting `Manual`; fullscreen rehearsal shows an on-card per-card timer counting up at top left, a session elapsed timer at top right, and a short `seconds per card` intro cue before auto mode starts.
  - `Edit Script` pills are green-themed.
  - `Edit Meta` pills are pink-themed.

## Cache Note

- Important: when speeches UI changes appear not to register after deploy, check for stale cached JS.
- The speeches page currently cache-busts the module URL in `index.html`:
  - `./assets/js/brajesh-speeches.js?v=20260609a`
- If future speeches JS changes appear missing in production, bump that query-string version.

## Useful Starting Point

For Codex rehydration, read:

1. `/Volumes/T7/kritika4/.codex/memories/speeches-codebase.md`
2. `README.md`
3. `index.html`
4. `assets/js/brajesh-speeches.js`
5. the latest relevant `supabase/*.sql` migration files

Use `/Volumes/T7/kritika4/.codex/memories/brajesh-codebase.md` only for shared infra and cross-repo history, not as the canonical `speeches` memory source.
