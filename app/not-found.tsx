import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty measure">
      <h1>Nothing here</h1>
      <p>That page or project doesn&apos;t exist, or it isn&apos;t public.</p>
      <Link href="/" className="btn btn-primary">
        Back to the vote
      </Link>
    </div>
  );
}
