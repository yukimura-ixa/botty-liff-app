# Onboarding Tutorial Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-screen swipeable carousel that teaches students how to earn points (scan + staff-QR unlock) and staff/council how to run the approver QR session, auto-shown once per device and replayable via a help control.

**Architecture:** One generic `Carousel` component driven by plain slide-data arrays (one deck per audience). A `/tutorial` route reads `?deck=student|council`, renders the carousel, and on finish writes a `localStorage` "seen" flag and routes the user onward. Pure index/seen-flag logic is extracted into a tested module. Triggers are wired into `/onboard` (post-submit redirect), `/home` (help icon), and `/approver` (first-open auto-show + reopen button).

**Tech Stack:** Next.js 16 App Router (React 19, client components), TypeScript, Vitest. Emoji illustrations, `src/lib/theme.ts` colors. No new dependencies.

---

## Spec

Source spec: `docs/superpowers/specs/2026-06-07-onboarding-tutorial-design.md`.

## Conventions to follow (read before coding)

- Components are **not** unit-tested in this project (project convention). Only pure
  functions / data get Vitest tests. Components are verified by `npx tsc --noEmit`,
  `npm run lint`, `npm run build`, and manual checks.
- Inline `style={{...}}` objects with `theme` colors — this codebase does not use CSS
  modules or Tailwind. Match the look of `src/app/onboard/page.tsx` and `src/app/scan/page.tsx`.
- Client components start with `"use client";`.
- Role lives in `sessionStorage.getItem("role")` (values: `student` / `council` / `admin`).
- Desktop blocking happens only at the root `src/app/page.tsx`; inner pages (`home`,
  `scan`, `onboard`) do **not** wrap `DesktopBlock`. The tutorial follows that pattern — no DesktopBlock.

## File structure

```
src/components/tutorial/
  logic.ts            # pure: types, index math, seen-flag gate   (TESTED)
  logic.test.ts       # Vitest unit tests
  studentSlides.ts    # student deck data + action label          (TESTED via decks.test.ts)
  councilSlides.ts    # council deck data + action label
  decks.test.ts       # asserts deck shape (counts + labels)
  Slide.tsx           # one slide view (emoji + title + caption)
  Carousel.tsx        # generic deck UI (dots, skip, back/next, swipe)
src/app/tutorial/
  page.tsx            # route: ?deck param, Suspense, render + route-on-done
```

Modified files:
- `src/app/onboard/page.tsx` — post-submit redirect to tutorial.
- `src/app/home/page.tsx` — help icon in hero.
- `src/app/approver/page.tsx` — first-open auto-show + reopen button.

---

## Task 1: Pure logic module

**Files:**
- Create: `src/components/tutorial/logic.ts`
- Test: `src/components/tutorial/logic.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/tutorial/logic.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  seenKey,
  clampIndex,
  nextIndex,
  prevIndex,
  isLastSlide,
  shouldAutoShow,
  markSeen,
} from "./logic";

describe("index math", () => {
  it("clamps within bounds", () => {
    expect(clampIndex(-1, 5)).toBe(0);
    expect(clampIndex(9, 5)).toBe(4);
    expect(clampIndex(2, 5)).toBe(2);
  });
  it("nextIndex stops at last", () => {
    expect(nextIndex(0, 5)).toBe(1);
    expect(nextIndex(4, 5)).toBe(4);
  });
  it("prevIndex stops at first", () => {
    expect(prevIndex(4, 5)).toBe(3);
    expect(prevIndex(0, 5)).toBe(0);
  });
  it("isLastSlide true only on last", () => {
    expect(isLastSlide(4, 5)).toBe(true);
    expect(isLastSlide(3, 5)).toBe(false);
  });
});

describe("seen flag", () => {
  it("builds a per-deck key", () => {
    expect(seenKey("student")).toBe("tutorial_seen_student");
    expect(seenKey("council")).toBe("tutorial_seen_council");
  });
  it("auto-shows when flag is absent", () => {
    expect(shouldAutoShow("student", () => null)).toBe(true);
  });
  it("does not auto-show when flag is set", () => {
    expect(shouldAutoShow("student", () => "1")).toBe(false);
  });
  it("auto-shows when storage read throws (LIFF private mode)", () => {
    expect(shouldAutoShow("student", () => { throw new Error("blocked"); })).toBe(true);
  });
  it("markSeen writes the flag", () => {
    const write = vi.fn();
    markSeen("council", write);
    expect(write).toHaveBeenCalledWith("tutorial_seen_council", "1");
  });
  it("markSeen swallows write errors", () => {
    expect(() => markSeen("council", () => { throw new Error("blocked"); })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/tutorial/logic.test.ts`
Expected: FAIL — cannot resolve `./logic`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/tutorial/logic.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/tutorial/logic.test.ts`
Expected: PASS (all assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/components/tutorial/logic.ts src/components/tutorial/logic.test.ts
git commit -m "feat(tutorial): pure carousel index + seen-flag logic"
```

---

## Task 2: Slide data decks

**Files:**
- Create: `src/components/tutorial/studentSlides.ts`
- Create: `src/components/tutorial/councilSlides.ts`
- Test: `src/components/tutorial/decks.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/components/tutorial/decks.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { studentSlides, studentActionLabel } from "./studentSlides";
import { councilSlides, councilActionLabel } from "./councilSlides";

describe("student deck", () => {
  it("has 5 slides", () => {
    expect(studentSlides).toHaveLength(5);
  });
  it("every slide has emoji, title, caption", () => {
    for (const s of studentSlides) {
      expect(s.emoji).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.caption).toBeTruthy();
    }
  });
  it("has an action label", () => {
    expect(studentActionLabel).toBe("เริ่มเก็บแต้ม");
  });
});

describe("council deck", () => {
  it("has 4 slides", () => {
    expect(councilSlides).toHaveLength(4);
  });
  it("every slide has emoji, title, caption", () => {
    for (const s of councilSlides) {
      expect(s.emoji).toBeTruthy();
      expect(s.title).toBeTruthy();
      expect(s.caption).toBeTruthy();
    }
  });
  it("has an action label", () => {
    expect(councilActionLabel).toBe("เข้าใจแล้ว");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/components/tutorial/decks.test.ts`
Expected: FAIL — cannot resolve `./studentSlides`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/tutorial/studentSlides.ts`:

```ts
import type { TutorialSlide } from "./logic";

export const studentSlides: TutorialSlide[] = [
  { emoji: "🌱", title: "ยินดีต้อนรับสู่ Botty", caption: "เก็บขวด PET มาสแกน รับคะแนน แลกของรางวัล" },
  { emoji: "📸", title: "เปิดกล้องสแกน", caption: "กดปุ่มสแกน → เปิดกล้อง → จัดขวดให้อยู่กลางจอ" },
  { emoji: "♻️", title: "ระบบตรวจขวดอัตโนมัติ", caption: "AI ตรวจว่าเป็นขวด PET จริง แล้วนับจำนวน" },
  { emoji: "🔒", title: "หาสต๊าฟสแกน QR", caption: "หลังสแกนขวด → ไปหาสต๊าฟ → สแกน QR ของสต๊าฟภายในเวลาที่กำหนด เพื่อปลดล็อกคะแนน" },
  { emoji: "🏆", title: "ไต่อันดับ", caption: "ดูคะแนน เลื่อนระดับต้นไม้ และกระดานอันดับได้ในแอป" },
];

export const studentActionLabel = "เริ่มเก็บแต้ม";
```

Create `src/components/tutorial/councilSlides.ts`:

```ts
import type { TutorialSlide } from "./logic";

export const councilSlides: TutorialSlide[] = [
  { emoji: "🧑‍🏫", title: "บทบาทสต๊าฟ", caption: "คุณยืนยันการสแกนของนักเรียนด้วย QR ของคุณ" },
  { emoji: "▶️", title: "เปิดเซสชัน", caption: 'กด "เปิดเซสชัน 5 นาที" — ระบบสร้าง QR ให้อัตโนมัติ' },
  { emoji: "📱", title: "ให้นักเรียนสแกน", caption: "โชว์ QR บนจอ · QR เปลี่ยนทุก 30 วิ · นักเรียน 1 คนต่อ 1 QR" },
  { emoji: "⏹️", title: "ปิดเมื่อเสร็จ", caption: 'กด "ปิดเซสชัน" เมื่อเลิกใช้' },
];

export const councilActionLabel = "เข้าใจแล้ว";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/components/tutorial/decks.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/tutorial/studentSlides.ts src/components/tutorial/councilSlides.ts src/components/tutorial/decks.test.ts
git commit -m "feat(tutorial): student + council slide decks"
```

---

## Task 3: Slide view component

**Files:**
- Create: `src/components/tutorial/Slide.tsx`

No unit test (component — project convention). Verified by tsc in Task 5.

- [ ] **Step 1: Write the component**

Create `src/components/tutorial/Slide.tsx`:

```tsx
"use client";
import type { TutorialSlide } from "./logic";

export default function Slide({ slide }: { slide: TutorialSlide }) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
        padding: "24px 28px",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 72, lineHeight: 1 }}>{slide.emoji}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: "white" }}>
        {slide.title}
      </div>
      <div
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "rgba(255,255,255,0.88)",
          maxWidth: 300,
        }}
      >
        {slide.caption}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tutorial/Slide.tsx
git commit -m "feat(tutorial): Slide view component"
```

---

## Task 4: Carousel component

**Files:**
- Create: `src/components/tutorial/Carousel.tsx`

No unit test (component). Verified by tsc/build in Task 5.

- [ ] **Step 1: Write the component**

Create `src/components/tutorial/Carousel.tsx`:

```tsx
"use client";
import { useRef, useState } from "react";
import { theme as t } from "@/lib/theme";
import Slide from "./Slide";
import { type TutorialSlide, nextIndex, prevIndex, isLastSlide } from "./logic";

export default function Carousel({
  slides,
  actionLabel,
  onDone,
}: {
  slides: TutorialSlide[];
  actionLabel: string;
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const touchX = useRef<number | null>(null);
  const last = isLastSlide(i, slides.length);

  function advance() {
    if (last) onDone();
    else setI((n) => nextIndex(n, slides.length));
  }
  function back() {
    setI((n) => prevIndex(n, slides.length));
  }

  function onTouchStart(e: React.TouchEvent) {
    touchX.current = e.changedTouches[0].clientX;
  }
  function onTouchEnd(e: React.TouchEvent) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    touchX.current = null;
    if (dx < -40) advance();
    else if (dx > 40) back();
  }

  return (
    <main
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={{
        minHeight: "100dvh",
        background: `linear-gradient(180deg, ${t.forest} 0%, ${t.moss} 70%, ${t.leaf} 100%)`,
        display: "flex",
        flexDirection: "column",
        color: "white",
      }}
    >
      {/* Skip */}
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "52px 20px 0" }}>
        <button
          onClick={onDone}
          style={{
            background: "transparent",
            border: "none",
            color: "rgba(255,255,255,0.7)",
            fontSize: 13,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ข้าม
        </button>
      </div>

      <Slide slide={slides[i]} />

      {/* Dots */}
      <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 20 }}>
        {slides.map((_, n) => (
          <div
            key={n}
            style={{
              width: n === i ? 18 : 7,
              height: 7,
              borderRadius: 4,
              background: n === i ? "white" : "rgba(255,255,255,0.4)",
              transition: "width 0.2s",
            }}
          />
        ))}
      </div>

      {/* Controls */}
      <div style={{ display: "flex", gap: 10, padding: "0 24px 40px" }}>
        {i > 0 && (
          <button
            onClick={back}
            style={{
              flex: 1,
              height: 50,
              borderRadius: 14,
              border: "1px solid rgba(255,255,255,0.3)",
              background: "rgba(255,255,255,0.1)",
              color: "white",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              fontFamily: "inherit",
            }}
          >
            ย้อนกลับ
          </button>
        )}
        <button
          onClick={advance}
          style={{
            flex: 1.6,
            height: 50,
            borderRadius: 14,
            border: "none",
            background: "white",
            color: t.forest,
            fontSize: 15,
            fontWeight: 800,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {last ? actionLabel : "ถัดไป →"}
        </button>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tutorial/Carousel.tsx
git commit -m "feat(tutorial): swipeable Carousel component"
```

---

## Task 5: Tutorial route

**Files:**
- Create: `src/app/tutorial/page.tsx`

- [ ] **Step 1: Write the route**

Create `src/app/tutorial/page.tsx`:

```tsx
"use client";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Carousel from "@/components/tutorial/Carousel";
import { studentSlides, studentActionLabel } from "@/components/tutorial/studentSlides";
import { councilSlides, councilActionLabel } from "@/components/tutorial/councilSlides";
import { type Deck, markSeen } from "@/components/tutorial/logic";

const DECKS: Record<Deck, { slides: typeof studentSlides; actionLabel: string; doneHref: string }> = {
  student: { slides: studentSlides, actionLabel: studentActionLabel, doneHref: "/home" },
  council: { slides: councilSlides, actionLabel: councilActionLabel, doneHref: "/approver" },
};

function TutorialInner() {
  const router = useRouter();
  const params = useSearchParams();
  const deck: Deck = params.get("deck") === "council" ? "council" : "student";
  const cfg = DECKS[deck];

  function done() {
    markSeen(deck, (k, v) => localStorage.setItem(k, v));
    router.replace(cfg.doneHref);
  }

  return <Carousel slides={cfg.slides} actionLabel={cfg.actionLabel} onDone={done} />;
}

export default function TutorialPage() {
  return (
    <Suspense fallback={null}>
      <TutorialInner />
    </Suspense>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Build (verifies Suspense/useSearchParams boundary)**

Run: `npm run build`
Expected: build succeeds; `/tutorial` appears in the route list, no "useSearchParams should be wrapped in a suspense boundary" error.

- [ ] **Step 4: Commit**

```bash
git add src/app/tutorial/page.tsx
git commit -m "feat(tutorial): /tutorial route with deck routing"
```

---

## Task 6: Wire onboard → tutorial

**Files:**
- Modify: `src/app/onboard/page.tsx` (the `router.replace("/home")` call inside `handleSubmit`, around line 36)

- [ ] **Step 1: Make the edit**

In `src/app/onboard/page.tsx`, inside `handleSubmit`, change:

```tsx
      router.replace("/home");
```

to:

```tsx
      router.replace("/tutorial?deck=student");
```

(The carousel's done handler routes onward to `/home`.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/onboard/page.tsx
git commit -m "feat(tutorial): show student tutorial right after onboarding"
```

---

## Task 7: Help icon on /home

**Files:**
- Modify: `src/app/home/page.tsx` — add `Link` is already imported. Replace the streak-badge block in the hero top row (currently lines ~190-203) so a help icon sits beside it.

- [ ] **Step 1: Make the edit**

In `src/app/home/page.tsx`, find this block in the hero top row:

```tsx
          {!loading && (profile?.streakDays ?? 0) > 0 && (
            <div
              style={{
                padding: "6px 14px",
                borderRadius: 999,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.2)",
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              🔥 {profile!.streakDays} วันติด
            </div>
          )}
```

Replace it with:

```tsx
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {!loading && (profile?.streakDays ?? 0) > 0 && (
              <div
                style={{
                  padding: "6px 14px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.16)",
                  border: "1px solid rgba(255,255,255,0.2)",
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                🔥 {profile!.streakDays} วันติด
              </div>
            )}
            <Link
              href="/tutorial?deck=student"
              aria-label="วิธีใช้งาน"
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                background: "rgba(255,255,255,0.16)",
                border: "1px solid rgba(255,255,255,0.2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "white",
                fontSize: 16,
                fontWeight: 800,
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              ?
            </Link>
          </div>
```

(`Link` is already imported at the top of the file. The help link always opens the tutorial — it intentionally ignores the seen flag.)

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/home/page.tsx
git commit -m "feat(tutorial): help icon on home to replay student tutorial"
```

---

## Task 8: Council auto-show + reopen on /approver

**Files:**
- Modify: `src/app/approver/page.tsx`

- [ ] **Step 1: Add imports**

In `src/app/approver/page.tsx`, the file already imports `useCallback, useEffect, useState` from "react" and `useRouter` from "next/navigation". Add this import after the existing `@/lib/api` import:

```tsx
import { shouldAutoShow } from "@/components/tutorial/logic";
```

- [ ] **Step 2: Add the auto-show effect**

Immediately after the existing `const [now, setNow] = useState(() => Date.now());` line inside `ApproverPage`, add:

```tsx
  // First time a staff member opens this screen, show the council tutorial once.
  useEffect(() => {
    if (shouldAutoShow("council", (k) => localStorage.getItem(k))) {
      router.replace("/tutorial?deck=council");
    }
  }, [router]);
```

- [ ] **Step 3: Add a reopen button**

In `src/app/approver/page.tsx`, find the existing back button at the top of the returned JSX:

```tsx
      <button
        onClick={() => router.replace("/home")}
        style={{
          background: "transparent", border: "none", color: t.muted,
          fontSize: 13, padding: 0, cursor: "pointer", marginBottom: 16,
          fontFamily: "inherit",
        }}
      >
        ← กลับ
      </button>
```

Replace it with a row that adds a reopen link:

```tsx
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <button
          onClick={() => router.replace("/home")}
          style={{
            background: "transparent", border: "none", color: t.muted,
            fontSize: 13, padding: 0, cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          ← กลับ
        </button>
        <button
          onClick={() => router.push("/tutorial?deck=council")}
          style={{
            background: "transparent", border: "none", color: t.moss,
            fontSize: 13, padding: 0, cursor: "pointer", fontWeight: 700,
            fontFamily: "inherit",
          }}
        >
          วิธีใช้ ?
        </button>
      </div>
```

(The reopen button uses `router.push` and always shows the tutorial, ignoring the seen flag. The tutorial's done handler routes back to `/approver`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/app/approver/page.tsx
git commit -m "feat(tutorial): council tutorial auto-show + reopen on approver"
```

---

## Task 9: Full verification

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the two new tutorial test files.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds; `/tutorial` listed as a route.

- [ ] **Step 5: Manual checks (dev server)**

Run: `npm run dev`, then in a mobile viewport / LINE webview:
- Complete `/onboard` → lands on student tutorial → finish → `/home`. Reopen via the `?` icon works.
- First `/approver` open → council tutorial auto-shows → finish → back on `/approver`. Reopen via "วิธีใช้ ?" works; it does not auto-show again on later visits.
- Swipe left/right advances/goes back; ข้าม (skip) exits immediately.
- (Optional) In a browser with localStorage disabled, the tutorial still renders and never crashes.

- [ ] **Step 6: Final commit (if any manual fixes were needed)**

```bash
git add -A
git commit -m "chore(tutorial): verification fixes"
```

---

## Self-review notes

- **Spec coverage:** carousel format (Tasks 3-4), student deck 5 slides incl. always-on QR step
  (Task 2), council deck 4 slides with สต๊าฟ wording (Task 2), first-run auto + help icon
  (Tasks 6-8), localStorage seen-flag with private-mode safety (Task 1), emoji illustrations &
  theme reuse (Tasks 3-4), pure-logic testing (Tasks 1-2), routing on done (Task 5) — all covered.
- **Deviation from spec:** deck files are `.ts` (pure data, no JSX) rather than `.tsx`, and the
  tutorial route omits `DesktopBlock` because inner pages in this codebase never use it (desktop is
  blocked at the root). Both match existing conventions; spec text is otherwise unchanged.
- **Type consistency:** `Deck`, `TutorialSlide`, `seenKey`, `shouldAutoShow`, `markSeen`,
  `nextIndex`, `prevIndex`, `isLastSlide` defined in Task 1 and used with identical signatures in
  Tasks 4-5 and 8. Deck exports (`studentSlides`/`studentActionLabel`/`councilSlides`/`councilActionLabel`)
  defined in Task 2 and consumed in Task 5.
```
