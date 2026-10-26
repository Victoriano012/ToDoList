import { auth } from "@/auth";

// Cookie holding the id of the list the user last opened, so the PWA's
// start_url "/" reopens it.
export const LIST_COOKIE = "listId";

export async function userId() {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) throw new Error("unauthenticated");
  return id;
}
