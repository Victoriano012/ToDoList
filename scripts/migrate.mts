import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL!);

await sql`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    parent_id TEXT REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL DEFAULT '',
    checkable BOOLEAN NOT NULL DEFAULT TRUE,
    done_at TIMESTAMPTZ,
    collapsed BOOLEAN NOT NULL DEFAULT FALSE,
    position DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;
await sql`CREATE INDEX IF NOT EXISTS tasks_user_idx ON tasks (user_id)`;
console.log("migrated");
