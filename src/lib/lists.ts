"use server";

import { cookies } from "next/headers";
import { sql } from "@/lib/db";
import { LIST_COOKIE, userId } from "@/lib/session";
import type { List } from "@/lib/types";

type Row = { id: string; name: string; position: number };

async function setCurrent(id: string) {
  (await cookies()).set(LIST_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function listLists(): Promise<List[]> {
  const uid = await userId();
  const rows = (await sql`
    SELECT id, name, position FROM lists WHERE user_id = ${uid} ORDER BY position
  `) as Row[];
  return rows.map((r) => ({ id: r.id, name: r.name, position: r.position }));
}

export async function createList(name: string): Promise<List> {
  const uid = await userId();
  const [{ next }] = (await sql`
    SELECT COALESCE(MAX(position), 0) + 1 AS next FROM lists WHERE user_id = ${uid}
  `) as { next: number }[];
  const list: List = { id: crypto.randomUUID(), name, position: next };
  await sql`
    INSERT INTO lists (id, user_id, name, position)
    VALUES (${list.id}, ${uid}, ${list.name}, ${list.position})
  `;
  return list;
}

export async function renameList(id: string, name: string) {
  const uid = await userId();
  await sql`UPDATE lists SET name = ${name} WHERE id = ${id} AND user_id = ${uid}`;
}

// Deleting a list deletes its tasks (ON DELETE CASCADE). The last list is
// never deleted, so the user always has somewhere to put tasks.
export async function deleteList(id: string) {
  const uid = await userId();
  const rows = (await sql`
    SELECT id FROM lists WHERE user_id = ${uid} ORDER BY position
  `) as { id: string }[];
  if (rows.length <= 1 || !rows.some((r) => r.id === id)) return;
  await sql`DELETE FROM lists WHERE id = ${id} AND user_id = ${uid}`;
  const cookie = await cookies();
  if (cookie.get(LIST_COOKIE)?.value === id) {
    await setCurrent(rows.find((r) => r.id !== id)!.id);
  }
}

// Picking a list: the cookie mutation makes Next re-render the page with it.
export async function selectList(id: string) {
  const uid = await userId();
  const rows = (await sql`
    SELECT id FROM lists WHERE id = ${id} AND user_id = ${uid}
  `) as { id: string }[];
  if (rows.length) await setCurrent(id);
}
