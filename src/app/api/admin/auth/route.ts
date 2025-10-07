import { NextRequest, NextResponse } from 'next/server';
import { authenticateAdmin } from '~/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { fid, adminFid, password, adminPassword } = body ?? {};
    const authResult = authenticateAdmin({ fid, adminFid, password, adminPassword });

    if (authResult.authenticated) {
      return NextResponse.json({ authenticated: true, method: authResult.method });
    }

    return NextResponse.json({ authenticated: false }, { status: 401 });
  } catch (error) {
    console.error('Admin auth error:', error);
    return NextResponse.json(
      { authenticated: false, error: 'Authentication failed' },
      { status: 500 }
    );
  }
}
