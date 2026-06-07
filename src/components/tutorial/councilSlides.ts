import type { TutorialSlide } from "./logic";

export const councilSlides: TutorialSlide[] = [
  { emoji: "🧑‍🏫", title: "บทบาทสต๊าฟ", caption: "คุณยืนยันการสแกนของนักเรียนด้วย QR ของคุณ" },
  { emoji: "▶️", title: "เปิด QR", caption: 'กด "เปิด QR เจ้าหน้าที่" — ระบบสร้าง QR ให้อัตโนมัติ' },
  { emoji: "📱", title: "ให้นักเรียนสแกน", caption: "โชว์ QR บนจอ · QR เปลี่ยนทุก 5 นาที · นักเรียนสแกนรับคะแนนได้หลายคน" },
  { emoji: "⏹️", title: "ปิดเมื่อเสร็จ", caption: 'กด "ปิด QR" เมื่อเลิกใช้' },
];

export const councilActionLabel = "เข้าใจแล้ว";
