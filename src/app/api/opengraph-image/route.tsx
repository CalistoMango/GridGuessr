import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#1a1a1a',
          color: 'white',
        }}
      >
        <h1 style={{ fontSize: 60, fontWeight: 'bold' }}>GridGuessr</h1>
        <p style={{ fontSize: 30, color: '#999' }}>Predict. Score. Compete.</p>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}