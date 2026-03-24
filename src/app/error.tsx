'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // ChunkLoadError happens when a new deploy invalidates old JS chunk hashes.
    // Force a full reload so the browser fetches the new chunks.
    if (error.name === 'ChunkLoadError' || error.message?.includes('Loading chunk')) {
      window.location.reload();
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h2 className="text-lg font-semibold">Something went wrong</h2>
        <button
          onClick={reset}
          className="mt-4 rounded px-4 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
