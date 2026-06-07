export type Deck = "student" | "council";

export type TutorialSlide = {
  emoji: string;
  title: string;
  caption: string;
};

export function seenKey(deck: Deck): string {
  return `tutorial_seen_${deck}`;
}

export function clampIndex(i: number, len: number): number {
  if (i < 0) return 0;
  if (i > len - 1) return len - 1;
  return i;
}

export function nextIndex(i: number, len: number): number {
  return clampIndex(i + 1, len);
}

export function prevIndex(i: number, len: number): number {
  return clampIndex(i - 1, len);
}

export function isLastSlide(i: number, len: number): boolean {
  return i >= len - 1;
}

// `read` may throw in LIFF private mode; any failure is treated as "not seen"
// so the tutorial still shows rather than crashing.
export function shouldAutoShow(deck: Deck, read: (k: string) => string | null): boolean {
  try {
    return read(seenKey(deck)) !== "1";
  } catch {
    return true;
  }
}

// Write failures are ignored (worst case: the tutorial auto-shows again).
export function markSeen(deck: Deck, write: (k: string, v: string) => void): void {
  try {
    write(seenKey(deck), "1");
  } catch {
    /* ignore */
  }
}
