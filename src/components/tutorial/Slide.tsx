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
