# Speeches Website Notes

Local context note for sessions started in the standalone `speeches` repo.

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

- `brajesh_speeches`
  - parent speech record
  - title, status, goal, core idea, tags, notes, active version
- `brajesh_speech_versions`
  - one speech can have many versions
  - full script, revision note, target minutes, rehearsal bullets
- `brajesh_speech_runs`
  - delivered instances / run history
  - date, venue, version used, feedback, evaluator notes, next actions

## Main UI Areas

- library with search and status filters
- overview tab
- versions tab
- runs tab
- fullscreen rehearsal mode

## Important Behavior

- Creating a new speech also creates its first version.
- Saving a version updates the speech's `active_version_id`.
- The selected version can be deleted from `Versions`, but each speech keeps at least one version.
- Logging a run usually moves the speech to `delivered`, except when:
  - the speech is still `idea`
  - the run result is `scheduled`
- Rehearsal mode shows one bullet at a time.
- Rehearsal navigation:
  - click/tap or `Space` / right arrow = next
  - left arrow = previous
  - `Escape` = exit

## Recent UI State

- As of 2026-05-10:
  - `Versions` uses a collapsible `Version History` panel.
  - `Versions` shows explicit `Last edited` timestamps with local time.
  - `Versions` shows each listed draft's word count in `Version History`.
  - `Versions` has a `Compare` mode beside `Edit Script`.
  - compare uses the version's authored base version first, and falls back to the previous version by time when no base version is set.
  - the selected version can be deleted from the `Versions` detail header when the speech has more than one version.
  - `Edit Script` uses a collapsible `Rehearsal Bullets` panel.
  - script text size is user-controlled with a `16-28` slider and stored in local browser storage.
  - the same script text-size setting affects:
    - overview speech body
    - versions speech body
    - `Edit Script` speech-body textarea
  - `Edit Script` speech body auto-sizes to content in the editor.
  - the `Versions` speech body is intentionally compact and scrollable.
  - `Edit Script` pills are green-themed.
  - `Edit Meta` pills are pink-themed.

## Cache Note

- Important: when speeches UI changes appear not to register after deploy, check for stale cached JS.
- The speeches page currently cache-busts the module URL in `index.html`:
  - `./assets/js/brajesh-speeches.js?v=20260510c`
- If future speeches JS changes appear missing in production, bump that query-string version.

## Useful Starting Point

When starting work from this repo, read:

1. `README.md`
2. `index.html`
3. `assets/js/brajesh-speeches.js`
4. `supabase/20260506143000_add_brajesh_speeches.sql`

There is also broader repo memory in `/Volumes/T7/kritika4/.codex/memories/brajesh-codebase.md`, but this local file is the fastest place to rehydrate speeches-specific context.
