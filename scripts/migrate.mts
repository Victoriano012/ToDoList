import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

await sql`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'task',
    done_at TIMESTAMPTZ,
    collapsed BOOLEAN NOT NULL DEFAULT FALSE,
    position DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS tasks_user_idx ON tasks (user_id)`;

// 'task' | 'heading' | 'text', replacing the old `checkable` boolean.
await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'task'`;
await sql`
  DO $$
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'tasks' AND column_name = 'checkable'
    ) THEN
      UPDATE tasks SET kind = 'heading' WHERE checkable = FALSE;
    END IF;
  END
  $$
`;
await sql`ALTER TABLE tasks DROP COLUMN IF EXISTS checkable`;

console.log("migrated");
