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

// Children of a heading indent by INDENT, children of a checkable task by
// 2 * INDENT; the collapse arrow hangs in a GUTTER left of every row.
const INDENT = 16;
const GUTTER = 20;

type DropZone = "before" | "after" | "into";
type Drag = { id: string; y: number; target: { id: string; zone: DropZone } | null };

type Ctx = {
  tasks: Task[];
  active: (parentId: string | null) => Task[];
  done: (parentId: string | null) => Task[];
  shownDone: Set<string>;
  toggleShownDone: (parentId: string | null) => void;
  focusRef: React.MutableRefObject<string | null>;
  patch: (id: string, p: TaskPatch) => void;
  add: (parentId: string | null, afterId?: string | null, atTop?: boolean) => void;
  remove: (id: string) => void;
  toggleDone: (id: string) => void;
  indent: (id: string) => void;
  outdent: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  focusNeighbor: (id: string, dir: -1 | 1) => void;
  saveTitle: (id: string, title: string) => void;
  drag: Drag | null;
  beginDrag: (id: string, e: React.PointerEvent<HTMLElement>) => void;
  draggedRef: React.MutableRefObject<boolean>;
};

const TasksCtx = createContext<Ctx>(null!);
const doneKey = (parentId: string | null) => parentId ?? "root";

function descendantsOf(tasks: Task[], id: string) {
  const set = new Set([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const t of tasks) {
      if (t.parentId && set.has(t.parentId) && !set.has(t.id)) {
        set.add(t.id);
        grew = true;
      }
    }
  }
  return set;
}

// Which visible row is under clientY, and whether the pointer is on its top
// quarter (drop before), bottom quarter (drop after) or middle (nest into).
function findTarget(tasks: Task[], dragId: string, y: number): Drag["target"] {
  const skip = descendantsOf(tasks, dragId);
  for (const el of document.querySelectorAll<HTMLElement>("[data-row]")) {
    const id = el.dataset.row!;
    if (skip.has(id) || el.dataset.done) continue;
    const r = el.getBoundingClientRect();
    if (y < r.top || y > r.bottom) continue;
    const f = (y - r.top) / r.height;
    return { id, zone: f < 0.25 ? "before" : f > 0.75 ? "after" : "into" };
  }
  return null;
}

export default function TaskList({ initial }: { initial: Task[] }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [shownDone, setShownDone] = useState<Set<string>>(new Set());
  const focusRef = useRef<string | null>(null);
  const pending = useRef(0);
  const titleTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const draggedRef = useRef(false); // suppresses the click that follows a drag
  const tasksRef = useRef(tasks);
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

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

  const drop = useCallback(
    (d: Drag) => {
      if (!d.target) return;
      const ts = tasksRef.current;
      const target = ts.find((x) => x.id === d.target!.id)!;
      const childrenOf = (pid: string | null) =>
        ts.filter((x) => x.parentId === pid && !x.doneAt && x.id !== d.id).sort((a, b) => a.position - b.position);
      let parentId: string | null;
      let position: number;
      if (d.target.zone === "into") {
        parentId = target.id;
        position = Math.max(0, ...ts.filter((x) => x.parentId === target.id).map((x) => x.position)) + 1;
        if (target.collapsed) patch(target.id, { collapsed: false });
      } else if (d.target.zone === "before") {
        parentId = target.parentId;
        const sib = childrenOf(parentId);
        const prev = sib[sib.findIndex((x) => x.id === target.id) - 1];
        position = prev ? (prev.position + target.position) / 2 : target.position - 1;
      } else {
        const kids = childrenOf(target.id);
        if (kids.length && !target.collapsed) {
          // Below an expanded parent means "first subtask".
          parentId = target.id;
          position = kids[0].position - 1;
        } else {
          parentId = target.parentId;
          const sib = childrenOf(parentId);
          const next = sib[sib.findIndex((x) => x.id === target.id) + 1];
          position = next ? (target.position + next.position) / 2 : target.position + 1;
        }
      }
      patch(d.id, { parentId, position });
    },
    [patch],
  );

  // Long-press on a row starts a drag; moving first (scroll / text selection)
  // cancels it. A plain tap focuses the row's textarea ourselves, because
  // unfocused textareas are user-select: none (so iOS's native long-press does
  // nothing on them) and iOS then won't focus them on tap.
  const beginDrag = useCallback(
    (id: string, e: React.PointerEvent<HTMLElement>) => {
      if ((e.target as Element).closest("button")) return;
      const row = e.currentTarget;
      const textarea = (e.target as Element).closest("textarea");
      const draggable = !tasksRef.current.find((x) => x.id === id)?.doneAt;
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      let started = false;
      let raf = 0;
      let startTime = 0;
      let pinnedY = 0;
      draggedRef.current = false;

      const update = (y: number) => {
        const d: Drag = { id, y, target: findTarget(tasksRef.current, id, y) };
        dragRef.current = d;
        setDrag(d);
      };
      const tick = () => {
        const d = dragRef.current;
        if (d) {
          const m = 70;
          const dy = d.y < m ? -(m - d.y) / 5 : d.y > innerHeight - m ? (d.y - (innerHeight - m)) / 5 : 0;
          if (dy) {
            scrollBy(0, dy);
            update(d.y);
          } else if (performance.now() - startTime < 400 && scrollY !== pinnedY) {
            // Keep the list still while the keyboard closes.
            scrollTo(0, pinnedY);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      // touch-action can't change mid-gesture, so page scrolling is blocked here.
      // touchend is blocked so the release doesn't turn into a click that focuses
      // the textarea (keyboard popping up mid-list). An open keyboard is dismissed
      // and the scroll position pinned so the list doesn't jump as it closes.
      const block = (ev: Event) => ev.preventDefault();
      const start = () => {
        started = true;
        draggedRef.current = true;
        startTime = performance.now();
        pinnedY = scrollY;
        if (document.activeElement instanceof HTMLTextAreaElement) document.activeElement.blur();
        row.setPointerCapture(pointerId);
        document.addEventListener("touchmove", block, { passive: false });
        document.addEventListener("touchend", block, { passive: false, once: true });
        document.addEventListener("contextmenu", block);
        raf = requestAnimationFrame(tick);
        update(startY);
      };
      const timer = draggable ? setTimeout(start, 350) : undefined;

      const onMove = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        if (started) update(ev.clientY);
        else if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 8) end(false);
      };
      const end = (commit: boolean) => {
        clearTimeout(timer);
        cancelAnimationFrame(raf);
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("pointercancel", onCancel);
        document.removeEventListener("touchmove", block);
        // pointerup precedes touchend, so let the blocker see it before removing.
        setTimeout(() => document.removeEventListener("touchend", block));
        document.removeEventListener("contextmenu", block);
        if (commit && dragRef.current) drop(dragRef.current);
        dragRef.current = null;
        setDrag(null);
      };
      const onUp = () => {
        const tap = !started;
        end(true);
        if (tap && textarea && document.activeElement !== textarea) {
          textarea.focus();
          textarea.setSelectionRange(textarea.value.length, textarea.value.length);
        }
      };
      const onCancel = () => end(false);
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
      document.addEventListener("pointercancel", onCancel);
    },
    [drop],
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

  const ctx: Ctx = {
    tasks,
    active,
    done,
    shownDone,
    toggleShownDone,
    focusRef,
    patch,
    add,
    remove,
    toggleDone,
    indent,
    outdent,
    move,
    focusNeighbor,
    saveTitle,
    drag,
    beginDrag,
    draggedRef,
  };
  const dragged = drag && tasks.find((t) => t.id === drag.id);

  return (
    <TasksCtx.Provider value={ctx}>
      <div className={drag ? "select-none" : ""}>
        <List parentId={null} indent={0} />
      </div>
      {dragged && (
        <div
          className="pointer-events-none fixed left-6 z-50 max-w-[75vw] truncate rounded-md border border-line bg-background px-3 py-2 text-base shadow-lg"
          style={{ top: drag.y - 44 }}
        >
          {dragged.title || (dragged.checkable ? "New task" : "Heading")}
        </div>
      )}
      <button
        type="button"
        onClick={() => add(null)}
        className="mt-5 flex h-10 w-full items-center gap-1 rounded-md text-left text-muted hover:bg-hover"
        style={{ paddingLeft: GUTTER }}
      >
        <span className="w-6 text-center text-lg leading-none">+</span>
        <span>Add task</span>
      </button>
    </TasksCtx.Provider>
  );
}

function List({ parentId, indent }: { parentId: string | null; indent: number }) {
  const { active, done, shownDone, toggleShownDone } = useContext(TasksCtx);
  const activeTasks = active(parentId);
  const doneTasks = done(parentId);
  const shown = shownDone.has(doneKey(parentId));
  // Last element of this list; a spacer after its subtree would double up
  // with the parent's (or float the "Add task" button at root).
  const lastId = doneTasks.length && !shown ? null : (shown ? doneTasks : activeTasks).at(-1)?.id;
  return (
    <ul>
      {activeTasks.map((t) => (
        <Row key={t.id} task={t} indent={indent} last={t.id === lastId} />
      ))}
      {doneTasks.length > 0 && (
        <li style={{ paddingLeft: indent + GUTTER }}>
          <button
            type="button"
            onClick={() => toggleShownDone(parentId)}
            className="group flex h-4 w-full items-center gap-2 px-2"
            aria-label={shown ? "Hide completed" : "Show completed"}
          >
            <span className="h-px flex-1 bg-line group-hover:bg-muted" />
            {!shown && <span className="text-[10px] leading-none text-muted">{doneTasks.length}</span>}
          </button>
        </li>
      )}
      {shown && doneTasks.map((t) => <Row key={t.id} task={t} indent={indent} last={t.id === lastId} />)}
    </ul>
  );
}

function Row({ task: t, indent, last }: { task: Task; indent: number; last: boolean }) {
  const ctx = useContext(TasksCtx);
  const { focusRef, draggedRef } = ctx;
  const ref = useRef<HTMLTextAreaElement>(null);
  const hasChildren = ctx.tasks.some((x) => x.parentId === t.id);
  const isDone = !!t.doneAt;
  const zone = ctx.drag?.target?.id === t.id ? ctx.drag.target.zone : null;
  const dropCls =
    zone === "before"
      ? "shadow-[inset_0_2px_0_0_var(--accent)]"
      : zone === "after"
        ? "shadow-[inset_0_-2px_0_0_var(--accent)]"
        : zone === "into"
          ? "bg-accent/15"
          : ctx.drag?.id === t.id
            ? "opacity-40"
            : "";

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
        data-row={t.id}
        data-done={isDone || undefined}
        onPointerDown={(e) => ctx.beginDrag(t.id, e)}
        className={`relative flex items-start gap-1 rounded-md hover:bg-hover ${dropCls}`}
        style={{ paddingLeft: indent + GUTTER }}
      >
        {hasChildren && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => ctx.patch(t.id, { collapsed: !t.collapsed })}
            className="absolute top-0 flex h-10 w-5 items-center justify-center text-muted"
            style={{ left: indent }}
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
        )}

        {t.checkable ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => ctx.toggleDone(t.id)}
            className="flex h-10 w-6 shrink-0 items-center justify-center"
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
          onClick={(e) => {
            if (draggedRef.current) {
              draggedRef.current = false;
              e.currentTarget.blur();
            }
          }}
          className={`min-h-10 flex-1 resize-none bg-transparent py-2 text-base leading-6 outline-none [-webkit-touch-callout:none] placeholder:text-muted/60 ${
            ctx.drag ? "select-none" : "select-none focus:select-auto"
          } ${t.checkable ? "" : "font-semibold"} ${isDone ? "text-muted line-through" : ""}`}
        />

        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => ctx.patch(t.id, { checkable: !t.checkable, ...(t.checkable ? { doneAt: null } : {}) })}
          className={`flex h-10 w-8 shrink-0 items-center justify-center text-lg ${
            t.checkable ? "text-muted" : "font-bold text-foreground"
          }`}
          aria-label="Toggle heading"
        >
          #
        </button>

        <button
          type="button"
          tabIndex={-1}
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => ctx.remove(t.id)}
          className="flex h-10 w-8 shrink-0 items-center justify-center text-muted hover:text-red-600 dark:hover:text-red-400"
          aria-label="Delete"
        >
          <svg width="12" height="12" viewBox="0 0 12 12">
            <path d="M2 2l8 8M10 2l-8 8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
      {hasChildren && !t.collapsed && (
        <>
          <List parentId={t.id} indent={indent + (t.checkable ? 2 * INDENT : INDENT)} />
          {!last && <div className="h-10" />}
        </>
      )}
    </li>
  );
}
