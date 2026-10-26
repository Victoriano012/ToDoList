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

// Lists: every task belongs to one.
await sql`
  CREATE TABLE IF NOT EXISTS lists (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL DEFAULT '',
    position DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS lists_user_idx ON lists (user_id)`;
await sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS list_id TEXT REFERENCES lists(id) ON DELETE CASCADE`;

// Backfill: each user with listless tasks gets a 'ToDo' list holding them.
await sql`
  WITH orphaned AS (
    SELECT DISTINCT user_id FROM tasks WHERE list_id IS NULL
  ), created AS (
    INSERT INTO lists (id, user_id, name, position)
    SELECT gen_random_uuid()::text, user_id, 'ToDo', 1 FROM orphaned
    RETURNING id, user_id
  )
  UPDATE tasks SET list_id = created.id
  FROM created
  WHERE tasks.user_id = created.user_id AND tasks.list_id IS NULL
`;

console.log("migrated");
