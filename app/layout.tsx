import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/instrument-sans";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
import { SignInButton, SignOutButton } from "@/components/AuthButtons";
import { Wordmark } from "@/components/ui";
import "./globals.css";

// The header shows who is signed in, so every page renders per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Kindling: a little fuel for good projects", template: "%s | Kindling" },
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
            <Link href="/" className="brand" aria-label="Kindling home">
              <Wordmark />
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/#vote">Vote</Link>
              <Link href="/nominate">Nominate</Link>
              <Link href="/hall">Past picks</Link>
              <Link href="/about">How it works</Link>
              {isOperator(user) && <Link href="/admin">Admin</Link>}
            </nav>
            <div className="account">
              {user ? (
                <>
                  {user.avatarUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar avatar-round" src={user.avatarUrl} alt="" width={28} height={28} />
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
          <div className="striker" />
          <div className="container footer-inner">
            <span>Kindling never touches the money. Every donate button goes straight to the project.</span>
            <span className="footer-links">
              <Link href="/about">How it works</Link>
              <Link href="/hall">Past picks</Link>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
