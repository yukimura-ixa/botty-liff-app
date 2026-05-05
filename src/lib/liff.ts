'use client';
import type Liff from '@line/liff';

let _liff: typeof Liff | null = null;

export async function getLiff(): Promise<typeof Liff> {
  if (_liff) return _liff;
  const mod = await import('@line/liff');
  _liff = mod.default;
  return _liff;
}

export async function initLiff(): Promise<typeof Liff> {
  const liff = await getLiff();
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID;
  if (!liffId) throw new Error('NEXT_PUBLIC_LIFF_ID is not set');
  await liff.init({ liffId });
  if (!liff.isLoggedIn()) liff.login();
  return liff;
}

export async function getLineIdToken(): Promise<string> {
  const liff = await getLiff();
  const token = liff.getIDToken();
  if (!token) throw new Error('No LINE id_token — user not logged in');
  return token;
}
