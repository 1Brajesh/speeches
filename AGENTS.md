# Speeches Repo Instructions

Read [README.md](./README.md) first for fast project context before exploring the codebase.

## Repo Shape
- This is the standalone `speeches` repo, not a subfolder inside the main Brajesh repo.
- Production publishes from repo root to `https://speeches.brajesh.com/`.
- Frontend is plain HTML/CSS/JS with Supabase; there is no build step.

## Working Rules
- For user-facing changes, commit and push `origin main` by default unless the user explicitly says to keep work local.
- Do not stop at local edits when the request is clearly meant to go live.
- If `assets/js/brajesh-speeches.js` changes, bump the cache-bust query string in `index.html`.
- For Supabase schema changes:
  - add a migration under `supabase/`
  - apply it live when the feature depends on it
  - use the known temp-workdir + `../Chess/node_modules/.bin/supabase db push` workflow if direct local linking is unreliable
- Never revert unrelated user changes in the worktree.

## Session Hygiene
- Prefer `rg` / `rg --files` for search.
- Update local memory when major behavior, deployment workflow, or schema state changes.
- Before shutdown, save any important repo-specific context to `README.md` or shared memory if it is not already captured.

