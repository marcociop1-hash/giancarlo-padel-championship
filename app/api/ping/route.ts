import { NextResponse } from 'next/server';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ ok: true, where: 'app-router' }, { status: 200 });
}
