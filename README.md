# ToDo

Nested to-do list. Next.js + Auth.js (Google) + Neon Postgres, deployed on Vercel.

- Tasks nest arbitrarily; the arrow collapses a task's subtasks.
- Completed tasks drop below a thin line at the end of their list; tap the line to show/hide them (most recently finished first).
- Long-press a task and drag to reorder it or drop it onto another task to nest it. # turns a task into a heading (no circle), × deletes it.
- Keyboard: Enter = new task, Tab / Shift+Tab = indent / outdent, Alt+↑/↓ = move, Backspace on empty = delete.

## Development

```
vercel env pull .env.local
npm install
npx tsx --env-file=.env.local scripts/migrate.mts   # once, creates the tasks table
npm run dev
```
