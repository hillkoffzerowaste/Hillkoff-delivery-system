# 🚚 Hillkoff Delivery System - Workflow Documentation

## 📊 ภาพรวมระบบ

```
┌─────────────────────────────────────────────────────────────┐
│          Hillkoff Delivery Operations Platform              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐          ┌──────────────┐                 │
│  │  Sales Team  │          │  Driver Team │                 │
│  │  (Browsers)  │          │  (Browsers)  │                 │
│  └──────┬───────┘          └──────┬───────┘                 │
│         │                         │                          │
│         └─────────────┬───────────┘                          │
│                       ▼                                       │
│              ┌─────────────────┐                             │
│              │  Local Storage  │ (Always Available)          │
│              └────────┬────────┘                             │
│                       │                                       │
│        ┌──────────────┼──────────────┐                       │
│        ▼              ▼              ▼                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────────┐                 │
│  │ Supabase │ │  Google  │ │   Browser    │                 │
│  │    DB    │ │  Sheets  │ │   IndexedDB  │                 │
│  └──────────┘ └──────────┘ └──────────────┘                 │
│     (Optional)  (Recommended)                                │
│                      │                                       │
│                      ▼                                       │
│              ┌──────────────────┐                            │
│              │  Google Drive    │ (POD Photos)              │
│              └──────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

---

## 👨‍💼 WORKFLOW ฝั่งขาย (SALES)

### 1️⃣ **เข้าระบบ**
```
Sales Person
     ↓
[Select Role: "ขาย"]
     ↓
[Enter Name & Phone]
     ↓
✅ Login Success
     ↓
→ Goes to "Sales Dashboard"
```

**ข้อมูลที่บันทึก:**
- Role: "sales"
- Name: ชื่อพนักงานขาย
- Phone: เบอร์โทรศัพท์
- Save ไว้ใน Local Storage เพื่อให้ login ครั้งต่อไปสะดวก

---

### 2️⃣ **จัดการลูกค้า (Customers)**

#### 📝 **เพิ่มลูกค้าใหม่**
```
Sales Dashboard → "ลูกค้า" Tab
        ↓
[Click "เพิ่มลูกค้า"]
        ↓
[Fill Form]
   - ชื่อลูกค้า (required)
   - ชื่อติดต่อ
   - เบอร์โทร
   - เขต (Zone) - dropdown
   - ที่อยู่
   - Google Maps URL (optional)
   - หมายเหตุ
        ↓
[Click "บันทึก"]
        ↓
✅ ลูกค้าถูกเพิ่มลงระบบ
        ↓
📍 Save ไว้:
   - Local Storage (ทันที)
   - Supabase → customers table (ถ้าเชื่อมต่อ)
```

**ข้อมูล Customers Table:**
```
{
  id: "CUST-001",
  name: "ร้านค้า ABC",
  contact: "คุณชัยพร",
  phone: "090-123-4567",
  zone: "เมืองเชียงใหม่",
  address: "ซ.ท่าแพ 123",
  mapUrl: "https://goo.gl/maps/xxx",
  note: "ตึกสีเหลือง",
  updatedAt: "2026-05-25T10:30:00Z"
}
```

#### 🔍 **ค้นหา/แก้ไขลูกค้า**
```
Sales Dashboard → "ลูกค้า" Tab
        ↓
[Search by name/phone]
        ↓
[Select ลูกค้า from list]
        ↓
[View ข้อมูล]
        ↓
Option 1: [Edit] → แก้ไขข้อมูล → [Save]
Option 2: [Delete] → ลบจากระบบ
        ↓
✅ Update ทั้ง Local Storage และ Supabase
```

---

### 3️⃣ **สร้างรายการส่ง (Orders)**

#### 📦 **สร้าง Order ใหม่**
```
Sales Dashboard → "รายการส่ง" Tab
        ↓
[Click "สร้างรายการส่ง"]
        ↓
[Select ลูกค้า] → Auto-fill:
   - ชื่อลูกค้า
   - เขต (Zone)
   - ที่อยู่
   - Google Maps URL
        ↓
[Fill Additional Info]
   - ช่วงเวลา (window): "09:00-12:00", "12:00-15:00", "15:00-18:00"
   - จำนวนกล่อง (boxes)
   - เก็บเงินปลายทาง (COD) - optional
   - หมายเหตุ (salesNote)
        ↓
[Click "ยืนยันสร้าง"]
        ↓
✅ Order ถูกสร้าง
        ↓
Status: "รอคนขับรับ" (Pending Pickup)
        ↓
📍 Save:
   - Local Storage
   - Supabase → orders table
```

**ข้อมูล Orders Table:**
```
{
  id: "ORD-001",
  customerId: "CUST-001",
  customerName: "ร้านค้า ABC",
  customerPhone: "090-123-4567",
  zone: "เมืองเชียงใหม่",
  address: "ซ.ท่าแพ 123",
  mapUrl: "https://goo.gl/maps/xxx",
  window: "09:00-12:00",
  boxes: 4,
  cod: 0,
  driverId: null,           // ว่าง รอจนกว่าคนขับรับ
  driverName: null,
  status: "รอคนขับรับ",
  photo: null,              // POD (Proof of Delivery)
  checkInAt: null,          // เวลาคนขับมารับ
  deliveredAt: null,        // เวลาส่งสำเร็จ
  complaint: null,
  salesNote: "ส่วนแบ่ง...",
  createdAt: "2026-05-25T10:00:00Z",
  updatedAt: "2026-05-25T10:00:00Z"
}
```

#### 📊 **ดูรายการส่ง**
```
Sales Dashboard → "รายการส่ง" Tab
        ↓
[View list with filters]
   - Status Filter: all, รอคนขับรับ, กำลังส่ง, ส่งสำเร็จ, ติดปัญหา, ยกเลิก
   - Zone Filter
   - Search by order ID/customer name
        ↓
[Click Order] → View Details:
   - ลูกค้า
   - สถานที่ส่ง
   - คนขับที่รับ
   - สถานะ
   - ภาพ POD
   - ข้อร้องเรียน
        ↓
Option 1: [Edit] → แก้ไขเฉพาะ salesNote, status
Option 2: [Delete] → ยกเลิก order
Option 3: [View Map] → ดูตำแหน่งในแผนที่
```

**Status Color Code:**
```
🟤 "รอคนขับรับ"      - Brown   (Waiting for driver)
🔵 "กำลังส่ง"        - Blue    (In transit)
🟠 "กำลังจัดส่ง"      - Orange  (Delivering)
🟢 "ส่งสำเร็จ"       - Green   (Completed)
🔴 "ติดปัญหา"       - Red     (Problem)
⚫ "ยกเลิก"          - Dark Red (Cancelled)
🟢 "กลับมา"         - Light Green (Returned)
```

---

### 4️⃣ **จัดการคนขับ (Drivers)**

#### 🚗 **เพิ่มคนขับ**
```
Sales Dashboard → "คนขับ" Tab
        ↓
[Click "เพิ่มคนขับ"]
        ↓
[Fill Form]
   - ชื่อจริง (firstName)
   - นามสกุล (lastName)
   - เบอร์โทร
   - ยานพาหนะ (vehicle): รถยนต์, รถตู้, รถบรรทุก
   - ทะเบียน (plate)
   - เขต (zone)
        ↓
[Click "บันทึก"]
        ↓
✅ คนขับถูกเพิ่มลงระบบ
        ↓
📍 Save → Supabase drivers table
```

#### 📊 **ดูรายชื่อคนขับ**
```
Sales Dashboard → "คนขับ" Tab
        ↓
[View list]
   - ชื่อ
   - เบอร์โทร
   - ยานพาหนะ
   - เขต
   - จำนวน order ที่รับ
   - Order ที่กำลังส่ง
   - Status: Online/Offline
        ↓
[Click Driver] → View:
   - ข้อมูลประจำตัว
   - รายการส่งของวันนี้
   - ตำแหน่ง GPS (real-time)
   - คะแนนประเมิน
```

---

### 5️⃣ **สรุปผล & รายงาน**

#### 📈 **แดชบอร์ด**
```
Sales Dashboard → "สรุป" Tab
        ↓
แสดง Stats:
   - 📦 Total Orders Today: 25
   - ✅ Completed: 20
   - ⏳ In Progress: 3
   - ❌ Problem: 2
   
   - 💰 Revenue (COD): 12,500 บาท
   - 🚗 Active Drivers: 5
   - 📍 Online: 4 (80%)
        ↓
[Export to Google Sheets]
   - Sync ไป Google Sheets
   - Google Apps Script ป้อนข้อมูล
   - สร้าง Google Sheet: "Hillkoff Delivery System"
```

#### 💬 **ติดต่อสื่อสาร**
```
Sales Dashboard → "แชท" Icon (bottom right)
        ↓
[Chat messages panel]
        ↓
Messages ที่อาจเกี่ยวข้อง:
   - คนขับแจ้งปัญหา
   - ลูกค้าติดต่อ
   - ขอยืนยันรายละเอียด
        ↓
[Type message] → [Send]
        ↓
📍 Save → Supabase chat_messages table
```

---

## 🚗 WORKFLOW ฝั่งคนขับ (DRIVER)

### 1️⃣ **เข้าระบบ**
```
Driver
   ↓
[Select Role: "คนขับ"]
   ↓
[Select Driver from dropdown]
   หรือ
[Enter Driver ID / Phone]
   ↓
✅ Login Success
   ↓
→ Goes to "Driver Dashboard"
   ↓
🔴 Enable Location Services (GPS)
   - Browser ขออนุญาติ Geolocation
   - Driver อนุญาติ
   - System เริ่ม watch GPS location
```

**ข้อมูลที่บันทึก:**
- Role: "driver"
- Driver ID: "D1", "D2", etc.
- Driver Name: ชื่อคนขับ
- GPS tracking: every 10-30 seconds

---

### 2️⃣ **ดูรายการส่งประจำวัน**

#### 📋 **Order Queue**
```
Driver Dashboard → "รายการส่ง" Tab
        ↓
[View list of today's orders]
        ↓
Filters:
   - ของฉัน (My Orders)
   - รอคนขับรับ (Available to pick)
   - กำลังส่ง (Assigned to me)
   - ส่งสำเร็จ (Completed)
   
Order แต่ละรายการแสดง:
   - Order ID
   - ชื่อลูกค้า
   - ที่อยู่ส่ง
   - ช่วงเวลา
   - จำนวนกล่อง
   - เก็บเงิน (COD)
   - ระยะทาง (km)
   - Status Badge + Color
        ↓
[Click Order] → View Full Details:
   - Maps preview
   - รายละเอียดลูกค้า
   - ลิงก์ Google Maps (เปิดได้ใน Maps app)
   - Contact info: phone
```

---

### 3️⃣ **รับรายการส่ง (Pick Order)**

#### ✅ **Accept Order Flow**
```
Driver Dashboard → [See Order: "รอคนขับรับ"]
        ↓
[Click Order]
        ↓
[View Details]
        ↓
Option 1: [Click "รับงาน"]
        ↓
✅ Order Status changed to "กำลังส่ง" (In Transit)
        ↓
Order อัปเดต:
   - driverId: "D1"
   - driverName: "ชายชื่อ"
   - status: "กำลังส่ง"
   - checkInAt: (blank, fill later)
        ↓
📍 Save → Local Storage + Supabase
        ↓
🗺️ Map View Updated:
   - Show driver location (real-time GPS)
   - Show order marker
   - Show route
```

---

### 4️⃣ **ไปส่ง & ตรวจสอบ (Delivery)**

#### 🗺️ **Navigation to Customer**
```
Driver Dashboard → [My Orders] → [In Transit Order]
        ↓
[Click "ดูแผนที่" / "View Map"]
        ↓
Display:
   - Driver current location (GPS)
   - Customer location (marker)
   - Route (if connected to Maps API)
   - Distance remaining
   - ETA
        ↓
Option 1: [Open in Google Maps]
   - Redirects to Google Maps app
   - Navigation starts
        ↓
Driver arrives at customer...
```

#### ✍️ **Check-in at Delivery Location**
```
Driver arrives near customer
        ↓
[Tap Order when nearby]
        ↓
[Click "เช็คอิน"]
        ↓
System records:
   - checkInAt: current timestamp
   - driverId: confirmed
   - Current GPS location saved
        ↓
Status: "กำลังจัดส่ง" (Delivering)
        ↓
📍 Auto-sync → Supabase
```

---

### 5️⃣ **บันทึกผล & ถ่ายภาพ (Delivery Result)**

#### 📸 **Proof of Delivery (POD)**
```
Driver finishes delivery
        ↓
[Click "ยืนยันส่ง"]
        ↓
[Take Photo or Upload]
   - Camera: ถ่ายภาพผลิตภัณฑ์ที่ส่ง
   - Upload: select from device
        ↓
[Choose Status]
   - ✅ "ส่งสำเร็จ" (Delivered)
   - ⚠️ "ติดปัญหา" (Problem)
   - 🔙 "กลับมา" (Returned)
        ↓
[If Problem/Returned:]
   [Fill Complaint/Note]
   - "ไม่อยู่บ้าน"
   - "เบอร์ผิด"
   - "ปฏิเสธการรับ"
   - "ที่อยู่ผิด"
        ↓
[Click "บันทึกผล"]
        ↓
✅ Order Status updated:
   - photo: [image file URL]
   - deliveredAt: timestamp
   - status: "ส่งสำเร็จ" / "ติดปัญหา" / "กลับมา"
   - complaint: (if any)
        ↓
📷 Photo saved:
   - Local Storage
   - Uploaded to Google Drive (POD folder)
   - Reference saved in Supabase
        ↓
🔔 Sales person notified
```

---

### 6️⃣ **ติดต่อสื่อสาร**

#### 💬 **Chat with Sales/Others**
```
Driver Dashboard → "แชท" Icon
        ↓
[Open Chat Panel]
        ↓
[View Conversation]
        ↓
[Type Message]
   - "ลูกค้าไม่อยู่"
   - "เส้นทางเปลี่ยน?"
   - "ถามเรื่องเก็บเงิน"
        ↓
[Send]
        ↓
📍 Message saved:
   - Local Storage
   - Supabase chat_messages table
   - Timestamp & sender role recorded
```

---

### 7️⃣ **ดูประเมินผล**

#### ⭐ **Driver Score**
```
Driver Dashboard → "สรุป" Tab
        ↓
View today's stats:
   - 📦 Orders Assigned: 10
   - ✅ Completed: 9
   - ⚠️ Problem: 1
   - ⭐ Score: 4.5 / 5.0
   
   - ✅ On-time: 8/9 (89%)
   - 📸 POD Quality: Good
   - 💬 Complaints: 1
        ↓
Driver can:
   - View detailed breakdown
   - See which orders have issues
   - Contact Sales for clarification
```

---

## 🔄 ข้อมูลไหลวน (Data Flow)

### 📤 **Upload Flow (Sales → Cloud)**
```
Sales creates Order
        ↓
[Save to Local Storage]
        ↓
[Sync to Supabase]
        ↓
[Sync to Google Sheets]
        ↓
✅ Data on Cloud (backup & accessible anywhere)
```

### 📥 **Download Flow (Cloud → Driver)**
```
Driver opens app
        ↓
[Load from Local Storage first] (Fast)
        ↓
[Fetch from Supabase] (if online)
        ↓
[Refresh data]
   - Get all orders
   - Get driver info
   - Get customer data
        ↓
[Driver sees updated order list]
```

### 🔄 **Real-time Sync**
```
Driver updates Order Status
   (e.g., "เช็คอิน" / "ส่งสำเร็จ")
        ↓
[Update Local Storage] (instant)
        ↓
[Send to Supabase] (background)
        ↓
[Other devices (Sales) notified]
   - If using real-time subscriptions
   - Or refresh on next manual sync
```

---

## 💾 ข้อมูลที่บันทึก (Data Storage)

### **5 Main Tables:**

#### 1️⃣ **CUSTOMERS**
| Field | Type | Description |
|-------|------|-------------|
| id | text | CUST-001, CUST-002... |
| name | text | ชื่อร้านค้า |
| contact | text | ชื่อผู้ติดต่อ |
| phone | text | เบอร์โทรศัพท์ |
| zone | text | เขต/พื้นที่ |
| address | text | ที่อยู่ |
| mapUrl | text | Google Maps URL |
| note | text | หมายเหตุ |
| updatedAt | timestamp | วันเวลาอัพเดท |

#### 2️⃣ **ORDERS**
| Field | Type | Description |
|-------|------|-------------|
| id | text | ORD-001, ORD-002... |
| customerId | text | เชื่อมไป customers |
| customerName | text | ชื่อลูกค้า (denormalized) |
| customerPhone | text | เบอร์โทร (denormalized) |
| zone | text | เขต |
| address | text | ที่อยู่ |
| mapUrl | text | Google Maps URL |
| window | text | ช่วงเวลา: "09:00-12:00" |
| boxes | int | จำนวนกล่อง |
| cod | int | เก็บเงินปลายทาง |
| driverId | text | คนขับที่รับ: "D1", "D2"... |
| driverName | text | ชื่อคนขับ |
| status | text | รอคนขับรับ, กำลังส่ง, ส่งสำเร็จ, ติดปัญหา, ยกเลิก, กลับมา |
| photo | text | URL ของภาพ POD |
| checkInAt | timestamp | เวลาคนขับมารับ |
| deliveredAt | timestamp | เวลาส่งสำเร็จ |
| complaint | text | ข้อร้องเรียน (if any) |
| salesNote | text | หมายเหตุจากพนักงานขาย |
| createdAt | timestamp | วันเวลาสร้าง |
| updatedAt | timestamp | วันเวลาแก้ไขล่าสุด |

#### 3️⃣ **DRIVERS**
| Field | Type | Description |
|-------|------|-------------|
| id | text | D1, D2, D3... |
| firstName | text | ชื่อจริง |
| lastName | text | นามสกุล |
| name | text | ชื่อเต็ม (computed) |
| phone | text | เบอร์โทร |
| vehicle | text | ยานพาหนะ: รถยนต์, รถตู้, รถบรรทุก |
| plate | text | ทะเบียน |
| zone | text | เขตหลัก |
| createdAt | timestamp | วันเวลาลงทะเบียน |
| updatedAt | timestamp | วันเวลาแก้ไขล่าสุด |

#### 4️⃣ **DRIVER_LOCATIONS** (Real-time GPS)
| Field | Type | Description |
|-------|------|-------------|
| driver_id | text | D1, D2... (primary key) |
| driver_name | text | ชื่อคนขับ |
| plate | text | ทะเบียน |
| zone | text | เขต |
| lat | float | ละติจูด |
| lng | float | ลองจิจูด |
| timestamp | bigint | Unix timestamp (ms) |

#### 5️⃣ **CHAT_MESSAGES**
| Field | Type | Description |
|-------|------|-------------|
| id | bigint | Auto-generated |
| createdAt | timestamp | วันเวลา |
| sender_role | text | "sales" หรือ "driver" |
| sender_name | text | ชื่อผู้ส่ง |
| sender_phone | text | เบอร์โทรผู้ส่ง |
| message | text | ข้อความ |

---

## 🔐 Authentication & Security

### **Current System (Simple)**
```
- No password required
- Role-based (sales/driver)
- Identify by name/phone
- Trust-based (local team)
```

### **Data Access**
```
- ✅ Sales: Can view/edit all customers, orders, drivers
- ✅ Driver: Can view their own orders + view map
- ✅ Driver: Can update order status when delivering
- ✅ All: Can read/write to chat
- ⚠️  No RLS on Supabase yet (current policies: "allow all")
```

---

## 🛠️ Integration Points

### **Option 1: Google Sheets (Recommended for Thai SMBs)**
```
Flow:
  App ↔ Google Apps Script ↔ Google Sheets
  
Benefits:
  - No database setup needed
  - Easy to view/edit data in Sheets
  - Google Drive for photos
  - Free tier available
  - Works offline (local storage)
```

### **Option 2: Supabase (Currently broken)**
```
Flow:
  App ↔ Supabase (PostgreSQL + Realtime)
  
Benefits:
  - Real-time sync
  - Built-in authentication
  - Scalable
  - REST API
  
Issues:
  - Current setup has RLS policy problems
  - Need to reset and reconfigure
```

### **Option 3: Hybrid**
```
Flow:
  App ↔ Local Storage ↔ Google Sheets
                  ↔ Supabase (when fixed)
  
Best of both worlds:
  - Works offline
  - Syncs when online
  - Multiple backups
```

---

## 📱 Device & Connectivity

### **Sales Person**
- 💻 Desktop/Laptop
- 📶 Usually at office
- ✅ Stable internet
- 🔄 Real-time sync important

### **Driver**
- 📱 Mobile phone (Android/iOS)
- 📶 Variable connectivity (highway, rural)
- ✅ GPS always needed
- 🔄 Works offline, syncs when online

### **Storage Strategy**
```
All devices:
  - Primary: Local Storage (always available)
  - Secondary: Cloud (Supabase/Google Sheets)
  
Driver online → Sync to cloud
Driver offline → Work with local data → Sync when online
```

---

## ⚙️ Technical Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend | Next.js + React | UI & Logic |
| Browser Storage | LocalStorage | Offline cache |
| Cloud DB (opt1) | Google Sheets | Data backup & reporting |
| Cloud DB (opt2) | Supabase | Real-time database |
| Cloud Storage | Google Drive | POD photos |
| Location | Browser Geolocation API | Driver GPS tracking |
| Maps | OpenStreetMap | Map display |
| Backend | Google Apps Script | Data sync to Sheets |

---

## 🚀 Daily Operation Flow

```
MORNING:
  Sales person logs in
    ↓
  Loads yesterday's data from Supabase/Google Sheets
    ↓
  Reviews pending orders
    ↓
  Creates new orders for today
  
DRIVERS START DAY:
  Driver logs in
    ↓
  Downloads orders for today
    ↓
  Sees order queue filtered by zone
    ↓
  Starts accepting orders
  
DURING DELIVERY:
  Driver → [Accept Order]
    ↓
  GPS tracking starts (automatic)
    ↓
  Navigate to customer → Check-in
    ↓
  Deliver package → Take photo → Select status
    ↓
  [Save] → Updates Local + Supabase
    ↓
  Sales sees real-time update
  
END OF DAY:
  Sync all data to Google Sheets
    ↓
  Generate daily report
    ↓
  Calculate driver scores
    ↓
  Archive & backup
```

---

## ✅ Summary Table

| Feature | Sales | Driver | Status |
|---------|-------|--------|--------|
| Add Customers | ✅ | ❌ | Done |
| View Customers | ✅ | ✅ | Done |
| Create Orders | ✅ | ❌ | Done |
| Accept Orders | ❌ | ✅ | Done |
| Check-in | ❌ | ✅ | Done |
| Complete Delivery | ❌ | ✅ | Done |
| Upload POD Photos | ❌ | ✅ | Done |
| Real-time Tracking | ✅ | ✅ | Partial |
| Chat | ✅ | ✅ | Done |
| Reports | ✅ | ✅ | Basic |
| Offline Support | ✅ | ✅ | Done |

---

## 📌 Important Notes

1. **Offline First**: All data syncs to Local Storage first, then to cloud when online
2. **No Login Complexity**: Trust-based ID for local operations
3. **Google Maps Integration**: Uses public Maps API and OSM
4. **Photo Storage**: Google Drive (free, automatic backup)
5. **Multi-Province**: Designed for 20-30 customers/day, 5 drivers, 6+ provinces
6. **Mobile Friendly**: Responsive design for phones and tablets

