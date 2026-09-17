import { auth, signIn, signOut } from "@/auth";
import TaskList from "@/components/task-list";
import { listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-semibold">ToDo</h1>
        <form
          action={async () => {
            "use server";
            await signIn("google");
          }}
        >
          <button
            type="submit"
            className="rounded-full border border-line px-5 py-2.5 text-sm font-medium hover:bg-hover"
          >
            Continue with Google
          </button>
        </form>
      </main>
    );
  }

  const tasks = await listTasks();
  return (
    <main className="mx-auto max-w-2xl px-3 pb-24 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <header className="mb-4 flex items-center justify-between px-2">
        <h1 className="text-xl font-semibold">ToDo</h1>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button
            type="submit"
            aria-label="Sign out"
            className="flex h-8 w-8 items-center justify-center text-muted hover:text-foreground"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </form>
      </header>
      <TaskList initial={tasks} />
    </main>
  );
}
