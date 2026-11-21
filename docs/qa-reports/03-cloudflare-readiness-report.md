# ☁️ Agent 3 Report: Pre-Cloudflare Deployment & Frontend Reliability Audit

**Agent:** `cloudflare-readiness-qa` (Cloudflare Readiness Auditor)  
**สถานะภาพรวม:** ⚠️ **CONDITIONAL GO** (โครงสร้าง Cloudflare Static Export, Routing, Hydration, Dark Mode, iPad Scaling, IndexedDB v1→v3 และ Live Backend GET ผ่านทั้งหมด แต่พบความเสี่ยงระดับ HIGH เรื่องซิงก์รายจ่ายออฟไลน์)

---

## 1. ตารางเช็กลิสต์ก่อน Deploy ขึ้น Cloudflare

| หัวข้อตรวจสอบ | สถานะ | รายละเอียด |
| :--- | :---: | :--- |
| **Cloudflare `wrangler.json` & `out/` Static Export** | ✅ **PASS** | ครบทั้ง 4 หน้า (`/`, `/data/`, `/products/`, `/settings/`) + `404.html`, ขนาดรวม **1.56 MB**, พาธ `/_next/static/...` ถูกต้อง ไม่มี 404/redirect loop |
| **SSR / Static Hydration Safety** | ✅ **PASS** | ทุกการอ่าน `localStorage`, `Date`, `window`, `useLiveQuery` อยู่ใน `useEffect` หรือมีค่าเริ่มต้นปลอดภัย |
| **Dark Mode Completeness** | ✅ **PASS** | `@custom-variant dark` + FOUC Script ทำงานครบทั้ง 4 หน้าและโมดอล (มีจุดขัดเกลาเล็กน้อยเรื่อง `dark:hover:`) |
| **iPad Responsive & Touch Targets** | ✅ **PASS** | ขยายฟอนต์และ Layout บน `md:` สม่ำเสมอ ปุ่มหลัก `min-h-11` (มีปุ่ม `-`/`+` ย่อยบนการ์ด POS ขนาด 28px/36px) |
| **Security / XSS** | ✅ **PASS** | ไม่มี `innerHTML` หรือ `dangerouslySetInnerHTML` ที่รับข้อมูลจากผู้ใช้ และกรอง URL รูปภาพเฉพาะ `data:image/` กับ `https://` |
| **IndexedDB v1 → v2 → v3 Upgrade Path** | ✅ **PASS** | เพิ่มเฉพาะ index เสริม (`expenseNo`, `title`, `location`) ไม่เปลี่ยน Primary Key — เครื่อง iPhone/iPad เดิมอัปเกรดได้โดยข้อมูลไม่หาย |
| **Offline Queue & Expense Sync Resilience** | ❌ **FAIL (HIGH)** | ออเดอร์มีคิว + Grace Period 3 นาที แต่ **รายจ่ายไม่มีคิว/Grace Period** เสี่ยงหายเมื่อจดแบบออฟไลน์ |
| **Live GAS Backend (Read-Only GET × 3)** | ✅ **PASS** | HTTP 200 ทั้ง 3 รอบ, JSON สมบูรณ์ 100%, `badDateStr: 0`, เวลาเฉลี่ย **4,108 ms** (330.23 KB) |
| **TypeScript & Unit Tests** | ✅ **PASS** | `tsc --noEmit` (exit 0) และ `npm run test:unit` (6/6 passed) |

---

## 2. ตัวเลขที่วัดได้จริง (Exact Metrics)

### ขนาดไฟล์ Static Export (`out/`)
- **ขนาดรวมทั้งหมด:** `1,632,346` ไบต์ (**1,594.09 KB / ~1.56 MB**)
- **ไฟล์ HTML หลัก:** `out/index.html` (20.06 KB), `out/data/index.html` (20.97 KB), `out/products/index.html` (20.88 KB), `out/settings/index.html` (22.98 KB), `out/404.html` (14.69 KB) & `out/404/index.html` (14.69 KB)
- **ไฟล์ขนาดใหญ่สุด:** `2yt_5r2tjweet.js` (380.85 KB — ไลบรารีสแกนบาร์โค้ด), `35q52lg40ayb-.js` (229.29 KB), `0c98xzjfks9hq.js` (169.97 KB), `00vpi9cdubvmr.css` (63.95 KB)
- **Routing บน Cloudflare (`wrangler.json:1-8`, `next.config.ts:3-9`):** `trailingSlash: true` ทำงานร่วมกับ Cloudflare Workers Static Assets (`html_handling: "auto-trailing-slash"`) ได้ราบรื่น การเข้า `/data`, `/products`, `/settings` จะ 307 redirect ไปมี `/` ต่อท้ายแล้วเสิร์ฟ 200 OK ทันทีโดยไม่วนลูป

### ผลตรวจ Live Google Apps Script (Read-Only GET × 3 รอบ)
- **รอบ 1:** HTTP `200` | `4,126 ms` | `338,154` ไบต์ (`330.23 KB`)
- **รอบ 2:** HTTP `200` | `4,349 ms` | `338,154` ไบต์ (`330.23 KB`)
- **รอบ 3:** HTTP `200` | `3,849 ms` | `338,154` ไบต์ (`330.23 KB`)
- **สรุปความเร็ว:** ต่ำสุด `3,849 ms` | **เฉลี่ย `4,108 ms`** | สูงสุด `4,349 ms`
- **ความสมบูรณ์ข้อมูลจริง:** `products: 15`, `orders: 877` (`badDateStr: 0`, `nonArrayOrNullItems: 0`, `emptyItems: 0`, มีฟิลด์ `location` ครบ), `expenses: 26` (`badDateStr: 0`, มีฟิลด์ `location` ครบ)

---

## 3. ข้อค้นพบเรียงตามระดับความรุนแรง

### 🟠 HIGH
1. **Offline Expense Data Loss & Sync Deletion Race (`src/utils/googleSheetSync.ts:326-401`):** รายจ่ายที่บันทึกตอนออฟไลน์หรือตอน GAS ช้า ไม่มีคิวรอส่งและไม่มี Grace Period ทำให้ถูกลบออกจาก IndexedDB ในรอบซิงก์ถัดไป (และหากบันทึกข้ามเครื่อง/เวลาคลาดเคลื่อนจะยิงซ้ำหรือหายได้)

### 🟡 MEDIUM
2. **Unbatched Sequential IndexedDB Writes (`src/utils/googleSheetSync.ts:252-319`, `src/components/PosProvider.tsx:111, 122-127`):** ซิงก์ทุก 30 วิรัน loop อ่าน/อัปเดต `db.orders` ทีละแถว (~1,754 transactions ต่อรอบสำหรับ 877 บิล) ควรรวบเป็น `db.transaction` + `bulkPut`
3. **Product Mutations ไม่มีคิวออฟไลน์ (`src/app/products/page.tsx:115, 173`, `src/utils/googleSheetSync.ts:222-227`):** สินค้าที่เพิ่มตอนออฟไลน์จะถูกลบทิ้งเมื่อซิงก์ถ้า POST แรกไม่สำเร็จ
4. **Native `alert`/`confirm`/`prompt` 25 จุดบน iOS PWA (`src/app/page.tsx`, `data/page.tsx`, `products/page.tsx`, `CategoryModal.tsx`):** บนโหมดเต็มจอ iOS PWA อาจแสดงหัวโดเมนหรือมีปัญหาโฟกัสเมื่อเรียกซ้อนใน `<dialog>`

### 🔵 LOW
5. **`not_found_handling: "single-page-application"` ใน `wrangler.json:6`:** บดบัง `out/404.html` (หากต้องการ 404 จริงเปลี่ยนเป็น `"404-page"`)
6. **ขาด `dark:hover:` บนปุ่มรองบางปุ่ม** (`data/page.tsx:731,738`, `page.tsx:992`, `products/page.tsx:441,449,514,526`, `ItemDiscountModal.tsx:206,223`)
7. **ปุ่ม `-`/`+` บนการ์ด POS มีขนาด 28px/36px** (`src/app/page.tsx:557-581`) ซึ่งเล็กกว่ามาตรฐานสัมผัส 44px เล็กน้อย และตัวการ์ดสินค้าใช้ `<div>` แทน `<button>`
