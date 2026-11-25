import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/big-shoulders-display";
import "@fontsource-variable/instrument-sans";
import { getCurrentUser, isAuthConfigured, isOperator } from "@/lib/auth";
import { SignInButton, SignOutButton } from "@/components/AuthButtons";
import { Wordmark } from "@/components/ui";
import { OPERATOR_SHARE_PERCENT } from "@/lib/money";
import "./globals.css";

// The header shows who is signed in, so every page renders per request.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { default: "Kindling: a little fuel for good projects", template: "%s | Kindling" },
  description:
    "Subscribers pool $5 a month and vote on which open-source projects get it. Every $200 in the pot funds another Pick, paid out in the open through Open Collective.",
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
              <Link href="/subscribe">Subscribe</Link>
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
            <span>Subscriber money is held and paid out by Open Collective, in public. Kindling keeps {OPERATOR_SHARE_PERCENT}% after fees.</span>
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
