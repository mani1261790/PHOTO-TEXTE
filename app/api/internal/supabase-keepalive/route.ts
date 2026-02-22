import { NextRequest, NextResponse } from 'next/server';

import { createServiceClient } from '@/lib/supabase/client';

function isAuthorized(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = req.headers.get('authorization');
  return Boolean(secret && authorization === `Bearer ${secret}`);
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: 'UNAUTHORIZED' }, { status: 401 });
  }

  const client = createServiceClient();
  const { error } = await client
    .from('user_profiles')
    .select('id', { head: true, count: 'exact' })
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: 'SUPABASE_KEEPALIVE_FAILED', detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    source: 'supabase-keepalive',
    timestamp: new Date().toISOString()
  });
}
