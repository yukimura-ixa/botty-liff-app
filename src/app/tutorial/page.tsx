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
    // The student flag is written for symmetry but currently only the council deck
    // is auto-shown (onboard always shows the student deck; the home help icon always replays).
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
