import type { Metadata } from 'next';
import { APP_NAME, APP_DESCRIPTION, APP_URL, APP_OG_IMAGE_URL } from '~/lib/constants';

export const metadata: Metadata = {
  title: `${APP_NAME} · Share`,
  description: APP_DESCRIPTION,
  openGraph: {
    title: APP_NAME,
    description: APP_DESCRIPTION,
    images: [APP_OG_IMAGE_URL],
    url: `${APP_URL}/share`,
    siteName: APP_NAME
  },
  other: {
    'fc:frame': 'vNext',
    'fc:frame:image': APP_OG_IMAGE_URL,
    'fc:frame:button:1': 'Launch GridGuessr',
    'fc:frame:button:1:action': 'launch_frame',
    'fc:frame:button:1:target': APP_URL,
    'fc:frame:button:2': 'View Leaderboard',
    'fc:frame:button:2:action': 'link',
    'fc:frame:button:2:target': `${APP_URL}?view=leaderboard`
  }
};

export default function SharePage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900 text-white flex items-center justify-center px-6 py-10">
      <div className="max-w-2xl text-center space-y-4">
        <h1 className="text-3xl font-bold">{APP_NAME}</h1>
        <p className="text-lg text-gray-300">{APP_DESCRIPTION}</p>
        <p className="text-sm text-gray-500">
          Open this cast inside Farcaster to launch the mini app.
        </p>
      </div>
    </main>
  );
}
