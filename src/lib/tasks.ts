"use server";

import { auth } from "@/auth";
import { sql } from "@/lib/db";
import type { Task, TaskPatch } from "@/lib/types";

async function userId() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("unauthenticated");
  return id;
}

type Row = {
  id: string;
  parent_id: string | null;
  title: string;
  checkable: boolean;
  done_at: string | null;
  collapsed: boolean;
  position: number;
};

export async function listTasks(): Promise<Task[]> {
  const uid = await userId();
  const rows = (await sql`
    SELECT id, parent_id, title, checkable, done_at, collapsed, position
    FROM tasks WHERE user_id = ${uid} ORDER BY position
  `) as Row[];
  return rows.map((r) => ({
    id: r.id,
    parentId: r.parent_id,
    title: r.title,
    checkable: r.checkable,
    doneAt: r.done_at ? new Date(r.done_at).toISOString() : null,
    collapsed: r.collapsed,
    position: r.position,
  }));
}

export async function createTask(task: Task) {
  const uid = await userId();
  await sql`
    INSERT INTO tasks (id, user_id, parent_id, title, checkable, done_at, collapsed, position)
    VALUES (${task.id}, ${uid}, ${task.parentId}, ${task.title}, ${task.checkable},
            ${task.doneAt}, ${task.collapsed}, ${task.position})
  `;
}

export async function updateTask(id: string, patch: TaskPatch) {
  const uid = await userId();
  await sql`
    UPDATE tasks SET
      parent_id = CASE WHEN ${"parentId" in patch} THEN ${patch.parentId ?? null} ELSE parent_id END,
      title     = COALESCE(${patch.title ?? null}, title),
      checkable = COALESCE(${patch.checkable ?? null}, checkable),
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
