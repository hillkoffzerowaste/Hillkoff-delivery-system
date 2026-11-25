# การเชื่อม LINE ระหว่างสองเว็บแอพ

เอกสารนี้เป็นแผนผังการทำงานของระบบ production ที่แยกเป็น 2 แอพอย่างชัดเจน

## แอพและหน้าที่

| แอพ | Firebase project | App Hosting backend | หน้าที่ |
| --- | --- | --- | --- |
| Delivery System | `hillkoff-delivery` | `delivery-system` | อ่านออเดอร์และสถานะงาน, รับ LINE webhook, ตอบคำสั่งห้องแพ็ค |
| Scan to Sheet | `hillkoff-twin-oganization` | `scan-to-sheet` | บันทึกเหตุการณ์สแกน/LINE ที่ส่งต่อมา และจัดการข้อมูล Google Sheets |

โดเมน production:

- Delivery: `https://delivery-system--hillkoff-delivery.asia-southeast1.hosted.app`
- Scan to Sheet: `https://scan-to-sheet--hillkoff-twin-oganization.asia-southeast1.hosted.app`

## การไหลของข้อมูล

```text
LINE OA กลุ่มห้องแพ็ค
  -> Delivery /api/line/webhook
  -> ตรวจลายเซ็นและ LINE_ALLOWED_GROUP_IDS
  -> ตอบคำสั่งจากข้อมูล Delivery
  -> ส่งต่อ event ที่มาจากกลุ่มที่อนุญาต
       -> Scan to Sheet /api/line-events
       -> บันทึก event ที่ตัดข้อมูลลับแล้วใน Firestore
```

Delivery เป็นจุดรับ webhook และเป็นผู้ตอบ LINE เพียงจุดเดียว ส่วน Scan to Sheet รับเฉพาะ event ที่ Delivery ส่งต่อ จึงไม่ต้องตั้ง LINE webhook ซ้ำและไม่แย่งกันตอบข้อความในกลุ่ม

## คำสั่งที่ Delivery รองรับ

- `/วันนี้` หรือ `/วันที่ DD/MM/YYYY` — สรุปออเดอร์ตามรอบส่ง/วันที่งาน
- `/ชื่อลูกค้า` — ค้นหาชื่อแบบยืดหยุ่น แม้พิมพ์ไม่ครบหรือไม่ตรงทุกตัว
- `/ออเดอร์ ชื่อลูกค้า` — รูปแบบ alias สำหรับค้นหาเช่นเดียวกัน
- `/ช่วยเหลือ` หรือ `/แนะนำตัว` — แสดงหน้าที่และคำสั่ง
- ข้อความที่มีบรรทัด `งาน:` และเติม `/` นำหน้า — เรียกดูออเดอร์เดิมตามรหัสงาน

รายงานจะแสดงเป็นการ์ด LINE เมื่อทำได้ และมีชื่อลูกค้า รหัสงาน ขนส่ง และสถานะล่าสุด โดยข้อมูลสถานะอ่านจากระบบปัจจุบัน

## การแยกค่าตั้งค่าและ secret

ค่าของแต่ละแอพต้องอยู่ใน Firebase project/backend ของตัวเองเท่านั้น:

- Delivery ใช้ `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_ALLOWED_GROUP_IDS` และ secret สำหรับส่งต่อไป Scan to Sheet
- Scan to Sheet ใช้ secret รับ event ที่ส่งต่อจาก Delivery เท่านั้น
- ห้ามนำ secret ของ Scan to Sheet ไปผูกใน `hillkoff-delivery` และห้ามนำ secret ของ LINE OA ไปผูกใน `hillkoff-twin-oganization`
- ค่า URL ส่งต่อเป็น URL production ของ Scan to Sheet โดยส่งผ่าน header ภายใน ไม่ใส่ token ใน URL หรือเอกสาร

## ตรวจสอบหลัง deploy

1. ตรวจว่า rollout ของ `delivery-system` และ `scan-to-sheet` สำเร็จใน project ที่ถูกต้อง
2. ส่ง `/รหัสกลุ่ม` ในกลุ่มห้องแพ็คเพื่อยืนยัน group ID ที่ allow ไว้
3. ส่ง `/ช่วยเหลือ` และ `/วันนี้` เพื่อทดสอบคำตอบจาก Delivery
4. ตรวจ log ของ Scan to Sheet ว่ารับ `POST /api/line-events` ได้ โดยไม่แสดง secret หรือข้อความดิบเกินจำเป็น
5. ทดสอบซ้ำด้วย event จากกลุ่มที่ไม่อยู่ใน allowlist ต้องไม่ถูกส่งต่อ

## ข้อควรระวัง

- ไม่ตั้ง webhook URL ของ LINE ไปที่ Scan to Sheet โดยตรง
- ไม่แก้ environment ของอีก project จากหน้าหรือคำสั่งของ project ปัจจุบัน
- หากเปลี่ยนโดเมนหรือ backend ต้องอัปเดตเฉพาะ URL ส่งต่อฝั่ง Delivery และ deploy ทั้งสองแอพตามลำดับ
