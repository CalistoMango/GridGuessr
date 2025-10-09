import Link from 'next/link';

type NotFoundProps = {
  error?: Error;
  reset?: () => void;
};

export default function NotFound(_props: NotFoundProps) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <div className="space-y-4 text-center px-6">
          <h1 className="text-3xl font-semibold">Page not found</h1>
          <p className="text-sm text-gray-400">The page you are looking for does not exist.</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
          >
            Return home
          </Link>
        </div>
      </body>
    </html>
  );
}
