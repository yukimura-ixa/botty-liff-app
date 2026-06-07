# Onboarding Tutorial — Student & Council (Staff)

**Date:** 2026-06-07
**Status:** Approved design, ready for implementation plan

## Goal

In-app tutorial screens that teach two audiences how the system works:

- **Students** — how to earn points (scan a PET bottle, then unlock points via a staff QR).
- **Council / Staff** — how to run the approver QR session that confirms student scans.

Delivered as a reusable full-screen swipeable **carousel** inside the LINE LIFF webview, styled to match the existing app (theme colors, emoji illustrations).

## Background: how the flows actually work

These are the real mechanics the tutorial must describe accurately.

### Earning points (student)
1. `/scan` → open camera → capture a PET bottle photo.
2. AI detects the bottle class and counts items.
3. Points: in instant mode awarded immediately (base + streak). In **enforce** mode
   (`BIN_CONFIRM_MODE=enforce`, the current default in `src/app/api/v1/scan/confirm/route.ts`)
   the scan returns a **locked pending** result (🔒 +?) — points are awarded only after a staff QR confirm.
4. Abuse guards (not surfaced in the tutorial per design decision): duplicate-image hash,
   60s cooldown, 20/day limit, IP rate limit.

### QR approval (staff / council)
1. Staff opens `/approver` (gated by `RoleGate allow={["council","admin"]}`) → "เปิดเซสชัน 5 นาที".
2. Server returns a 5-minute session with precomputed slot tokens. The page shows a QR that
   **rotates every 30s on a clock** (`slotIdx = floor((now - startedAt) / 30000)` in
   `src/app/approver/page.tsx`). Tokens are time-based only.
3. Student (on the scan result screen) taps "สแกน QR เจ้าหน้าที่", scans the staff QR, and
   `POST /api/v1/scan/confirm` claims the slot (`claimSlot`, `src/server/approver/repo.ts`) and awards points.

**Single-use constraint:** each 30s QR slot is claimed by exactly one student
(`slots/{slot}` doc written transactionally). A second student scanning the *same* QR gets
`slot_used` → 409 "QR ถูกใช้ไปแล้ว". A student can be awarded only once per session
(`students/{uid}` doc → `student_already_awarded` 409). Throughput ≈ 1 student / 30s ≈
10 students per 5-min session per staff device.

**Known gaps (filed separately, out of scope here):**
- `botty-9a8` — QR does not refresh after a successful scan (dead 0–30s window).
- `botty-8c7` — no feedback on `/approver` when a student scan succeeds.

## Decisions

| Topic | Decision |
|---|---|
| Deliverable | In-app tutorial screens (not a doc, not a help page). |
| Format | Full-screen swipeable carousel (option A). |
| Entry | First-run auto-show once + replayable via help icon. |
| QR coverage in student deck | **Always** show the QR-approval step, regardless of `BIN_CONFIRM_MODE`. |
| Illustrations | Emoji only — no image assets, no new deps. |
| "Seen once" persistence | `localStorage` (`tutorial_seen_student` / `tutorial_seen_council`). |
| Wording | Staff referred to as **สต๊าฟ**. |

## Architecture

```
src/components/tutorial/
  Carousel.tsx        # generic full-screen deck: slides[], dots, skip/next/back, onDone
  Slide.tsx           # one slide: emoji + title + caption
  studentSlides.tsx   # student deck content (data)
  councilSlides.tsx   # council deck content (data)
  logic.ts            # pure: nextSlide / prevSlide / isLastSlide / shouldAutoShow(deck, storage)
  logic.test.ts       # Vitest unit tests for logic.ts
src/app/tutorial/
  page.tsx            # reads ?deck=student|council, renders Carousel, routes on done
```

- Reuse `src/lib/theme.ts` colors (forest/moss/leaf/gold) and `DesktopBlock`.
- Carousel is mobile-only, consistent with the rest of the app.

### Triggers
- **Student:** `/onboard` submit → `router.replace("/tutorial?deck=student")` (was `/home`);
  carousel done → `/home`. A `?` help icon on `/home` → `/tutorial?deck=student` (always shows, ignores flag).
- **Council:** first `/approver` open with no `tutorial_seen_council` flag → push `/tutorial?deck=council`;
  carousel done → `/approver`. Reopen button on `/approver` always works.

## Content

### Student deck — 5 slides (`?deck=student`)

| # | Emoji | Title | Caption |
|---|---|---|---|
| 1 | 🌱 | ยินดีต้อนรับสู่ Botty | เก็บขวด PET มาสแกน รับคะแนน แลกของรางวัล |
| 2 | 📸 | เปิดกล้องสแกน | กดปุ่มสแกน → เปิดกล้อง → จัดขวดให้อยู่กลางจอ |
| 3 | ♻️ | ระบบตรวจขวดอัตโนมัติ | AI ตรวจว่าเป็นขวด PET จริง แล้วนับจำนวน |
| 4 | 🔒 | หาสต๊าฟสแกน QR | หลังสแกนขวด → ไปหาสต๊าฟ → สแกน QR ของสต๊าฟภายในเวลาที่กำหนด เพื่อปลดล็อกคะแนน |
| 5 | 🏆 | ไต่อันดับ | ดูคะแนน เลื่อนระดับต้นไม้ และกระดานอันดับได้ในแอป → **เริ่มเก็บแต้ม** |

Last-slide action label: **เริ่มเก็บแต้ม**.

### Council deck — 4 slides (`?deck=council`)

| # | Emoji | Title | Caption |
|---|---|---|---|
| 1 | 🧑‍🏫 | บทบาทสต๊าฟ | คุณยืนยันการสแกนของนักเรียนด้วย QR ของคุณ |
| 2 | ▶️ | เปิดเซสชัน | กด "เปิดเซสชัน 5 นาที" — ระบบสร้าง QR ให้อัตโนมัติ |
| 3 | 📱 | ให้นักเรียนสแกน | โชว์ QR บนจอ · QR เปลี่ยนทุก 30 วิ · นักเรียน 1 คนต่อ 1 QR |
| 4 | ⏹️ | ปิดเมื่อเสร็จ | กด "ปิดเซสชัน" เมื่อเลิกใช้ → **เข้าใจแล้ว** |

Last-slide action label: **เข้าใจแล้ว**.

## Interaction

- Swipe left/right + Next/Back buttons. Skip link top-right jumps to done.
- Progress dots; active dot elongated.
- On done/skip: set `localStorage[tutorial_seen_<deck>]="1"`, then `router.replace(target)`
  (student → `/home`, council → `/approver`).

## Edge cases

- **Desktop:** reuse `DesktopBlock` — carousel is mobile-only.
- **localStorage unavailable** (LIFF private mode): wrap read/write in try/catch. Read failure →
  treat as "not seen" (auto-show). Write failure → ignored (worst case: shows again). Never crash.
- **Direct nav to `/tutorial`** with no/invalid deck param → default `deck=student`.
- **Council auto-push** only when `!tutorial_seen_council`; reopen button bypasses the flag.
- **Post-onboard chain** (onboard → tutorial → home) runs only on the onboard redirect; the help-icon
  path always shows and does not depend on the flag.

## Testing

- Pure logic extracted to `src/components/tutorial/logic.ts`, unit-tested with Vitest
  (`nextSlide`/`prevSlide`/`isLastSlide`, `shouldAutoShow(deck, storage)`).
- Slide decks are plain data arrays: assert counts (5 / 4) and that the last slide carries the action label.
- Components not unit-tested (project convention). Manual checks: onboard redirect, help-icon reopen,
  skip, swipe, desktop block, private-mode (no localStorage).

## Out of scope

- Changing the QR throughput / refresh behaviour (`botty-9a8`, `botty-8c7`).
- Surfacing abuse-guard rules in the tutorial.
- Server/role changes (the `council` vs `admin` `RoleGate`/`hasRole` drift is pre-existing).
