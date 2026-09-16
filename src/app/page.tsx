import { auth, signIn, signOut } from "@/auth";
import TaskList from "@/components/task-list";
import { listTasks } from "@/lib/tasks";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();
  if (!session?.user) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 p-6">
        <h1 className="text-2xl font-semibold">Tasks</h1>
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
      <header className="mb-4 flex items-baseline justify-between px-2">
        <h1 className="text-xl font-semibold">Tasks</h1>
        <form
          action={async () => {
            "use server";
            await signOut();
          }}
        >
          <button type="submit" className="text-xs text-muted hover:underline">
            Sign out
          </button>
        </form>
      </header>
      <TaskList initial={tasks} />
    </main>
  );
}
