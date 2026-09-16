export type Task = {
  id: string;
  parentId: string | null;
  title: string;
  checkable: boolean;
  doneAt: string | null; // ISO timestamp, null = not done
  collapsed: boolean;
  position: number;
};

export type TaskPatch = Partial<
  Pick<Task, "parentId" | "title" | "checkable" | "doneAt" | "collapsed" | "position">
>;
