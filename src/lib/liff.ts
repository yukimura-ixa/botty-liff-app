'use client';
import type Liff from '@line/liff';

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;
export const LIFF_URL = LIFF_ID ? `https://liff.line.me/${LIFF_ID}` : '';

let _liff: typeof Liff | null = null;
let _initPromise: Promise<typeof Liff> | null = null;

export async function getLiff(): Promise<typeof Liff> {
  if (_liff) return _liff;
  const mod = await import('@line/liff');
  _liff = mod.default;
  return _liff;
}

export async function initLiff(): Promise<typeof Liff> {
  if (_initPromise) return _initPromise;
  _initPromise = (async () => {
    const liff = await getLiff();
    if (!LIFF_ID) throw new Error('NEXT_PUBLIC_LIFF_ID is not set');
    await liff.init({ liffId: LIFF_ID });
    return liff;
  })();
  return _initPromise;
}

export function isInLineClient(liff: typeof Liff): boolean {
  return liff.isInClient();
}

export async function getLineIdToken(): Promise<string> {
  const liff = await getLiff();
  const token = liff.getIDToken();
  if (!token) throw new Error('No LINE id_token — user not logged in');
  return token;
}
