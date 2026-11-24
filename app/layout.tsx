import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
import { SignInButton, SignOutButton } from "@/components/AuthButtons";
import { Flame } from "@/components/ui";
import "./globals.css";

// The header shows who is signed in, so every page renders per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Kindling: a little fuel for good projects", template: "%s · Kindling" },
  description:
    "Each month the community picks an open-source project to support, and donations go straight to it. Kindling never touches the money.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  const authReady = isAuthConfigured();

  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container header-inner">
            <Link href="/" className="brand">
              <Flame /> Kindling
            </Link>
            <nav className="nav">
              <Link href="/#vote">Vote</Link>
              <Link href="/nominate">Nominate</Link>
              <Link href="/hall">Hall of Fame</Link>
              <Link href="/about">About</Link>
              {isOperator(user) && <Link href="/admin">Admin</Link>}
            </nav>
            <div className="account">
              {user ? (
                <>
                  {user.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar avatar-sm" src={user.avatarUrl} alt="" width={28} height={28} />
                  )}
                  <span className="small muted hide-sm">{user.login}</span>
                  <SignOutButton />
                </>
              ) : authReady ? (
                <SignInButton label="Sign in" className="btn btn-outline btn-sm" />
              ) : null}
            </div>
          </div>
        </header>
        <main className="container main">{children}</main>
        <footer className="site-footer">
          <div className="container footer-inner">
            <span>
              <Flame size={16} /> Kindling never touches the money. Every donate button goes straight to the project.
            </span>
            <span className="muted">
              <Link href="/about">How it works</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
