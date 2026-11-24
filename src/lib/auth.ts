import "server-only";
import { createHmac } from "node:crypto";
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { getDb, isDatabaseConfigured } from "@/db";
import type { User } from "@/db/schema";
import { getUserByGithubId, upsertUser } from "./core";

/**
 * Session signing secret. Uses NEXTAUTH_SECRET when set; otherwise derives one from the
 * GitHub client secret so a deploy only needs one secret pasted. Rotating the GitHub
 * secret then signs everyone out, which is fine.
 */
function sessionSecret(): string | undefined {
  if (process.env.NEXTAUTH_SECRET) return process.env.NEXTAUTH_SECRET;
  const github = process.env.GITHUB_SECRET;
  return github ? createHmac("sha256", github).update("kindling-session-v1").digest("base64url") : undefined;
}

export function isAuthConfigured() {
  return Boolean(process.env.GITHUB_ID && process.env.GITHUB_SECRET && isDatabaseConfigured());
}

const NUMERIC_ID = /^[1-9][0-9]*$/;

export const authOptions: NextAuthOptions = {
  providers: isAuthConfigured()
    ? [GitHubProvider({ clientId: process.env.GITHUB_ID!, clientSecret: process.env.GITHUB_SECRET! })]
    : [],
  secret: sessionSecret(),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== "github" || !profile) return false;
      const p = profile as Record<string, unknown>;
      const githubId = String(account.providerAccountId);
      const login = typeof p.login === "string" ? p.login : "";
      const createdAt = typeof p.created_at === "string" ? new Date(p.created_at) : null;
      if (!NUMERIC_ID.test(githubId) || !login || !createdAt || Number.isNaN(createdAt.getTime())) return false;
      try {
        await upsertUser(getDb(), {
          githubId,
          login,
          avatarUrl: typeof p.avatar_url === "string" ? p.avatar_url : null,
          githubCreatedAt: createdAt,
        });
        return true;
      } catch (error) {
        console.error("Kindling sign-in failed to save user", error);
        return false;
      }
    },
    async jwt({ token, account }) {
      if (account?.provider === "github") token.githubId = String(account.providerAccountId);
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.githubId === "string") session.user.githubId = token.githubId;
      return session;
    },
  },
};

/** The signed-in member, or null. Never throws for signed-out visitors. */
export async function getCurrentUser(): Promise<User | null> {
  if (!isAuthConfigured()) return null;
  const session = await getServerSession(authOptions);
  const githubId = session?.user?.githubId;
  if (!githubId) return null;
  return getUserByGithubId(getDb(), githubId);
}

export function isOperator(user: User | null): boolean {
  if (!user) return false;
  const ids = (process.env.KINDLING_OPERATOR_GITHUB_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => NUMERIC_ID.test(s));
  return ids.includes(user.githubId);
}
