/**
 * ========================================================
 * 🔄 utils/googleSheetSync.ts - ระบบเชื่อมต่อ Google Sheets API (v3)
 * ========================================================
 * จัดการรับ-ส่งข้อมูลสินค้า, รูปภาพ, หมวดหมู่, บิลขาย และรายจ่าย 2 ทิศทาง
 * ซิงก์ข้อมูลระหว่าง iPhone ↔ คอมพิวเตอร์ ↔ Google Sheets ให้ตรงกัน 100%
 */

import { db } from '../db/database'
import type { Product, SaleOrder, Expense } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'

// อ่าน URL ของ Google Apps Script Web App
export function getScriptUrl(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('kana_google_script_url')
    if (saved && saved.trim()) return saved.trim()
  }
  return SHOP_CONFIG.googleScriptUrl || ''
}

// บันทึก URL ใหม่
export function setScriptUrl(url: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('kana_google_script_url', url.trim())
  }
}

// ----------------------------------------------------
// ⏱️ ตัวจัดการ Concurrency เพื่อป้องกัน Race Condition
// ไม่ให้ sync GET ดึงข้อมูลเก่ามาทับข้อมูลที่กำลัง POST เขียนอยู่
// ----------------------------------------------------
let activeWriteCount = 0
let lastWriteCompletedAt = 0
let isSyncAllInProgress = false

export interface SyncAllResult {
  success: boolean
  productsCount: number
  ordersCount: number
  expensesCount: number
  hasCloudProducts: boolean
  error?: string
}

let activeSyncPromise: Promise<SyncAllResult> | null = null

export function isWritePending(): boolean {
  return activeWriteCount > 0 || Date.now() - lastWriteCompletedAt < 2000
}

export interface PostScriptResponse {
  success: boolean
  errorType?: string
  message?: string
}

/**
 * ฟังก์ชันส่งข้อมูล POST ไปที่ Google Apps Script พร้อมรับข้อมูลตอบกลับละเอียด
 */
export async function postToScriptWithResponse(payload: any): Promise<PostScriptResponse> {
  const url = getScriptUrl()
  if (!url) return { success: false, message: 'URL not configured' }
  activeWriteCount++
  const body = JSON.stringify({
    appToken: 'KANA_POS_SYNC_2026',
    ...payload,
  })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      mode: 'cors',
    })
    if (res.ok) {
      try {
        const json = await res.json()
        if (json && json.status === 'error') {
          console.warn('Google Apps Script error:', json.message)
          return {
            success: false,
            errorType: json.errorType || 'SERVER_BUSY',
            message: json.message || 'Server error',
          }
        }
      } catch {
        // กรณีตอบกลับเป็น text หรือ non-json ถือว่าสำเร็จ
      }
    }
    return { success: true }
  } catch (err: any) {
    console.warn('postToScript fetch failed:', err)
    return { success: false, errorType: 'NETWORK_ERROR', message: err?.message || 'Network error' }
  } finally {
    activeWriteCount = Math.max(0, activeWriteCount - 1)
    lastWriteCompletedAt = Date.now()
  }
}

/**
 * ฟังก์ชันส่งข้อมูล POST ไปที่ Google Apps Script (Helper เดิมสำหรับคำสั่งทั่วไป)
 */
async function postToScript(payload: any): Promise<boolean> {
  const res = await postToScriptWithResponse(payload)
  return res.success
}

/**
 * ดึงข้อมูลทั้งหมดจาก Google Sheets (หมวดหมู่, สินค้า, บิลขาย, รายจ่าย)
 * เพื่อให้คอมพิวเตอร์และมือถือมีข้อมูลตรงกัน 100%
 */
export async function syncAllDataFromGoogleSheet(): Promise<SyncAllResult> {
  // 🛡️ หากมีรอบการซิงก์กำลังทำงานอยู่ ให้รอรับผลลัพธ์ของรอบนั้น (แทนที่จะคืน 0 หลอกหน้าจอ)
  if (activeSyncPromise) {
    return activeSyncPromise
  }

  isSyncAllInProgress = true
  activeSyncPromise = (async (): Promise<SyncAllResult> => {
    const url = getScriptUrl()
    if (!url) {
      return {
        success: false,
        productsCount: 0,
        ordersCount: 0,
        expensesCount: 0,
        hasCloudProducts: false,
        error: 'ยังไม่ได้ตั้งค่า Google Apps Script URL',
      }
    }

    try {
    // ป้องกัน Race Condition: หากมีการเขียนข้อมูลขึ้น Google Sheets อยู่ในขณะนี้
    // ให้รอจนกว่าการเขียนจะเสร็จสิ้น เพื่อไม่ให้ดึงข้อมูลเก่า (Stale Data) มาทับข้อมูลใหม่ในเครื่อง
    let waitLoops = 0
    while (activeWriteCount > 0 && waitLoops < 25) {
      await new Promise((r) => setTimeout(r, 100))
      waitLoops++
    }
    const elapsedSinceWrite = Date.now() - lastWriteCompletedAt
    if (elapsedSinceWrite < 1500) {
      await new Promise((r) => setTimeout(r, 1500 - elapsedSinceWrite))
    }

    const response = await fetch(`${url}?action=getAllData&appToken=KANA_POS_SYNC_2026`)
    if (!response.ok) {
      throw new Error(`HTTP Error: ${response.status}`)
    }
    const data = await response.json()

    let pCount = 0
    let oCount = 0
    let eCount = 0
    let hasCloudProducts = false

    if (data.status === 'success') {
      // 1. ซิงก์หมวดหมู่สินค้าลง localStorage และแจ้งเตือนหน้าจอให้รีเรนเดอร์
      if (Array.isArray(data.categories) && data.categories.length > 0) {
        try {
          localStorage.setItem('kana_product_categories', JSON.stringify(data.categories))
          window.dispatchEvent(new CustomEvent('kana_categories_updated', { detail: data.categories }))
        } catch (err) {
          console.warn('Failed to update local categories:', err)
        }
      }

      // 2. ซิงก์สินค้า
      const localProducts = await db.products.toArray()
      const sampleBarcodes = new Set(['KN-1001', 'KN-1002', 'KN-1003', 'KN-1004', 'KN-1005'])
      const localIsOnlySamples =
        localProducts.length > 0 && localProducts.every((p) => sampleBarcodes.has(p.barcode))

      if (Array.isArray(data.products) && data.products.length > 0) {
        hasCloudProducts = true

        // หากคลาวด์มีสินค้าจริง และเครื่องนี้มีแค่สินค้าตัวอย่าง ให้ลบทิ้งทั้งหมดก่อน
        if (localIsOnlySamples) {
          await db.products.clear()
        }

        const cloudBarcodes = new Set(data.products.map((p: any) => String(p.barcode).trim()))

        for (const p of data.products) {
          const cleanBarcode = String(p.barcode).trim()
          const isValidImage =
            typeof p.image === 'string' &&
            (p.image.startsWith('data:image/') || p.image.startsWith('https://'))
          const safeImage = isValidImage ? p.image : undefined

          const existing = await db.products.where('barcode').equals(cleanBarcode).first()
          if (existing && existing.id) {
            await db.products.update(existing.id, {
              name: String(p.name || ''),
              price: Math.max(0, Number(p.price) || 0),
              cost: Math.max(0, Number(p.cost) || 0),
              stock: Math.max(0, Number(p.stock) || 0),
              category: String(p.category || 'อื่นๆ'),
              image: safeImage,
              updatedAt: Number(p.updatedAt) || Date.now(),
            })
          } else {
            await db.products.add({
              barcode: cleanBarcode,
              name: String(p.name || ''),
              price: Math.max(0, Number(p.price) || 0),
              cost: Math.max(0, Number(p.cost) || 0),
              stock: Math.max(0, Number(p.stock) || 0),
              category: String(p.category || 'อื่นๆ'),
              image: safeImage,
              createdAt: Number(p.updatedAt) || Date.now(),
              updatedAt: Number(p.updatedAt) || Date.now(),
            })
          }
          pCount++
        }

        // ลบสินค้าที่ไม่มีอยู่บน Cloud (ถูกลบออกไปแล้ว หรือสินค้าตัวอย่างเดิม) เพื่อให้ตรงกับ Cloud 100%
        for (const lp of localProducts) {
          if (!cloudBarcodes.has(lp.barcode) && lp.id) {
            await db.products.delete(lp.id)
          }
        }
      } else if (localIsOnlySamples) {
        // หาก Cloud ว่างเปล่า และเครื่องมีแค่ตัวอย่าง ให้ล้างตัวอย่างทิ้ง
        await db.products.clear()
      }

      // 3. ซิงก์ประวัติบิลขาย (พร้อมระบบ Auto-Deduplication ล้างบิลซ้ำในเครื่อง 100%)
      if (Array.isArray(data.orders)) {
        const cloudOrderNos = new Set(data.orders.map((o: any) => String(o.orderNo).trim()))

        // ขั้นตอนที่ 3.1: ล้างบิลซ้ำใน IndexedDB ของเครื่องทันที
        const initialLocalOrders = await db.orders.toArray()
        const seenLocalOrderNos = new Set<string>()
        for (const lo of initialLocalOrders) {
          const trimmedNo = String(lo.orderNo || '').trim()
          if (!trimmedNo) continue
          if (seenLocalOrderNos.has(trimmedNo)) {
            // บิลนี้มีซ้ำในเครื่องแล้ว ลบทิ้งทันที!
            if (lo.id) await db.orders.delete(lo.id)
          } else {
            seenLocalOrderNos.add(trimmedNo)
          }
        }

        // ขั้นตอนที่ 3.2: ซิงก์บิลจาก Cloud
        for (const o of data.orders) {
          const ordNo = String(o.orderNo).trim()
          if (!ordNo) continue
          let dStr = o.dateStr
          if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
            const cd = new Date(o.createdAt || Date.now())
            dStr = !isNaN(cd.getTime())
              ? getLocalIsoDate(cd)
              : getLocalIsoDate()
          }
          const mStr = dStr.slice(0, 7)

          const existingList = await db.orders.where('orderNo').equals(ordNo).toArray()
          if (existingList.length === 0) {
            await db.orders.add({
              orderNo: ordNo,
              createdAt: o.createdAt || Date.now(),
              dateStr: dStr,
              monthStr: mStr,
              paymentMethod: o.paymentMethod || 'CASH',
              totalAmount: o.totalAmount || 0,
              totalCost: o.totalCost || 0,
              profit: o.profit || 0,
              cashReceived: o.cashReceived || 0,
              change: o.change || 0,
              items: o.items || [],
            })
            oCount++
          } else {
            // อัปเดตรายการหลัก
            const primary = existingList[0]
            if (primary.id) {
              await db.orders.update(primary.id, {
                dateStr: dStr,
                monthStr: mStr,
                paymentMethod: o.paymentMethod || primary.paymentMethod || 'CASH',
                totalAmount: o.totalAmount != null ? o.totalAmount : primary.totalAmount,
                totalCost: o.totalCost != null ? o.totalCost : primary.totalCost,
                profit: o.profit != null ? o.profit : primary.profit,
                cashReceived: o.cashReceived != null ? o.cashReceived : primary.cashReceived,
                change: o.change != null ? o.change : primary.change,
                items: o.items && o.items.length > 0 ? o.items : primary.items,
              })
            }
            // หากมีตัวซ้ำเกิน 1 รายการ ให้ลบตัวซ้ำทั้งหมด
            if (existingList.length > 1) {
              for (let dupIdx = 1; dupIdx < existingList.length; dupIdx++) {
                const dup = existingList[dupIdx]
                if (dup.id) await db.orders.delete(dup.id)
              }
            }
          }
        }

        // ขั้นตอนที่ 3.3: ลบบิลในเครื่องที่ไม่มีอยู่บน Cloud แล้ว เพื่อให้ตรงกับ Cloud 100%
        const updatedLocalOrders = await db.orders.toArray()
        for (const lo of updatedLocalOrders) {
          const trimmedNo = String(lo.orderNo || '').trim()
          // 🛡️ ป้องกันการลบบิลที่ยังอยู่ในคิวรอส่ง หรือเพิ่งสร้างไม่เกิน 3 นาทีเด็ดขาด (Grace Period)
          if (isOrderPendingSync(trimmedNo)) continue
          if (Date.now() - (lo.createdAt || 0) < 180000) continue

          if (!cloudOrderNos.has(trimmedNo) && lo.id) {
            await db.orders.delete(lo.id)
          }
        }

        // พยายามส่งบิลที่ค้างอยู่ในคิวขึ้น Google Sheets อัตโนมัติ
        flushPendingOrders().catch(() => {})
      }

      // 4. ซิงก์รายจ่าย (พร้อมระบบ Auto-Deduplication)
      if (Array.isArray(data.expenses)) {
        const cloudExpenseKeys = new Set(
          data.expenses.map((e: any) => `${e.title}_${e.createdAt}`)
        )
        const localExpenses = await db.expenses.toArray()
        const seenExpKeys = new Set<string>()
        for (const le of localExpenses) {
          const expKey = `${le.title}_${le.createdAt}`
          if (seenExpKeys.has(expKey)) {
            if (le.id) await db.expenses.delete(le.id)
          } else {
            seenExpKeys.add(expKey)
          }
        }

        for (const exp of data.expenses) {
          const expDateStr = exp.dateStr || ''
          const expMonthStr = expDateStr.length >= 7 ? expDateStr.slice(0, 7) : ''

          const existingList = await db.expenses
            .where('title')
            .equals(exp.title)
            .and((item) => item.createdAt === exp.createdAt)
            .toArray()

          if (existingList.length === 0) {
            await db.expenses.add({
              title: String(exp.title || ''),
              amount: Math.max(0, Number(exp.amount) || 0),
              category: String(exp.category || 'อื่นๆ'),
              note: String(exp.note || ''),
              createdAt: Number(exp.createdAt) || Date.now(),
              dateStr: expDateStr,
              monthStr: expMonthStr,
            })
            eCount++
          } else {
            const primary = existingList[0]
            if (primary.id) {
              await db.expenses.update(primary.id, {
                amount: Math.max(0, Number(exp.amount) || 0),
                category: String(exp.category || 'อื่นๆ'),
                note: String(exp.note || ''),
                dateStr: expDateStr || primary.dateStr,
                monthStr: expMonthStr || primary.monthStr,
              })
            }
            if (existingList.length > 1) {
              for (let dupIdx = 1; dupIdx < existingList.length; dupIdx++) {
                const dup = existingList[dupIdx]
                if (dup.id) await db.expenses.delete(dup.id)
              }
            }
          }
        }

        // ลบรายจ่ายในเครื่องที่ไม่มีอยู่บน Cloud แล้ว
        const currentLocalExpenses = await db.expenses.toArray()
        for (const le of currentLocalExpenses) {
          const key = `${le.title}_${le.createdAt}`
          if (!cloudExpenseKeys.has(key) && le.id) {
            await db.expenses.delete(le.id)
          }
        }
      }

      return {
        success: true,
        productsCount: pCount,
        ordersCount: oCount,
        expensesCount: eCount,
        hasCloudProducts,
      }
    } else {
      return {
        success: false,
        productsCount: 0,
        ordersCount: 0,
        expensesCount: 0,
        hasCloudProducts: false,
        error: 'ข้อมูลไม่ถูกต้อง',
      }
    }
  } catch (err: unknown) {
    console.error('syncAllDataFromGoogleSheet error:', err)
    return {
      success: false,
      productsCount: 0,
      ordersCount: 0,
      expensesCount: 0,
      hasCloudProducts: false,
      error: (err as Error)?.message || 'เชื่อมต่อ Google Sheets ไม่สำเร็จ',
    }
  } finally {
    isSyncAllInProgress = false
  }
  })().finally(() => {
    isSyncAllInProgress = false
    activeSyncPromise = null
  })

  return activeSyncPromise
}

/**
 * ดึงรายการสินค้าอย่างเดียว
 */
export async function fetchProductsFromGoogleSheet(): Promise<{
  success: boolean
  count: number
  error?: string
}> {
  const res = await syncAllDataFromGoogleSheet()
  return { success: res.success, count: res.productsCount, error: res.error }
}

// ----------------------------------------------------
// 📦 ระบบคิวบันทึกบิลขาย (Pending Sync Queue)
// ป้องกันข้อมูลสูญหายเมื่อเน็ตหลุด หรือเกิด Server busy (15-30s timeout)
// ----------------------------------------------------
const PENDING_ORDERS_KEY = 'kana_pending_orders_queue'

export function getPendingOrders(): SaleOrder[] {
  try {
    const raw = localStorage.getItem(PENDING_ORDERS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function savePendingOrders(orders: SaleOrder[]) {
  try {
    localStorage.setItem(PENDING_ORDERS_KEY, JSON.stringify(orders))
  } catch {}
}

export function isOrderPendingSync(orderNo: string): boolean {
  const pending = getPendingOrders()
  return pending.some((o) => o.orderNo === orderNo)
}

let isRetryingPendingOrders = false

export async function flushPendingOrders() {
  if (isRetryingPendingOrders) return
  const pending = getPendingOrders()
  if (pending.length === 0) return

  isRetryingPendingOrders = true
  try {
    for (const order of [...pending]) {
      const res = await postToScriptWithResponse({
        action: 'saveOrder',
        order,
      })
      if (res.success || res.errorType === 'OUT_OF_STOCK') {
        const remaining = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
        savePendingOrders(remaining)
      } else {
        // หากยัง busy หรือเน็ตไม่มา ให้หยุดส่งและรอรอบถัดไป
        break
      }
    }
  } finally {
    isRetryingPendingOrders = false
  }
}

export function schedulePendingOrdersRetry() {
  setTimeout(() => {
    flushPendingOrders().catch(() => {})
  }, 3500)
}

/**
 * ส่งบิลขายไปบันทึกลง Google Sheets แบบ Real-time พร้อมระบบคิวและตรวจจับสต็อกไม่พอ
 */
export async function syncOrderToGoogleSheet(order: SaleOrder): Promise<PostScriptResponse> {
  // บันทึกเข้าคิวรอก่อนส่งเสมอ
  const pending = getPendingOrders()
  if (!pending.some((o) => o.orderNo === order.orderNo)) {
    pending.push(order)
    savePendingOrders(pending)
  }

  const res = await postToScriptWithResponse({
    action: 'saveOrder',
    order,
  })

  if (res.success) {
    // ส่งสำเร็จ นำออกจากคิว
    const updated = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
    savePendingOrders(updated)
    return { success: true }
  }

  if (res.errorType === 'OUT_OF_STOCK') {
    // สินค้าไม่พอ นำออกจากคิวและแจ้งผลกลับ
    const updated = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
    savePendingOrders(updated)
    return { success: false, errorType: 'OUT_OF_STOCK', message: res.message }
  }

  // หากเป็นเน็ตหลุดหรือ Server busy บิลยังคงอยู่ในคิว และสั่ง retry อัตโนมัติ
  schedulePendingOrdersRetry()
  return { success: false, errorType: res.errorType || 'SERVER_BUSY', message: res.message }
}

/**
 * ส่งรายจ่ายไปบันทึกลง Google Sheets
 */
export async function syncExpenseToGoogleSheet(expense: Expense) {
  await postToScript({
    action: 'saveExpense',
    expense,
  })
}

/**
 * ลบรายการรายจ่ายออกจาก Google Sheets
 */
export async function deleteExpenseFromGoogleSheet(expense: {
  title: string
  amount?: number
  category?: string
  dateStr?: string
  createdAt?: number
}): Promise<{ success: boolean }> {
  const ok = await postToScript({
    action: 'deleteExpense',
    expense,
  })
  return { success: ok }
}

/**
 * ส่งสินค้าที่เพิ่ม/แก้ไขไปบันทึกลง Google Sheets แบบ Real-time
 */
export async function syncProductToGoogleSheet(product: Product) {
  await postToScript({
    action: 'saveProduct',
    product,
  })
}

/**
 * ส่งหมวดหมู่สินค้าไปบันทึกลง Google Sheets
 */
export async function syncCategoriesToGoogleSheet(categories: string[]) {
  await postToScript({
    action: 'saveCategories',
    categories,
  })
}

/**
 * ลบสินค้าออกจาก Google Sheets
 */
export async function deleteProductFromGoogleSheet(barcode: string) {
  await postToScript({
    action: 'deleteProduct',
    barcode,
  })
}

/**
 * ส่งสินค้าและหมวดหมู่ทั้งหมดในเครื่องขึ้น Google Sheets (Bulk Sync)
 */
export async function syncAllProductsToGoogleSheet(
  products: Product[],
  categories: string[]
): Promise<{ success: boolean; count: number }> {
  const ok = await postToScript({
    action: 'syncAllProducts',
    products,
    categories,
  })
  return { success: ok, count: products.length }
}

/**
 * ส่งสินค้าและหมวดหมู่ทั้งหมดในเครื่องขึ้น Google Sheets
 */
export async function uploadAllLocalProductsToSheet(): Promise<{
  success: boolean
  count: number
}> {
  const products = await db.products.toArray()
  const categories = (() => {
    try {
      return JSON.parse(localStorage.getItem('kana_product_categories') || '[]')
    } catch {
      return []
    }
  })()
  return syncAllProductsToGoogleSheet(products, categories)
}

/**
 * ส่งประวัติบิลขายทั้งหมดในเครื่องขึ้น Google Sheets
 */
export async function uploadAllLocalOrdersToSheet(): Promise<{
  success: boolean
  count: number
}> {
  const orders = await db.orders.toArray()
  if (orders.length === 0) return { success: true, count: 0 }

  const ok = await postToScript({
    action: 'syncAllOrders',
    orders,
  })
  return { success: ok, count: orders.length }
}

/**
 * แปลงวันที่เป็น YYYY-MM-DD ตามเวลาท้องถิ่นของเครื่อง (ไม่เพี้ยนตาม UTC)
 */
export function getLocalIsoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * ล้างข้อมูลบิลขายและรายจ่ายบน Google Sheets ตามช่วงเวลา (วัน / เดือน / ทั้งหมด)
 * ตามลำดับชั้น Cascading (กลุ่มใหญ่ลบกลุ่มย่อย)
 */
export async function clearDataFromGoogleSheet(
  period: 'today' | 'month' | 'all',
  dateStr: string,
  monthStr: string
): Promise<{ success: boolean }> {
  const ok = await postToScript({
    action: 'clearData',
    period,
    dateStr,
    monthStr,
  })
  return { success: ok }
}

/**
 * ลบบิลเดี่ยวออกจาก Google Sheets (กรณีลูกค้ายกเลิก หรือคีย์เกิน) พร้อมคืนสต็อกสินค้าเข้าคลัง
 */
export async function deleteSingleOrderFromGoogleSheet(
  order: { orderNo: string; items?: any[]; dateStr?: string },
  restock: boolean = true
): Promise<{ success: boolean }> {
  const ok = await postToScript({
    action: 'deleteSingleOrder',
    orderNo: order.orderNo,
    items: (order.items || []).map((it) => ({
      name: it.name || '',
      barcode: it.barcode || '',
      quantity: Number(it.quantity) || 0,
    })),
    restock,
    dateStr: order.dateStr || '',
  })
  return { success: ok }
}
