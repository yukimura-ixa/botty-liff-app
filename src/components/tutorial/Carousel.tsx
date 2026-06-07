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
