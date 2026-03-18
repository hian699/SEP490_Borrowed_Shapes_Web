import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

const NESTJS_URL = process.env.NESTJS_URL ?? 'http://localhost:3001';

export async function DELETE() {
  const cookieStore = await cookies();
  const sid = cookieStore.get('sid')?.value;

  if (sid) {
    // Best-effort: always clear cookie even if NestJS call fails
    await fetch(`${NESTJS_URL}/api/auth/logout`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${sid}` },
    }).catch(() => {});

    cookieStore.delete('sid');
  }

  return new NextResponse(null, { status: 204 });
}
