import Link from "next/link";

/** Fallback for paths outside the locale segment. */
export default function GlobalNotFound() {
  return (
    <html lang="en">
      <body className="grid min-h-dvh place-items-center bg-background p-6 text-center font-sans">
        <div className="space-y-3">
          <h1 className="text-2xl font-bold">Page not found</h1>
          <Link href="/" className="text-primary underline">
            Go to home
          </Link>
        </div>
      </body>
    </html>
  );
}
