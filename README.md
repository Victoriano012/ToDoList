# Tasks

Nested to-do list. Next.js + Auth.js (Google) + Neon Postgres, deployed on Vercel.

- Tasks nest arbitrarily; the arrow collapses a task's subtasks.
- Completed tasks drop below a thin line at the end of their list; tap the line to show/hide them (most recently finished first).
- Per-task menu (⋯): add subtask, indent/outdent, move, turn into a heading (no circle), delete.
- Keyboard: Enter = new task, Tab / Shift+Tab = indent / outdent, Alt+↑/↓ = move, Backspace on empty = delete.

## Development

```
vercel env pull .env.local
npm install
npx tsx --env-file=.env.local scripts/migrate.mts   # once, creates the tasks table
npm run dev
```
