"use server";

import { sql } from "@/lib/db";
import { userId } from "@/lib/session";
import type { Task, TaskKind, TaskPatch } from "@/lib/types";

type Row = {
  id: string;
  list_id: string;
  parent_id: string | null;
  title: string;
  kind: TaskKind;
  done_at: string | null;
  collapsed: boolean;
  position: number;
};

export async function listTasks(listId: string): Promise<Task[]> {
  const uid = await userId();
  const rows = (await sql`
    SELECT id, list_id, parent_id, title, kind, done_at, collapsed, position
    FROM tasks WHERE user_id = ${uid} AND list_id = ${listId} ORDER BY position
  `) as Row[];
  return rows.map((r) => ({
    id: r.id,
    listId: r.list_id,
    parentId: r.parent_id,
    title: r.title,
    kind: r.kind,
    doneAt: r.done_at ? new Date(r.done_at).toISOString() : null,
    collapsed: r.collapsed,
    position: r.position,
  }));
}

// The INSERT only lands if the target list is one of the user's own.
export async function createTask(task: Task) {
  const uid = await userId();
  await sql`
    INSERT INTO tasks (id, user_id, list_id, parent_id, title, kind, done_at, collapsed, position)
    SELECT ${task.id}::text, ${uid}::text, ${task.listId}::text, ${task.parentId}::text,
           ${task.title}::text, ${task.kind}::text, ${task.doneAt}::timestamptz,
           ${task.collapsed}::boolean, ${task.position}::double precision
    WHERE EXISTS (SELECT 1 FROM lists WHERE id = ${task.listId} AND user_id = ${uid})
  `;
}

export async function updateTask(id: string, patch: TaskPatch) {
  const uid = await userId();
  await sql`
    UPDATE tasks SET
      parent_id = CASE WHEN ${"parentId" in patch} THEN ${patch.parentId ?? null} ELSE parent_id END,
      title     = COALESCE(${patch.title ?? null}, title),
      kind      = COALESCE(${patch.kind ?? null}, kind),
      done_at   = CASE WHEN ${"doneAt" in patch} THEN ${patch.doneAt ?? null}::timestamptz ELSE done_at END,
      collapsed = COALESCE(${patch.collapsed ?? null}, collapsed),
      position  = COALESCE(${patch.position ?? null}, position)
    WHERE id = ${id} AND user_id = ${uid}
  `;
}

export async function deleteTask(id: string) {
  const uid = await userId();
  await sql`DELETE FROM tasks WHERE id = ${id} AND user_id = ${uid}`;
}
