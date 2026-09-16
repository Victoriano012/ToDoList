import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  trustHost: true,
  callbacks: {
    jwt({ token, account }) {
      if (account?.providerAccountId) token.uid = account.providerAccountId;
      return token;
    },
    session({ session, token }) {
      session.user.id = token.uid as string;
      return session;
    },
  },
});
