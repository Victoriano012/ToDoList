export type TaskKind = "task" | "heading" | "text";

export type List = {
  id: string;
  name: string;
  position: number;
};

export type Task = {
  id: string;
  listId: string;
  parentId: string | null;
  title: string;
  kind: TaskKind;
  doneAt: string | null; // ISO timestamp, null = not done
  collapsed: boolean;
  position: number;
};

export type TaskPatch = Partial<
  Pick<Task, "parentId" | "title" | "kind" | "doneAt" | "collapsed" | "position">
>;
