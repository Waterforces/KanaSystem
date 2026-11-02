/**
 * ========================================================
 * 📊 utils/excelHelper.ts - จัดการส่งออกไฟล์ Excel (.xlsx)
 * ========================================================
 * ออกแบบเพื่อเปิดใช้งานบนคอมพิวเตอร์ (PC / Mac) โดยเฉพาะ
 * ตั้งชื่อไฟล์ตามรูปแบบ: DD-MM-YYYY.xlsx (เช่น 01-11-2026.xlsx)
 */

import * as XLSX from 'xlsx'
import type { SaleOrder, Expense, Product, FinancialSummary } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'

/**
 * ป้องกันช่องโหว่ Formula Injection (Spreadsheet / CSV Injection)
 * หากข้อความขึ้นต้นด้วย =, +, -, @, \t, \r จะเติมเครื่องหมาย ' นำหน้า
 */
export function sanitizeSpreadsheetCell(val: unknown): string | number {
  if (typeof val === 'number') return val
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`
  }
  return str
}

/**
 * แปลงวันที่เป็นรูปแบบ DD-MM-YYYY (เช่น 01-11-2026)
 */
export function getFormattedDateFilename(dateInput?: string): string {
  let d = new Date()
  if (dateInput && dateInput.includes('-')) {
    const parts = dateInput.split('-')
    if (parts.length === 3) {
      const y = parseInt(parts[0], 10)
      const m = parseInt(parts[1], 10) - 1
      const day = parseInt(parts[2], 10)
      d = new Date(y, m, day)
    }
  }

  const dd = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yyyy = d.getFullYear()

  return `${dd}-${mm}-${yyyy}.xlsx`
}

export async function exportFinancialReportToExcel({
  summary,
  orders,
  expenses,
  products,
  filterTitle = 'รายงานภาพรวมทั้งหมด',
  targetDate,
}: {
  summary: FinancialSummary
  orders: SaleOrder[]
  expenses: Expense[]
  products: Product[]
  filterTitle?: string
  targetDate?: string
}) {
  const wb = XLSX.utils.book_new()

  // 1️⃣ แผ่นงานที่ 1: สรุปภาพรวมการเงิน (Summary)
  const summaryData = [
    ['หัวข้อรายงาน', filterTitle],
    ['ชื่อร้านค้า', SHOP_CONFIG.shopName],
    ['วันที่ออกรายงาน', new Date().toLocaleString('th-TH')],
    [],
    ['รายการสรุปทางการเงินสำหรับคอมพิวเตอร์', 'จำนวนเงิน (บาท)'],
    ['รายรับรวมจากการขาย (Total Revenue)', summary.totalRevenue],
    ['ต้นทุนสินค้าที่ขายไป (Total Cost)', summary.totalCost],
    ['กำไรขั้นต้น (Gross Profit)', summary.grossProfit],
    ['หัก: ค่าใช้จ่ายอื่นๆ ของร้าน (Total Expenses)', summary.totalExpenses],
    ['กำไรสุทธิ (Net Profit)', summary.netProfit],
    ['จำนวนบิลที่ขายได้ (Total Orders)', summary.orderCount],
  ]
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryData)
  wsSummary['!cols'] = [{ wch: 42 }, { wch: 25 }]
  XLSX.utils.book_append_sheet(wb, wsSummary, 'สรุปภาพรวม')

  // 2️⃣ แผ่นงานที่ 2: รายการบิลขายสินค้า (Sales Orders)
  const ordersData: Record<string, unknown>[] = orders.map((o) => {
    const isThaiHelp =
      o.paymentMethod === 'THAI_CHUEY_THAI' ||
      (o.cashReceived > 0 && Math.abs(o.cashReceived - (o.totalAmount * 0.4)) < 0.01)

    return {
      'เลขที่บิล': sanitizeSpreadsheetCell(o.orderNo),
      'วันเวลาที่ขาย': new Date(o.createdAt).toLocaleString('th-TH'),
      'วันที่ (YYYY-MM-DD)': sanitizeSpreadsheetCell(o.dateStr),
      'ช่องทางชำระเงิน': isThaiHelp ? 'ไทยช่วยไทย' : o.paymentMethod === 'CASH' ? 'เงินสด' : 'PromptPay',
      'ยอดเงินรวม (บาท)': o.totalAmount,
      'ส่วนลดสินค้ารวม (บาท)': o.itemDiscountTotal || o.items.reduce((sum, it) => sum + ((it.discount || 0) * it.quantity), 0),
      'ต้นทุนสินค้ารวม (บาท)': o.totalCost,
      'กำไรบิลนี้ (บาท)': o.profit,
      'เงินที่รับมา (บาท)': o.cashReceived,
      'เงินทอน (บาท)': o.change,
      'จำนวนชิ้นรวม': o.items.reduce((sum, item) => sum + item.quantity, 0),
    }
  })

  // แถวสรุปรวมท้ายตาราง (Total Row)
  if (orders.length > 0) {
    const totalAmountSum = orders.reduce((sum, o) => sum + o.totalAmount, 0)
    const totalItemDiscountSum = orders.reduce((sum, o) => sum + (o.itemDiscountTotal || o.items.reduce((s, it) => s + ((it.discount || 0) * it.quantity), 0)), 0)
    const totalCostSum = orders.reduce((sum, o) => sum + o.totalCost, 0)
    const totalProfitSum = orders.reduce((sum, o) => sum + o.profit, 0)
    const totalCashRecSum = orders.reduce((sum, o) => sum + o.cashReceived, 0)
    const totalChangeSum = orders.reduce((sum, o) => sum + o.change, 0)
    const totalItemsCountSum = orders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.quantity, 0), 0)

    ordersData.push({
      'เลขที่บิล': 'ยอดรวมทั้งหมด',
      'วันเวลาที่ขาย': '',
      'วันที่ (YYYY-MM-DD)': '',
      'ช่องทางชำระเงิน': `(${orders.length} บิล)`,
      'ยอดเงินรวม (บาท)': totalAmountSum,
      'ส่วนลดสินค้ารวม (บาท)': totalItemDiscountSum,
      'ต้นทุนสินค้ารวม (บาท)': totalCostSum,
      'กำไรบิลนี้ (บาท)': totalProfitSum,
      'เงินที่รับมา (บาท)': totalCashRecSum,
      'เงินทอน (บาท)': totalChangeSum,
      'จำนวนชิ้นรวม': totalItemsCountSum,
    })
  }

  const wsOrders = XLSX.utils.json_to_sheet(ordersData)
  wsOrders['!cols'] = [
    { wch: 20 }, { wch: 24 }, { wch: 15 }, { wch: 18 },
    { wch: 18 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 14 }
  ]
  XLSX.utils.book_append_sheet(wb, wsOrders, 'ประวัติการขาย')

  // 3️⃣ แผ่นงานที่ 3: รายละเอียดสินค้าที่ขายในแต่ละบิล (Sold Items)
  const itemsData: Record<string, unknown>[] = []
  orders.forEach((o) => {
    ;(o.items || []).forEach((item) => {
      const regularPrice = Number(item.price) || 0
      const disc = Number(item.discount) || 0
      const actualPrice = regularPrice - disc
      const qty = Number(item.quantity) || 1
      const subtotal = item.subtotal != null ? Number(item.subtotal) : actualPrice * qty
      const itemCost = Number(item.cost) || 0
      const profit = (actualPrice - itemCost) * qty

      itemsData.push({
        'เลขที่บิล': sanitizeSpreadsheetCell(o.orderNo),
        'วันเวลา': new Date(o.createdAt).toLocaleString('th-TH'),
        'รหัสบาร์โค้ด': sanitizeSpreadsheetCell(item.barcode || '-'),
        'ชื่อสินค้า': sanitizeSpreadsheetCell(item.name || '-'),
        'ราคาปกติ/ชิ้น': regularPrice,
        'ส่วนลด/ชิ้น (บาท)': disc,
        'ราคาขายจริง/ชิ้น': actualPrice,
        'ต้นทุน/ชิ้น': itemCost,
        'จำนวนที่ซื้อ': qty,
        'ยอดรวม (บาท)': subtotal,
        'กำไรรวม (บาท)': profit,
      })
    })
  })

  // แถวสรุปรวมท้ายตารางรายละเอียดสินค้า
  if (itemsData.length > 0) {
    const totalQty = orders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + (Number(it.quantity) || 0), 0), 0)
    const totalSub = orders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => {
      const eff = (Number(it.price) || 0) - (Number(it.discount) || 0)
      const q = Number(it.quantity) || 1
      return s + (it.subtotal != null ? Number(it.subtotal) : eff * q)
    }, 0), 0)
    const totalProf = orders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => {
      const eff = (Number(it.price) || 0) - (Number(it.discount) || 0)
      const c = Number(it.cost) || 0
      const q = Number(it.quantity) || 1
      return s + (eff - c) * q
    }, 0), 0)

    itemsData.push({
      'เลขที่บิล': 'ยอดรวมทั้งหมด',
      'วันเวลา': '',
      'รหัสบาร์โค้ด': '',
      'ชื่อสินค้า': `(${itemsData.length} รายการ)`,
      'ราคาปกติ/ชิ้น': '',
      'ส่วนลด/ชิ้น (บาท)': '',
      'ราคาขายจริง/ชิ้น': '',
      'ต้นทุน/ชิ้น': '',
      'จำนวนที่ซื้อ': totalQty,
      'ยอดรวม (บาท)': totalSub,
      'กำไรรวม (บาท)': totalProf,
    })
  }

  const wsItems = XLSX.utils.json_to_sheet(itemsData)
  wsItems['!cols'] = [
    { wch: 20 }, { wch: 24 }, { wch: 16 }, { wch: 28 },
    { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 16 }, { wch: 16 }
  ]
  XLSX.utils.book_append_sheet(wb, wsItems, 'รายละเอียดสินค้าที่ขาย')

  // 4️⃣ แผ่นงานที่ 4: รายจ่ายของร้าน (Expenses)
  const expensesData: Record<string, unknown>[] = expenses.map((e) => ({
    'วันเวลาที่จ่าย': new Date(e.createdAt).toLocaleString('th-TH'),
    'วันที่ (YYYY-MM-DD)': sanitizeSpreadsheetCell(e.dateStr),
    'หมวดหมู่ค่าใช้จ่าย': sanitizeSpreadsheetCell(e.category),
    'รายการค่าใช้จ่าย': sanitizeSpreadsheetCell(e.title),
    'จำนวนเงิน (บาท)': e.amount,
    'หมายเหตุ': sanitizeSpreadsheetCell(e.note || '-'),
  }))

  // แถวสรุปรวมท้ายตารางรายจ่าย
  if (expenses.length > 0) {
    const totalExpenseAmount = expenses.reduce((sum, e) => sum + e.amount, 0)
    expensesData.push({
      'วันเวลาที่จ่าย': 'ยอดรวมทั้งหมด',
      'วันที่ (YYYY-MM-DD)': '',
      'หมวดหมู่ค่าใช้จ่าย': `(${expenses.length} รายการ)`,
      'รายการค่าใช้จ่าย': '',
      'จำนวนเงิน (บาท)': totalExpenseAmount,
      'หมายเหตุ': '-',
    })
  }

  const wsExpenses = XLSX.utils.json_to_sheet(expensesData)
  wsExpenses['!cols'] = [
    { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 30 }, { wch: 18 }, { wch: 25 }
  ]
  XLSX.utils.book_append_sheet(wb, wsExpenses, 'รายจ่ายร้าน')

  // 5️⃣ แผ่นงานที่ 5: ข้อมูลสินค้าและสต็อกคงเหลือ (Products & Stock)
  const productsData: Record<string, unknown>[] = products.map((p) => ({
    'รหัสบาร์โค้ด': sanitizeSpreadsheetCell(p.barcode),
    'ชื่อสินค้า': sanitizeSpreadsheetCell(p.name),
    'หมวดหมู่': sanitizeSpreadsheetCell(p.category),
    'ราคาขาย (บาท)': p.price,
    'ต้นทุน (บาท)': p.cost,
    'กำไรคาดหวัง/ชิ้น': p.price - p.cost,
    'สต็อกคงเหลือ': p.stock,
    'มูลค่าสต็อกรวม': p.cost * p.stock,
  }))

  // แถวสรุปรวมท้ายตารางสต็อก
  if (products.length > 0) {
    const totalStockSum = products.reduce((sum, p) => sum + p.stock, 0)
    const totalStockValueSum = products.reduce((sum, p) => sum + p.cost * p.stock, 0)

    productsData.push({
      'รหัสบาร์โค้ด': 'ยอดรวมทั้งหมด',
      'ชื่อสินค้า': `(${products.length} รายการ)`,
      'หมวดหมู่': '',
      'ราคาขาย (บาท)': '',
      'ต้นทุน (บาท)': '',
      'กำไรคาดหวัง/ชิ้น': '',
      'สต็อกคงเหลือ': totalStockSum,
      'มูลค่าสต็อกรวม': totalStockValueSum,
    })
  }

  const wsProducts = XLSX.utils.json_to_sheet(productsData)
  wsProducts['!cols'] = [
    { wch: 16 }, { wch: 28 }, { wch: 18 }, { wch: 16 },
    { wch: 16 }, { wch: 18 }, { wch: 15 }, { wch: 18 }
  ]
  XLSX.utils.book_append_sheet(wb, wsProducts, 'สต็อกสินค้า')

  // กำหนดชื่อไฟล์ตามรูปแบบ DD-MM-YYYY.xlsx (เช่น 01-11-2026.xlsx)
  const filename = getFormattedDateFilename(targetDate)

  // สร้างไฟล์ในรูปแบบ Binary สำหรับส่งออก
  const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([wbout], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  // หากอยู่บน iPhone Safari: รองรับการเปิดแผง Share Sheet เพื่อกด AirDrop หรือส่ง LINE ไปเปิดบนคอมพิวเตอร์ได้ทันที
  if (typeof navigator !== 'undefined' && navigator.canShare) {
    try {
      const file = new File([blob], filename, {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      })
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: filename,
        })
        return
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        console.log('Share sheet dismissed, fallback to direct download', err)
      } else {
        return // ผู้ใช้กดยกเลิก share sheet
      }
    }
  }

  // ดาวน์โหลดไฟล์ตรงๆ เข้าเครื่อง
  XLSX.writeFile(wb, filename)
}
