"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createList, deleteList, renameList, selectList } from "@/lib/lists";
import type { List } from "@/lib/types";

// The header title doubles as the list switcher: tapping it opens a popover
// anchored under the title with the user's lists.
export default function ListSwitcher({
  lists,
  currentId,
}: {
  lists: List[];
  currentId: string;
}) {
  const router = useRouter();
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // Names being typed, shown until the server round-trip brings them back.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [, startTransition] = useTransition();

  const nameOf = (l: List) => drafts[l.id] ?? l.name;
  const current = lists.find((l) => l.id === currentId);

  const close = useCallback(() => {
    setOpen(false);
    setEditingId(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (editingId) setEditingId(null);
      else close();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, editingId, close]);

  const pick = (id: string) => {
    close();
    if (id === currentId) return;
    startTransition(async () => {
      await selectList(id);
    });
  };

  const commitName = (l: List) => {
    setEditingId(null);
    const name = drafts[l.id];
    if (name === undefined || name === l.name) return;
    startTransition(async () => {
      await renameList(l.id, name);
      router.refresh();
    });
  };

  const remove = (l: List) => {
    if (lists.length <= 1) return;
    if (!window.confirm(`Delete "${nameOf(l) || "Untitled"}" and its tasks?`)) return;
    startTransition(async () => {
      await deleteList(l.id);
      router.refresh();
    });
  };

  const addList = () => {
    startTransition(async () => {
      const l = await createList("");
      await selectList(l.id);
      setEditingId(l.id);
    });
  };

  const title = current ? nameOf(current) : "";

  return (
    <div ref={root} className="relative">
      <h1 className="text-xl font-semibold">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          onClick={() => (open ? close() : setOpen(true))}
          className="-mx-2 flex max-w-[60vw] items-center gap-1 rounded-md px-2 py-1 hover:bg-hover"
        >
          <span className={`truncate ${title ? "" : "text-muted"}`}>{title || "Untitled"}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={`shrink-0 text-muted transition-transform ${open ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </h1>

      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full z-50 mt-1 w-64 max-w-[80vw] rounded-lg border border-line bg-background p-1 text-base font-normal shadow-lg"
        >
          <div className="max-h-[60svh] overflow-y-auto">
            {lists.map((l) => (
              <div key={l.id} className="flex items-center">
                {editingId === l.id ? (
                  <input
                    autoFocus
                    value={nameOf(l)}
                    placeholder="List name"
                    onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                    onBlur={() => commitName(l)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    className="min-w-0 flex-1 rounded-md bg-hover px-2 py-2 outline-none placeholder:text-muted/60"
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => pick(l.id)}
                      className={`min-w-0 flex-1 truncate rounded-md px-2 py-2 text-left hover:bg-hover ${
                        l.id === currentId ? "font-medium text-accent" : ""
                      }`}
                    >
                      {nameOf(l) || <span className="text-muted/60">Untitled</span>}
                    </button>
                    <button
                      type="button"
                      aria-label="Rename list"
                      onClick={() => {
                        setDrafts((d) => ({ ...d, [l.id]: l.name }));
                        setEditingId(l.id);
                      }}
                      className="flex h-8 w-7 shrink-0 items-center justify-center text-muted hover:text-foreground"
                    >
                      <Icon>
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </Icon>
                    </button>
                    {lists.length > 1 && (
                      <button
                        type="button"
                        aria-label="Delete list"
                        onClick={() => remove(l)}
                        className="flex h-8 w-7 shrink-0 items-center justify-center text-muted hover:text-red-600 dark:hover:text-red-400"
                      >
                        <Icon>
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </Icon>
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addList}
            className="mt-1 w-full rounded-md border-t border-line px-2 py-2 text-left text-muted hover:bg-hover"
          >
            + New list
          </button>
        </div>
      )}
    </div>
  );
}

function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
