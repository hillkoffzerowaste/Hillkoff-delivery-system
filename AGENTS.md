# คู่มือสำหรับ AI Coding Agent — Hillkoff Delivery System

เอกสารนี้เขียนสำหรับ AI agent (เช่น Claude Code, Codex) ที่เข้ามาช่วยพัฒนาโปรเจกต์นี้ เพื่อให้ทำงานถูกทิศทางตั้งแต่ครั้งแรก โดยไม่ต้องถามผู้ใช้ซ้ำในเรื่องพื้นฐาน

ดูภาพรวมระบบ, โครงสร้างโฟลเดอร์, API, Firestore collections แบบละเอียดได้ที่ [`README.md`](README.md) — เอกสารนี้เน้นเฉพาะ **วิธีทำงานกับโค้ดนี้อย่างปลอดภัย**

---

## 1. สิ่งที่ต้องรู้ก่อนแตะโค้ด

- โปรเจกต์นี้เป็นระบบที่ **ใช้งานจริงในธุรกิจทุกวัน** (ฝ่ายขาย, สโตร์, ห้องแพ็ค, คนขับ, บัญชี) ไม่ใช่โปรเจกต์ทดลอง ความผิดพลาดกระทบงานส่งของจริง
- `app/page.jsx` คือไฟล์หลักของทั้งระบบ (ไฟล์เดียว รวม UI + state + business logic ของทุก role, ขนาดหลายพันบรรทัด) ก่อนแก้ควรอ่านส่วนที่เกี่ยวข้องให้ครบก่อน อย่าเดาโครงสร้างจากชื่อฟังก์ชันอย่างเดียว
- **หน้าคนขับ (driver tab) ต้องระวังเป็นพิเศษ** — คนขับใช้งานผ่านมือถือหน้างานจริงระหว่างขับรถ/ส่งของ การแก้ไขใดๆ ที่กระทบปุ่มรับงาน/ส่งสำเร็จ/เช็กอิน ต้องตรวจสอบ flow เดิมให้ครบก่อนเปลี่ยน และเทสต์ทุกเคส (rollback, disabled state, ปุ่มกดซ้ำ) ก่อนส่งงาน
- ก่อนแก้บั๊กหรือเพิ่มฟีเจอร์ ให้ตรวจสอบ `git log` / `git status` ก่อนเสมอ อย่าสมมติว่า commit ล่าสุดที่เห็นคือสถานะปัจจุบันจริง (โค้ดอาจถูกแก้ไปแล้วในรอบก่อนหน้าที่ context ถูกสรุปย่อไปแล้ว)

---

## 2. กติกาการแก้โค้ด

- **ไม่ refactor เกินขอบเขตที่ขอ** — แก้บั๊กก็แก้เฉพาะจุดนั้น ไม่ปรับโครงสร้างทั้งไฟล์ไปพร้อมกัน
- **ไม่เพิ่ม abstraction ล่วงหน้า** สำหรับเคสที่ยังไม่เกิดขึ้นจริง
- เขียนคอมเมนต์เท่าที่จำเป็น (อธิบาย "ทำไม" ไม่ใช่ "ทำอะไร") โค้ดที่ตั้งชื่อดีไม่ต้องมีคอมเมนต์อธิบายซ้ำ
- ฟังก์ชันที่เขียนข้อมูลลง Firestore (`orders`, `customers`, ฯลฯ) ต้องผ่าน API route ใน `app/api/**` เท่านั้น (ตรวจ Firebase ID token + role ผ่าน `lib/workflowAuth.js`) — ห้าม client เขียนตรงเข้า Firestore
- เคส check-then-write ที่มีความเสี่ยง race condition (เช่น เช็คซ้ำก่อนสร้างลูกค้าใหม่, ปิด record การใช้รถอัตโนมัติ) ให้ใช้ `db.runTransaction` แบบเดียวกับที่มีอยู่แล้วในโปรเจกต์ (ดูตัวอย่างใน `app/api/customers/upsert/route.js`, `app/api/vehicle-usage/submit/route.js`)
- สีและ layout หลักของแอปกำหนดที่ `app/globals.css` — สีแบรนด์ปัจจุบันคือโทนเขียวมิ้นท์/ฟ้าอมเขียว (teal) อิงจาก hillkoff.com อย่าใส่สีใหม่แบบสุ่ม ให้ใช้โทนเดียวกับที่มีอยู่

---

## 3. ห้ามทำโดยไม่ถามผู้ใช้ก่อน

- Force push, `git reset --hard`, ลบ branch, ลบข้อมูลถาวร
- รัน migration/backfill script ใน `scripts/*.mjs` แบบใส่ `--apply` (ให้รัน dry-run ก่อนเสมอ แล้วรอผู้ใช้ยืนยันก่อนใส่ `--apply`)
- แก้ Firestore Rules (`firestore.rules`) หรือ indexes โดยไม่อธิบายผลกระทบด้านสิทธิ์ก่อน
- Deploy ขึ้น production หรือแก้ environment variable บน Vercel
- เปลี่ยนอีเมลใน `ADMIN_EMAIL_ALLOWLIST` / `ACCOUNTING_EMAIL_ALLOWLIST` หรือ business-policy อื่นที่ไม่ใช่บั๊กชัดเจน (เช่น ขอบเขตสิทธิ์ของแต่ละ role) — ให้รายงานเป็นคำถามแทนการเดาเจตนา

---

## 4. ก่อน commit ทุกครั้ง

รันให้ผ่านทั้งหมดก่อนส่งงาน (หรือใช้ `npm run check` ที่รวม 3 อย่างแรกไว้แล้ว):

```powershell
npm run lint          # eslint --max-warnings=0
npm test              # vitest run tests/unit
npm run build         # next build
```

ถ้าแก้ Firestore Rules ให้รันเพิ่ม:

```powershell
npm run test:rules    # ต้องมี Java + Firebase CLI
```

ถ้าแก้ UI ที่มีผลกับหน้าจอจริง ให้เปิด dev server (`npm run dev`) แล้วตรวจผ่านเบราว์เซอร์จริงก่อนสรุปว่าใช้งานได้ — การเทสต์ผ่านไม่ได้แปลว่า UI ใช้งานได้จริง

---

## 5. Commit และ push

- สร้าง commit ใหม่เสมอ ห้าม `--amend` commit ที่ push ไปแล้ว หรือ commit ของคนอื่น
- ข้อความ commit บอก "ทำไม" มากกว่า "ทำอะไร" (โค้ด diff บอกอยู่แล้วว่าทำอะไร)
- Push ขึ้น `main` เฉพาะเมื่อผู้ใช้ขอ หรือมี standing approval จากผู้ใช้ในบทสนทนานั้นแล้วเท่านั้น
- ถ้า push ถูก reject แบบ non-fast-forward ให้ `git fetch` + merge ล่าสุดจาก origin ก่อน แล้วตรวจ lint/test/build ซ้ำหลัง merge เสมอ (โค้ดที่ merge เข้ามาอาจกระทบไฟล์เดียวกัน)

---

## 6. อ้างอิงเพิ่มเติม

| ต้องการรู้เรื่อง | ดูที่ |
| --- | --- |
| ภาพรวมระบบ, roles, workflow ออเดอร์ | [`README.md`](README.md) |
| โครงสร้างไฟล์ทั้งโปรเจกต์แบบละเอียด | [`code_map.md`](code_map.md) |
| ระบบ backup/restore | [`BACKUP_SYSTEM.md`](BACKUP_SYSTEM.md) |
| การตั้งค่า integration ภายนอก (Google Sheets, LINE) | [`INTEGRATION_SETUP.md`](INTEGRATION_SETUP.md) |
