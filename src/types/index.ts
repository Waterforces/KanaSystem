/**
 * ========================================================
 * 📦 types/index.ts - รูปแบบข้อมูลทั้งหมดในระบบ POS
 * ========================================================
 */

// สินค้าในร้าน
export interface Product {
  id?: number
  barcode: string      // รหัสบาร์โค้ด / QR Code (ห้ามซ้ำ)
  name: string         // ชื่อสินค้า
  price: number        // ราคาขาย (บาท)
  cost: number         // ต้นทุนสินค้า (บาท) สำหรับคำนวณกำไร
  stock: number        // จำนวนคงเหลือในคลัง
  category: string     // หมวดหมู่
  image?: string       // รูปภาพ (Base64 หรือ URL)
  createdAt: number    // เวลาที่เพิ่มข้อมูล (Timestamp)
  updatedAt: number    // เวลาแก้ไขล่าสุด (Timestamp)
}

// สินค้าในตะกร้าขาย
export interface CartItem {
  product: Product
  quantity: number
  discount?: number    // ส่วนลดต่อชิ้น (บาท, default: 0)
}

// ข้อมูลแต่ละรายการสินค้าในใบเสร็จ
export interface SaleOrderItem {
  productId?: number
  barcode: string
  name: string
  price: number        // ราคาปกติ (บาท)
  cost: number         // ต้นทุน (บาท)
  quantity: number     // จำนวนชิ้น
  discount?: number    // ส่วนลดต่อชิ้น (บาท, default: 0)
  subtotal: number     // ยอดขายจริง = (price - discount) * quantity
}

// บิลการขายสินค้า (Sale Order)
export interface SaleOrder {
  id?: number
  orderNo: string          // เลขที่บิล เช่น ORD-20261101-001
  items: SaleOrderItem[]   // รายการสินค้าที่ซื้อ
  totalAmount: number      // ยอดขายจริงรวมตามราคาสินค้าหลังหักส่วนลด (บาท)
  originalTotal?: number   // ยอดรวมก่อนหักส่วนลดสินค้า (บาท)
  itemDiscountTotal?: number // ส่วนลดสินค้ารวมทั้งหมดในบิล (บาท)
  totalCost: number        // ต้นทุนสินค้ารวม (บาท)
  profit: number           // กำไรเบื้องต้น = totalAmount - totalCost
  cashReceived: number     // เงินที่รับมา
  change: number           // เงินทอน
  paymentMethod: 'CASH' | 'PROMPTPAY' | 'THAI_CHUEY_THAI' // วิธีชำระเงิน
  customerPaid?: number    // ยอดที่ลูกค้าชำระจริง (กรณีไทยช่วยไทย คือ 40%)
  discountAmount?: number  // ส่วนลด/เงินช่วยเหลือ (กรณีไทยช่วยไทย คือ 60%)
  createdAt: number        // เวลาที่บันทึก
  dateStr: string          // วันที่รูปแบบ YYYY-MM-DD สำหรับกรองข้อมูล
  monthStr: string         // เดือนรูปแบบ YYYY-MM สำหรับสรุปรายเดือน
}

// รายจ่ายของร้าน (Expense)
export interface Expense {
  id?: number
  expenseNo?: string       // รหัสรายจ่าย เช่น EXP-20261106-150000-xxxx
  title: string            // รายการค่าใช้จ่าย เช่น ซื้อน้ำแข็ง, จ่ายค่าไฟ
  amount: number           // จำนวนเงิน (บาท)
  category: string         // หมวดหมู่ค่าใช้จ่าย
  note?: string            // หมายเหตุเพิ่มเติม
  createdAt: number        // เวลาที่จ่าย
  dateStr: string          // วันที่ YYYY-MM-DD
  monthStr: string         // เดือน YYYY-MM
}

// สรุปยอดภาพรวมทางบัญชี
export interface FinancialSummary {
  totalRevenue: number     // รายรับทั้งหมดจากการขาย
  totalCost: number        // ต้นทุนขายรวม
  grossProfit: number      // กำไรขั้นต้น (ยอดขาย - ต้นทุนสินค้า)
  totalExpenses: number    // รายจ่ายอื่นๆ ของร้าน
  netProfit: number        // กำไรสุทธิ (กำไรขั้นต้น - รายจ่าย)
  orderCount: number       // จำนวนบิลทั้งหมด
}
