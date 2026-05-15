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
  - title, status, goal, core idea, tags, notes, active version
- `brajesh_speech_versions`
  - one speech can have many versions
  - full script, revision note, target minutes, rehearsal bullets
- `brajesh_speech_runs`
  - delivered instances / run history
  - date, venue, version used, feedback, evaluator notes, next actions
- `brajesh_speech_playbook`
  - reusable cross-speech speaking principles
  - title, category, principle, why it works, tags, pinned state

## Main UI Areas

- top-level ideas workspace for lightweight seed capture
- speech library with search and status filters
- top-level playbook workspace for reusable principles
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
- Logging a run usually moves the speech to `delivered`, except when:
  - the speech is still `idea`
  - the run result is `scheduled`
- Rehearsal mode shows one bullet at a time.
- Rehearsal navigation:
  - right-side click/tap or `Space` / right arrow = next
  - left-side click/tap or left arrow = previous
  - `Escape` = exit

## Current UI State

- As of 2026-05-15:
  - `Ideas`, `Speeches`, and `Playbook` are separate top-level workspace views.
  - `Ideas` stores lightweight idea seeds instead of creating speech/version records up front.
  - idea seeds can be edited, deleted, searched, filtered by open vs expanded, and expanded into speeches later.
  - `Playbook` is a separate top-level workspace view, not a speech tab.
  - `Playbook` entries can be created, edited, deleted, tagged, categorized, and pinned.
  - pinned `Playbook` principles appear in the script-writing editors as drafting guidance.
  - `Versions` uses a collapsible `Version History` panel.
  - `Versions` shows explicit `Last edited` timestamps with local time.
  - `Versions` shows each listed draft's word count in `Version History`.
  - `Versions` has a `Compare` mode beside `Edit Script`.
  - compare uses the version's authored base version first, and falls back to the previous version by time when no base version is set.
  - the selected version can be deleted from the `Versions` detail header when the speech has more than one version.
  - `Edit Script` uses a collapsible `Rehearsal Bullets` panel.
  - `Edit Bullets` from the rehearsal view opens `Edit Script` directly to the expanded `Rehearsal Bullets` panel.
  - `Edit Script` footer includes a `Copy Speech` action that copies the current draft text, including unsaved edits.
  - script text size is user-controlled with a `16-28` slider and stored in local browser storage.
  - script line spacing is also user-controlled with a persistent slider.
  - paragraph spacing in reading views is user-controlled with a persistent slider.
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
  - the `Versions` speech body is intentionally compact and scrollable.
  - `Edit Script` pills are green-themed.
  - `Edit Meta` pills are pink-themed.

## Cache Note

- Important: when speeches UI changes appear not to register after deploy, check for stale cached JS.
- The speeches page currently cache-busts the module URL in `index.html`:
  - `./assets/js/brajesh-speeches.js?v=20260512a`
- If future speeches JS changes appear missing in production, bump that query-string version.

## Useful Starting Point

For Codex rehydration, read:

1. `/Volumes/T7/kritika4/.codex/memories/speeches-codebase.md`
2. `README.md`
3. `index.html`
4. `assets/js/brajesh-speeches.js`
5. the latest relevant `supabase/*.sql` migration files

Use `/Volumes/T7/kritika4/.codex/memories/brajesh-codebase.md` only for shared infra and cross-repo history, not as the canonical `speeches` memory source.
