"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createTask, deleteTask, updateTask } from "@/lib/tasks";
import type { Task, TaskPatch } from "@/lib/types";

const INDENT = 22;

type Ctx = {
  tasks: Task[];
  active: (parentId: string | null) => Task[];
  done: (parentId: string | null) => Task[];
  shownDone: Set<string>;
  toggleShownDone: (parentId: string | null) => void;
  focusRef: React.MutableRefObject<string | null>;
  menuId: string | null;
  setMenuId: (id: string | null) => void;
  patch: (id: string, p: TaskPatch) => void;
  add: (parentId: string | null, afterId?: string | null, atTop?: boolean) => void;
  remove: (id: string) => void;
  toggleDone: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  focusNeighbor: (id: string, dir: -1 | 1) => void;
  saveTitle: (id: string, title: string) => void;
};

const TasksCtx = createContext<Ctx>(null!);
const doneKey = (parentId: string | null) => parentId ?? "root";

export default function TaskList({ initial }: { initial: Task[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [shownDone, setShownDone] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const focusRef = useRef<string | null>(null);
  const pending = useRef(0);
  const titleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Server data changed (router.refresh) and nothing is in flight → adopt it.
  useEffect(() => {
    if (pending.current === 0) setTasks(initial);
  }, [initial]);

  // Re-sync when coming back to the tab (e.g. after editing on another device).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && pending.current === 0) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [router]);

  const run = useCallback(
    (fn: () => Promise<unknown>) => {
      pending.current++;
      fn()
        .catch(() => router.refresh())
        .finally(() => pending.current--);
    },
    [router],
  );

  const byParent = useMemo(() => {
    const m = new Map<string | null, Task[]>();
    for (const t of tasks) {
      const arr = m.get(t.parentId) ?? [];
      arr.push(t);
      m.set(t.parentId, arr);
    }
    return m;
  }, [tasks]);

  const active = useCallback(
    (parentId: string | null) =>
      (byParent.get(parentId) ?? [])
        .filter((t) => !t.doneAt)
        .sort((a, b) => a.position - b.position),
    [byParent],
  );
  const done = useCallback(
    (parentId: string | null) =>
      (byParent.get(parentId) ?? [])
        .filter((t) => t.doneAt)
        .sort((a, b) => (a.doneAt! < b.doneAt! ? 1 : -1)),
    [byParent],
  );

  const patch = useCallback(
    (id: string, p: TaskPatch) => {
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...p } : t)));
      run(() => updateTask(id, p));
    },
    [run],
  );

  const saveTitle = useCallback(
    (id: string, title: string) => {
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, title } : t)));
      const timers = titleTimers.current;
      if (timers.has(id)) clearTimeout(timers.get(id)!);
      else pending.current++;
      timers.set(
        id,
        setTimeout(() => {
          timers.delete(id);
          pending.current--;
          run(() => updateTask(id, { title }));
        }, 400),
      );
    },
    [run],
  );

  const add = useCallback(
    (parentId: string | null, afterId?: string | null, atTop = false) => {
      const siblings = active(parentId);
      const all = byParent.get(parentId) ?? [];
      let position: number;
      if (atTop) {
        position = (siblings[0]?.position ?? 1) - 1;
      } else if (afterId) {
        const i = siblings.findIndex((t) => t.id === afterId);
        const after = siblings[i];
        const next = siblings[i + 1];
        position = next ? (after.position + next.position) / 2 : after.position + 1;
      } else {
        position = Math.max(0, ...all.map((t) => t.position)) + 1;
      }
      const task: Task = {
        id: crypto.randomUUID(),
        parentId,
        title: "",
        checkable: true,
        doneAt: null,
        collapsed: false,
        position,
      };
      focusRef.current = task.id;
      setTasks((ts) => [...ts, task]);
      run(() => createTask(task));
    },
    [active, byParent, run],
  );

  // Flattened list of rows currently visible on screen, in reading order.
  const visibleOrder = useMemo(() => {
    const out: Task[] = [];
    const walk = (parentId: string | null) => {
      for (const t of active(parentId)) {
        out.push(t);
        if (!t.collapsed) walk(t.id);
      }
      if (shownDone.has(doneKey(parentId))) {
        for (const t of done(parentId)) {
          out.push(t);
          if (!t.collapsed) walk(t.id);
        }
      }
    };
    walk(null);
    return out;
  }, [active, done, shownDone]);

  const focusNeighbor = useCallback(
    (id: string, dir: -1 | 1) => {
      const i = visibleOrder.findIndex((t) => t.id === id);
      const target = visibleOrder[i + dir];
      if (target) document.getElementById(`title-${target.id}`)?.focus();
    },
    [visibleOrder],
  );

  const remove = useCallback(
    (id: string) => {
      const i = visibleOrder.findIndex((t) => t.id === id);
      const prev = visibleOrder[i - 1];
      if (prev) focusRef.current = prev.id;
      setTasks((ts) => {
        const gone = new Set([id]);
        let grew = true;
        while (grew) {
          grew = false;
          for (const t of ts) {
            if (t.parentId && gone.has(t.parentId) && !gone.has(t.id)) {
              gone.add(t.id);
              grew = true;
            }
          }
        }
        return ts.filter((t) => !gone.has(t.id));
      });
      run(() => deleteTask(id));
    },
    [run, visibleOrder],
  );

  const toggleDone = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id)!;
      if (t.doneAt) {
        const bottom = Math.max(0, ...active(t.parentId).map((s) => s.position)) + 1;
        patch(id, { doneAt: null, position: bottom });
      } else {
        patch(id, { doneAt: new Date().toISOString() });
      }
    },
    [tasks, active, patch],
  );

  const indent = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id)!;
      const siblings = active(t.parentId);
      const prev = siblings[siblings.findIndex((s) => s.id === id) - 1];
      if (!prev) return;
      const bottom = Math.max(0, ...(byParent.get(prev.id) ?? []).map((s) => s.position)) + 1;
      if (prev.collapsed) patch(prev.id, { collapsed: false });
      focusRef.current = id; // row remounts under its new parent
      patch(id, { parentId: prev.id, position: bottom });
    },
    [tasks, active, byParent, patch],
  );

  const outdent = useCallback(
    (id: string) => {
      const t = tasks.find((x) => x.id === id)!;
      if (!t.parentId) return;
      const parent = tasks.find((x) => x.id === t.parentId)!;
      const siblings = active(parent.parentId);
      const i = siblings.findIndex((s) => s.id === parent.id);
      const next = siblings[i + 1];
      const position = next ? (parent.position + next.position) / 2 : parent.position + 1;
      focusRef.current = id;
      patch(id, { parentId: parent.parentId, position });
    },
    [tasks, active, patch],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const t = tasks.find((x) => x.id === id)!;
      const siblings = active(t.parentId);
      const i = siblings.findIndex((s) => s.id === id);
      const other = siblings[i + dir];
      if (!other) return;
      patch(id, { position: other.position });
      patch(other.id, { position: t.position });
    },
    [tasks, active, patch],
  );

  const toggleShownDone = useCallback((parentId: string | null) => {
    setShownDone((s) => {
      const n = new Set(s);
      const k = doneKey(parentId);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });
  }, []);

  useEffect(() => {
    if (!menuId) return;
    // Listeners live on document (same node as React's root), so the menu is
    // identified by data-menu rather than by stopping propagation.
    const onPointer = (e: PointerEvent) => {
      if (!(e.target as Element).closest("[data-menu]")) setMenuId(null);
    };
    const onKey = () => setMenuId(null);
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuId]);

  const ctx: Ctx = {
    tasks,
    active,
    done,
    shownDone,
    toggleShownDone,
    focusRef,
    menuId,
    setMenuId,
    patch,
    add,
    remove,
    toggleDone,
    indent,
    outdent,
    move,
    focusNeighbor,
    saveTitle,
  };

  return (
    <TasksCtx.Provider value={ctx}>
      <List parentId={null} depth={0} />
      <button
        type="button"
        onClick={() => add(null)}
        className="mt-1 flex h-10 w-full items-center gap-2 rounded-md px-2 text-left text-muted hover:bg-hover"
      >
        <span className="w-5 text-center text-lg leading-none">+</span>
        <span>Add task</span>
      </button>
    </TasksCtx.Provider>
  );
}

function List({ parentId, depth }: { parentId: string | null; depth: number }) {
  const { active, done, shownDone, toggleShownDone } = useContext(TasksCtx);
  const activeTasks = active(parentId);
  const doneTasks = done(parentId);
  const shown = shownDone.has(doneKey(parentId));
  return (
    <ul>
      {activeTasks.map((t) => (
        <Row key={t.id} task={t} depth={depth} />
      ))}
      {doneTasks.length > 0 && (
        <li style={{ paddingLeft: depth * INDENT }}>
          <button
            type="button"
            onClick={() => toggleShownDone(parentId)}
            className="group flex h-7 w-full items-center gap-2 px-2"
            aria-label={shown ? "Hide completed" : "Show completed"}
          >
            <span className="h-px flex-1 bg-line group-hover:bg-muted" />
            <span className="text-xs text-muted">
              {shown ? "hide" : doneTasks.length}
            </span>
          </button>
        </li>
      )}
      {shown && doneTasks.map((t) => <Row key={t.id} task={t} depth={depth} />)}
    </ul>
  );
}

function Row({ task: t, depth }: { task: Task; depth: number }) {
  const ctx = useContext(TasksCtx);
  const { focusRef } = ctx;
  const ref = useRef<HTMLTextAreaElement>(null);
  const hasChildren = ctx.tasks.some((x) => x.parentId === t.id);
  const isDone = !!t.doneAt;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = `${el.scrollHeight}px`;
  }, [t.title]);

  useEffect(() => {
    if (focusRef.current === t.id && ref.current) {
      focusRef.current = null;
      const el = ref.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  });

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (hasChildren && !t.collapsed && ctx.active(t.id).length) ctx.add(t.id, null, true);
      else ctx.add(t.parentId, t.id);
    } else if (e.key === "Tab") {
      e.preventDefault();
      if (e.shiftKey) ctx.outdent(t.id);
      else ctx.indent(t.id);
    } else if (e.key === "Backspace" && t.title === "" && !hasChildren) {
      e.preventDefault();
      ctx.remove(t.id);
    } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && (e.altKey || e.metaKey)) {
      e.preventDefault();
      ctx.move(t.id, e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      ctx.focusNeighbor(t.id, e.key === "ArrowUp" ? -1 : 1);
    } else if (e.key === "Escape") {
      ref.current?.blur();
    }
  };

  return (
    <li>
      <div
        className="group relative flex items-start gap-1 rounded-md hover:bg-hover"
        style={{ paddingLeft: depth * INDENT }}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={() => ctx.patch(t.id, { collapsed: !t.collapsed })}
          className={`flex h-10 w-6 shrink-0 items-center justify-center text-muted ${
            hasChildren ? "" : "invisible"
          }`}
          aria-label={t.collapsed ? "Expand" : "Collapse"}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            className={`transition-transform ${t.collapsed ? "" : "rotate-90"}`}
          >
            <path d="M3 1l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>

        {t.checkable ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => ctx.toggleDone(t.id)}
            className="flex h-10 w-7 shrink-0 items-center justify-center"
            aria-label={isDone ? "Mark not done" : "Mark done"}
          >
            <span
              className={`flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] ${
                isDone ? "border-accent bg-accent text-white" : "border-muted"
              }`}
            >
              {isDone && (
                <svg width="10" height="10" viewBox="0 0 10 10">
                  <path d="M2 5l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
                </svg>
              )}
            </span>
          </button>
        ) : (
          <span className="w-1 shrink-0" />
        )}

        <textarea
          id={`title-${t.id}`}
          ref={ref}
          rows={1}
          value={t.title}
          placeholder={t.checkable ? "New task" : "Heading"}
          onChange={(e) => ctx.saveTitle(t.id, e.target.value.replace(/\n/g, ""))}
          onKeyDown={onKeyDown}
          className={`min-h-10 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none placeholder:text-muted/60 ${
            t.checkable ? "" : "font-semibold"
          } ${isDone ? "text-muted line-through" : ""}`}
        />

        <button
          type="button"
          tabIndex={-1}
          data-menu
          onClick={() => ctx.setMenuId(ctx.menuId === t.id ? null : t.id)}
          className="flex h-10 w-8 shrink-0 items-center justify-center text-muted sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
          aria-label="Task options"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <circle cx="2" cy="7" r="1.3" />
            <circle cx="7" cy="7" r="1.3" />
            <circle cx="12" cy="7" r="1.3" />
          </svg>
        </button>

        {ctx.menuId === t.id && <Menu task={t} />}
      </div>
      {hasChildren && !t.collapsed && <List parentId={t.id} depth={depth + 1} />}
    </li>
  );
}

function Menu({ task: t }: { task: Task }) {
  const ctx = useContext(TasksCtx);
  const act = (fn: () => void) => () => {
    ctx.setMenuId(null);
    fn();
  };
  const items: [string, () => void, string?][] = [
    ["Add subtask", () => ctx.add(t.id)],
    ["Indent", () => ctx.indent(t.id)],
    ["Outdent", () => ctx.outdent(t.id)],
    ["Move up", () => ctx.move(t.id, -1)],
    ["Move down", () => ctx.move(t.id, 1)],
    [
      t.checkable ? "Make heading" : "Make task",
      () => ctx.patch(t.id, { checkable: !t.checkable, ...(t.checkable ? { doneAt: null } : {}) }),
    ],
    ["Delete", () => ctx.remove(t.id), "text-red-600 dark:text-red-400"],
  ];
  return (
    <div
      data-menu
      className="absolute right-2 top-9 z-10 w-40 overflow-hidden rounded-lg border border-line bg-background py-1 shadow-lg"
    >
      {items.map(([label, fn, cls]) => (
        <button
          key={label}
          type="button"
          onClick={act(fn)}
          className={`block w-full px-3 py-2 text-left text-sm hover:bg-hover ${cls ?? ""}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
