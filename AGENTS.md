# Speeches Repo Instructions

Read `/Volumes/T7/kritika4/.codex/memories/speeches-codebase.md` first for Codex memory, then read [README.md](./README.md) for repo docs before exploring the codebase.

## Repo Shape
- This is the standalone `speeches` repo, not a subfolder inside the main Brajesh repo.
- Production publishes from repo root to `https://speeches.brajesh.com/`.
- Frontend is plain HTML/CSS/JS with Supabase; there is no build step.

## Working Rules
- For user-facing changes, commit and push `origin main` by default unless the user explicitly says to keep work local.
- Do not stop at local edits when the request is clearly meant to go live.
- Minimize back-and-forth questions. Make reasonable assumptions to keep the flow moving unless the choice is high-risk, destructive, or blocked by missing credentials or permissions.
- If `assets/js/brajesh-speeches.js` changes, bump the cache-bust query string in `index.html`.
- For Supabase schema changes:
  - add a migration under `supabase/`
  - apply it live when the feature depends on it
  - use the known temp-workdir + `../Chess/node_modules/.bin/supabase db push` workflow if direct local linking is unreliable
- Never revert unrelated user changes in the worktree.

## Session Hygiene
- Prefer `rg` / `rg --files` for search.
- Update `/Volumes/T7/kritika4/.codex/memories/speeches-codebase.md` when major behavior, deployment workflow, or schema state changes.
- Keep `README.md` focused on stable repo/product docs; keep Codex rehydration notes in `/Volumes/T7/kritika4/.codex/memories/speeches-codebase.md`.
- Before shutdown, save any important repo-specific agent context to `/Volumes/T7/kritika4/.codex/memories/speeches-codebase.md` if it is not already captured.
