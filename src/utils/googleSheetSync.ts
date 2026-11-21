/**
 * ========================================================
 * 🔄 utils/googleSheetSync.ts - ระบบเชื่อมต่อ Google Sheets API (v4)
 * ========================================================
 * จัดการรับ-ส่งข้อมูลสินค้า, รูปภาพ, หมวดหมู่, บิลขาย และรายจ่าย 2 ทิศทาง
 * พร้อมระบบคิวออฟไลน์ (Orders, Expenses, Products) และ Batch IndexedDB Sync
 */

import { db } from '../db/database'
import type { Product, SaleOrder, Expense } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { getLocalIsoDate } from './dateHelper'

export { getLocalIsoDate }

export function getScriptUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('kana_google_script_url')
      if (saved && saved.trim()) return saved.trim()
    } catch {
      // ละเว้นกรณี storage ถูกจำกัด
    }
  }
  return SHOP_CONFIG.googleScriptUrl || ''
}

export function setScriptUrl(url: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('kana_google_script_url', url.trim())
  }
}

export function getAppSyncToken(): string {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('kana_app_sync_token')
      if (saved && saved.trim()) return saved.trim()
    } catch {
      // ละเว้นกรณี storage ถูกจำกัด
    }
  }
  return SHOP_CONFIG.appSyncToken || ''
}

export function setAppSyncToken(token: string) {
  if (typeof window !== 'undefined') {
    localStorage.setItem('kana_app_sync_token', token.trim())
  }
}

// ----------------------------------------------------
// ⏱️ ตัวจัดการ Concurrency ป้องกัน Race Condition ระหว่างเขียนและอ่าน
// ----------------------------------------------------
let activeWriteCount = 0
let lastWriteCompletedAt = 0

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
 * แปลผลลัพธ์ตอบกลับจาก Apps Script อย่างเข้มงวด (ไม่ถือ HTTP error หรือ HTML error เป็น success)
 */
export function parseScriptPostResponse(
  ok: boolean,
  status: number,
  bodyText: string
): PostScriptResponse {
  if (!ok) {
    return {
      success: false,
      errorType: status === 429 ? 'RATE_LIMITED' : 'HTTP_ERROR',
      message: `HTTP Error: ${status}`,
    }
  }

  try {
    const json = JSON.parse(bodyText)
    if (json && json.status === 'success') {
      return { success: true }
    }
    if (json && json.status === 'error') {
      return {
        success: false,
        errorType: json.errorType || 'SERVER_BUSY',
        message: json.message || 'Server error',
      }
    }
  } catch {
    // non-JSON (เช่น HTML error/quota page) ต้องถือว่าไม่สำเร็จ เพื่อไม่ให้คิวลบบิลทิ้ง
  }

  return {
    success: false,
    errorType: 'INVALID_RESPONSE',
    message: 'Invalid or non-JSON response from server',
  }
}

/**
 * สร้างคีย์ระบุตัวตนของรายจ่ายที่เสถียร (ใช้ expenseNo เป็นหลัก ไม่อิงมิลลิวินาที createdAt)
 */
export function getExpenseSyncKey(exp: {
  expenseNo?: string
  title?: string
  dateStr?: string
  amount?: number
}): string {
  const no = String(exp.expenseNo || '').trim()
  if (no) return `NO:${no}`
  return `LEG:${String(exp.title || '').trim()}_${String(exp.dateStr || '').trim()}_${Number(exp.amount) || 0}`
}

/**
 * ฟังก์ชันส่งข้อมูล POST ไปที่ Google Apps Script พร้อมรับข้อมูลตอบกลับละเอียด
 */
export async function postToScriptWithResponse(payload: unknown): Promise<PostScriptResponse> {
  const url = getScriptUrl()
  if (!url) return { success: false, message: 'URL not configured' }
  activeWriteCount++
  const body = JSON.stringify({
    appToken: getAppSyncToken(),
    ...(payload && typeof payload === 'object' ? payload : {}),
  })

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body,
      mode: 'cors',
    })
    const text = await res.text()
    const parsed = parseScriptPostResponse(res.ok, res.status, text)
    if (!parsed.success) {
      console.warn('Google Apps Script error:', parsed.message)
    }
    return parsed
  } catch (err: unknown) {
    console.warn('postToScript fetch failed:', err)
    const message = err instanceof Error ? err.message : 'Network error'
    return { success: false, errorType: 'NETWORK_ERROR', message }
  } finally {
    activeWriteCount = Math.max(0, activeWriteCount - 1)
    lastWriteCompletedAt = Date.now()
  }
}

async function postToScript(payload: unknown): Promise<boolean> {
  const res = await postToScriptWithResponse(payload)
  return res.success
}

// ----------------------------------------------------
// 📦 คิวออฟไลน์ (Pending Sync Queues: Orders, Expenses, Products)
// ----------------------------------------------------
const PENDING_ORDERS_KEY = 'kana_pending_orders_queue'
const PENDING_EXPENSES_KEY = 'kana_pending_expenses_queue'
const PENDING_PRODUCTS_KEY = 'kana_pending_products_queue'

function readPendingQueue<T>(key: string): T[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function savePendingQueue<T>(key: string, items: T[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(key, JSON.stringify(items))
  } catch {
    // ละเว้นกรณี storage เต็ม
  }
}

export function getPendingOrders(): SaleOrder[] {
  return readPendingQueue<SaleOrder>(PENDING_ORDERS_KEY)
}

export function isOrderPendingSync(orderNo: string): boolean {
  return getPendingOrders().some((o) => o.orderNo === orderNo)
}

export function getPendingExpenses(): Expense[] {
  return readPendingQueue<Expense>(PENDING_EXPENSES_KEY)
}

export function isExpensePendingSync(exp: Pick<Expense, 'expenseNo' | 'title' | 'dateStr' | 'amount'>): boolean {
  const key = getExpenseSyncKey(exp)
  return getPendingExpenses().some((e) => getExpenseSyncKey(e) === key)
}

export function getPendingProducts(): Product[] {
  return readPendingQueue<Product>(PENDING_PRODUCTS_KEY)
}

export function isProductPendingSync(barcode: string): boolean {
  return getPendingProducts().some((p) => p.barcode === barcode)
}

let isRetryingPendingOrders = false
let isRetryingPendingExpenses = false
let isRetryingPendingProducts = false

async function rollbackRejectedOrderLocally(order: SaleOrder): Promise<void> {
  try {
    await db.transaction('rw', db.orders, db.products, async () => {
      await db.orders.where('orderNo').equals(order.orderNo).delete()
      for (const item of order.items || []) {
        if (!item.quantity) continue
        let prod = item.barcode
          ? await db.products.where('barcode').equals(item.barcode).first()
          : undefined
        if (!prod && item.name) {
          prod = await db.products.where('name').equals(item.name).first()
        }
        if (prod && prod.id) {
          await db.products.update(prod.id, {
            stock: (prod.stock || 0) + item.quantity,
            updatedAt: Date.now(),
          })
        }
      }
    })
  } catch (err) {
    console.error('Failed to rollback rejected order locally:', err)
  }
}

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
      if (res.success) {
        const remaining = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
        savePendingQueue(PENDING_ORDERS_KEY, remaining)
      } else if (res.errorType === 'OUT_OF_STOCK') {
        const remaining = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
        savePendingQueue(PENDING_ORDERS_KEY, remaining)
        await rollbackRejectedOrderLocally(order)
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent('kana_order_sync_rejected', {
              detail: {
                orderNo: order.orderNo,
                message: res.message || 'สินค้าในคลังไม่พอ (ถูกขายจากเครื่องอื่นแล้ว)',
              },
            })
          )
        }
        syncAllDataFromGoogleSheet().catch(() => {})
      } else {
        break
      }
    }
  } finally {
    isRetryingPendingOrders = false
  }
}

export async function flushPendingExpenses() {
  if (isRetryingPendingExpenses) return
  const pending = getPendingExpenses()
  if (pending.length === 0) return

  isRetryingPendingExpenses = true
  try {
    for (const exp of [...pending]) {
      const expKey = getExpenseSyncKey(exp)
      const res = await postToScriptWithResponse({
        action: 'saveExpense',
        expense: exp,
      })
      if (res.success || (res.errorType !== 'SERVER_BUSY' && res.message?.includes('วันปัจจุบัน'))) {
        const remaining = getPendingExpenses().filter((e) => getExpenseSyncKey(e) !== expKey)
        savePendingQueue(PENDING_EXPENSES_KEY, remaining)
      } else {
        break
      }
    }
  } finally {
    isRetryingPendingExpenses = false
  }
}

export async function flushPendingProducts() {
  if (isRetryingPendingProducts) return
  const pending = getPendingProducts()
  if (pending.length === 0) return

  isRetryingPendingProducts = true
  try {
    for (const prod of [...pending]) {
      const res = await postToScriptWithResponse({
        action: 'saveProduct',
        product: prod,
      })
      if (res.success) {
        const remaining = getPendingProducts().filter((p) => p.barcode !== prod.barcode)
        savePendingQueue(PENDING_PRODUCTS_KEY, remaining)
      } else {
        break
      }
    }
  } finally {
    isRetryingPendingProducts = false
  }
}

export function schedulePendingSyncRetry() {
  setTimeout(() => {
    flushPendingProducts().catch(() => {})
    flushPendingOrders().catch(() => {})
    flushPendingExpenses().catch(() => {})
  }, 3500)
}

/**
 * ดึงข้อมูลทั้งหมดจาก Google Sheets (หมวดหมู่, สินค้า, บิลขาย, รายจ่าย)
 * ใช้ Batch Dexie Transactions + Grace Period ป้องกันข้อมูลออฟไลน์สูญหาย
 */
export async function syncAllDataFromGoogleSheet(): Promise<SyncAllResult> {
  if (activeSyncPromise) {
    return activeSyncPromise
  }

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
      // รอให้การเขียนที่กำลังค้างอยู่เสร็จสิ้น (สูงสุด ~15 วินาที) ป้องกันการอ่านข้อมูลเก่ามาทับ
      let waitLoops = 0
      while (activeWriteCount > 0 && waitLoops < 100) {
        await new Promise((r) => setTimeout(r, 150))
        waitLoops++
      }
      const elapsedSinceWrite = Date.now() - lastWriteCompletedAt
      if (elapsedSinceWrite < 1500) {
        await new Promise((r) => setTimeout(r, 1500 - elapsedSinceWrite))
      }

      // พยายามดันคิวออฟไลน์ขึ้น Cloud ก่อนดึงกลับ
      await flushPendingProducts().catch(() => {})
      await flushPendingOrders().catch(() => {})
      await flushPendingExpenses().catch(() => {})

      const sep = url.includes('?') ? '&' : '?'
      const response = await fetch(`${url}${sep}action=getAllData&appToken=${encodeURIComponent(getAppSyncToken())}`)
      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`)
      }
      const data = await response.json()

      let pCount = 0
      let oCount = 0
      let eCount = 0
      let hasCloudProducts = false

      if (data.status === 'success') {
        if (Array.isArray(data.categories) && data.categories.length > 0) {
          try {
            localStorage.setItem('kana_product_categories', JSON.stringify(data.categories))
            window.dispatchEvent(new CustomEvent('kana_categories_updated', { detail: data.categories }))
          } catch (err) {
            console.warn('Failed to update local categories:', err)
          }
        }

        const nowMs = Date.now()

        // 2. ซิงก์สินค้าแบบ Batch Transaction
        const localProducts = await db.products.toArray()
        const sampleBarcodes = new Set(['KN-1001', 'KN-1002', 'KN-1003', 'KN-1004', 'KN-1005'])
        const localIsOnlySamples =
          localProducts.length > 0 && localProducts.every((p) => sampleBarcodes.has(p.barcode))

        if (Array.isArray(data.products) && data.products.length > 0) {
          hasCloudProducts = true

          await db.transaction('rw', db.products, async () => {
            if (localIsOnlySamples) {
              await db.products.clear()
            }

            const freshLocal = localIsOnlySamples ? [] : await db.products.toArray()
            const localByBarcode = new Map<string, Product>()
            for (const lp of freshLocal) {
              localByBarcode.set(lp.barcode, lp)
            }

            const cloudBarcodes = new Set<string>()
            const toPut: Product[] = []

            for (const p of data.products) {
              const cleanBarcode = String(p.barcode || '').trim()
              if (!cleanBarcode) continue
              cloudBarcodes.add(cleanBarcode)

              const existing = localByBarcode.get(cleanBarcode)
              // หากสินค้าตัวนี้กำลังรอส่งจากเครื่อง (Pending) และของในเครื่องใหม่กว่า ให้คงของในเครื่องไว้ก่อน
              if (existing && isProductPendingSync(cleanBarcode) && (existing.updatedAt || 0) > (Number(p.updatedAt) || 0)) {
                continue
              }

              const isValidImage =
                typeof p.image === 'string' &&
                (p.image.startsWith('data:image/') || p.image.startsWith('https://'))
              const safeImage = isValidImage ? p.image : undefined

              toPut.push({
                ...(existing?.id ? { id: existing.id } : {}),
                barcode: cleanBarcode,
                name: String(p.name || ''),
                price: Math.max(0, Number(p.price) || 0),
                cost: Math.max(0, Number(p.cost) || 0),
                stock: Math.max(0, Number(p.stock) || 0),
                category: String(p.category || 'อื่นๆ'),
                image: safeImage,
                createdAt: existing?.createdAt || Number(p.updatedAt) || nowMs,
                updatedAt: Number(p.updatedAt) || nowMs,
              })
              pCount++
            }

            if (toPut.length > 0) {
              await db.products.bulkPut(toPut)
            }

            const toDeleteIds: number[] = []
            for (const lp of freshLocal) {
              if (
                lp.id &&
                !cloudBarcodes.has(lp.barcode) &&
                !isProductPendingSync(lp.barcode) &&
                nowMs - (lp.updatedAt || 0) >= 180000
              ) {
                toDeleteIds.push(lp.id)
              }
            }
            if (toDeleteIds.length > 0) {
              await db.products.bulkDelete(toDeleteIds)
            }
          })
        } else if (localIsOnlySamples) {
          await db.products.clear()
        }

        // 3. ซิงก์ประวัติบิลขายแบบ Batch Transaction + Auto-Deduplication
        if (Array.isArray(data.orders)) {
          await db.transaction('rw', db.orders, async () => {
            const initialLocalOrders = await db.orders.toArray()
            const primaryByOrderNo = new Map<string, SaleOrder>()
            const dupIdsToDelete: number[] = []

            for (const lo of initialLocalOrders) {
              const trimmedNo = String(lo.orderNo || '').trim()
              if (!trimmedNo) {
                if (lo.id) dupIdsToDelete.push(lo.id)
                continue
              }
              if (primaryByOrderNo.has(trimmedNo)) {
                if (lo.id) dupIdsToDelete.push(lo.id)
              } else {
                primaryByOrderNo.set(trimmedNo, lo)
              }
            }

            const cloudOrderNos = new Set<string>()
            const toPutOrders: SaleOrder[] = []

            for (const o of data.orders) {
              const ordNo = String(o.orderNo || '').trim()
              if (!ordNo) continue
              cloudOrderNos.add(ordNo)

              let dStr = o.dateStr
              if (!dStr || !/^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
                const cd = new Date(o.createdAt || nowMs)
                dStr = !isNaN(cd.getTime()) ? getLocalIsoDate(cd) : getLocalIsoDate()
              }
              const mStr = dStr.slice(0, 7)

              const existing = primaryByOrderNo.get(ordNo)
              if (!existing) {
                toPutOrders.push({
                  orderNo: ordNo,
                  createdAt: o.createdAt || nowMs,
                  dateStr: dStr,
                  monthStr: mStr,
                  paymentMethod: o.paymentMethod || 'CASH',
                  totalAmount: o.totalAmount || 0,
                  totalCost: o.totalCost || 0,
                  profit: o.profit || 0,
                  cashReceived: o.cashReceived || 0,
                  change: o.change || 0,
                  location: o.location ? String(o.location).trim() : '',
                  items: o.items || [],
                })
                oCount++
              } else {
                toPutOrders.push({
                  ...existing,
                  dateStr: dStr,
                  monthStr: mStr,
                  paymentMethod: o.paymentMethod || existing.paymentMethod || 'CASH',
                  totalAmount: o.totalAmount != null ? o.totalAmount : existing.totalAmount,
                  totalCost: o.totalCost != null ? o.totalCost : existing.totalCost,
                  profit: o.profit != null ? o.profit : existing.profit,
                  cashReceived: o.cashReceived != null ? o.cashReceived : existing.cashReceived,
                  change: o.change != null ? o.change : existing.change,
                  location:
                    o.location != null ? String(o.location).trim() : existing.location || '',
                  items: o.items && o.items.length > 0 ? o.items : existing.items,
                })
              }
            }

            if (toPutOrders.length > 0) {
              await db.orders.bulkPut(toPutOrders)
            }

            for (const [ordNo, lo] of primaryByOrderNo.entries()) {
              if (
                lo.id &&
                !cloudOrderNos.has(ordNo) &&
                !isOrderPendingSync(ordNo) &&
                nowMs - (lo.createdAt || 0) >= 180000
              ) {
                dupIdsToDelete.push(lo.id)
              }
            }

            if (dupIdsToDelete.length > 0) {
              await db.orders.bulkDelete(dupIdsToDelete)
            }
          })
        }

        // 4. ซิงก์รายจ่ายแบบ Batch Transaction โดยอิง expenseNo เป็นหลัก + Grace Period 3 นาที
        if (Array.isArray(data.expenses)) {
          await db.transaction('rw', db.expenses, async () => {
            const localExpenses = await db.expenses.toArray()
            const primaryByKey = new Map<string, Expense>()
            const idsToDelete: number[] = []

            for (const le of localExpenses) {
              const k = getExpenseSyncKey(le)
              if (primaryByKey.has(k)) {
                if (le.id) idsToDelete.push(le.id)
              } else {
                primaryByKey.set(k, le)
              }
            }

            const cloudExpenseKeys = new Set<string>()
            const toPutExpenses: Expense[] = []

            for (const exp of data.expenses) {
              const expDateStr = exp.dateStr || ''
              const expMonthStr = expDateStr.length >= 7 ? expDateStr.slice(0, 7) : ''
              const expKey = getExpenseSyncKey({
                expenseNo: exp.expenseNo,
                title: exp.title,
                dateStr: expDateStr,
                amount: exp.amount,
              })
              cloudExpenseKeys.add(expKey)

              let existing = primaryByKey.get(expKey)
              if (!existing) {
                // fallback กรณีรายการเดิมไม่มี expenseNo ในเครื่องแต่ตรงชื่อ+วันที่+ยอด
                const legacyKey = getExpenseSyncKey({
                  title: exp.title,
                  dateStr: expDateStr,
                  amount: exp.amount,
                })
                existing = primaryByKey.get(legacyKey)
                if (existing) {
                  cloudExpenseKeys.add(legacyKey)
                }
              }

              if (!existing) {
                toPutExpenses.push({
                  expenseNo: exp.expenseNo ? String(exp.expenseNo) : undefined,
                  title: String(exp.title || ''),
                  amount: Math.max(0, Number(exp.amount) || 0),
                  category: String(exp.category || 'อื่นๆ'),
                  note: String(exp.note || ''),
                  location: exp.location ? String(exp.location).trim() : '',
                  createdAt: Number(exp.createdAt) || nowMs,
                  dateStr: expDateStr,
                  monthStr: expMonthStr,
                })
                eCount++
              } else {
                toPutExpenses.push({
                  ...existing,
                  expenseNo: exp.expenseNo ? String(exp.expenseNo) : existing.expenseNo,
                  amount: Math.max(0, Number(exp.amount) || 0),
                  category: String(exp.category || 'อื่นๆ'),
                  note: String(exp.note || ''),
                  location:
                    exp.location != null ? String(exp.location).trim() : existing.location || '',
                  dateStr: expDateStr || existing.dateStr,
                  monthStr: expMonthStr || existing.monthStr,
                })
              }
            }

            if (toPutExpenses.length > 0) {
              await db.expenses.bulkPut(toPutExpenses)
            }

            for (const [k, le] of primaryByKey.entries()) {
              if (
                le.id &&
                !cloudExpenseKeys.has(k) &&
                !isExpensePendingSync(le) &&
                nowMs - (le.createdAt || 0) >= 180000
              ) {
                idsToDelete.push(le.id)
              }
            }

            if (idsToDelete.length > 0) {
              await db.expenses.bulkDelete(idsToDelete)
            }
          })
        }

        return {
          success: true,
          productsCount: pCount,
          ordersCount: oCount,
          expensesCount: eCount,
          hasCloudProducts,
        }
      }

      return {
        success: false,
        productsCount: 0,
        ordersCount: 0,
        expensesCount: 0,
        hasCloudProducts: false,
        error: 'ข้อมูลไม่ถูกต้อง',
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
    }
  })().finally(() => {
    activeSyncPromise = null
  })

  return activeSyncPromise
}

export async function fetchProductsFromGoogleSheet(): Promise<{
  success: boolean
  count: number
  error?: string
}> {
  const res = await syncAllDataFromGoogleSheet()
  return { success: res.success, count: res.productsCount, error: res.error }
}

/**
 * ส่งบิลขายไปบันทึกลง Google Sheets แบบ Real-time พร้อมระบบคิวและตรวจจับสต็อกไม่พอ
 */
export async function syncOrderToGoogleSheet(order: SaleOrder): Promise<PostScriptResponse> {
  const pending = getPendingOrders()
  if (!pending.some((o) => o.orderNo === order.orderNo)) {
    pending.push(order)
    savePendingQueue(PENDING_ORDERS_KEY, pending)
  }

  const res = await postToScriptWithResponse({
    action: 'saveOrder',
    order,
  })

  if (res.success) {
    const updated = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
    savePendingQueue(PENDING_ORDERS_KEY, updated)
    return { success: true }
  }

  if (res.errorType === 'OUT_OF_STOCK') {
    const updated = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
    savePendingQueue(PENDING_ORDERS_KEY, updated)
    return { success: false, errorType: 'OUT_OF_STOCK', message: res.message }
  }

  schedulePendingSyncRetry()
  return { success: false, errorType: res.errorType || 'SERVER_BUSY', message: res.message }
}

/**
 * ส่งรายจ่ายไปบันทึกลง Google Sheets พร้อมคิวออฟไลน์ป้องกันข้อมูลสูญหาย
 */
export async function syncExpenseToGoogleSheet(expense: Expense): Promise<PostScriptResponse> {
  const expKey = getExpenseSyncKey(expense)
  const pending = getPendingExpenses()
  if (!pending.some((e) => getExpenseSyncKey(e) === expKey)) {
    pending.push(expense)
    savePendingQueue(PENDING_EXPENSES_KEY, pending)
  }

  const res = await postToScriptWithResponse({
    action: 'saveExpense',
    expense,
  })

  if (res.success) {
    const updated = getPendingExpenses().filter((e) => getExpenseSyncKey(e) !== expKey)
    savePendingQueue(PENDING_EXPENSES_KEY, updated)
    return { success: true }
  }

  schedulePendingSyncRetry()
  return res
}

/**
 * ลบรายการรายจ่ายออกจาก Google Sheets (แนบ location ด้วยเพื่อความปลอดภัย)
 */
export async function deleteExpenseFromGoogleSheet(expense: {
  expenseNo?: string
  title: string
  amount?: number
  category?: string
  location?: string
  dateStr?: string
  createdAt?: number
}): Promise<{ success: boolean }> {
  const key = getExpenseSyncKey(expense)
  const updatedPending = getPendingExpenses().filter((e) => getExpenseSyncKey(e) !== key)
  savePendingQueue(PENDING_EXPENSES_KEY, updatedPending)

  const ok = await postToScript({
    action: 'deleteExpense',
    expense,
  })
  return { success: ok }
}

/**
 * ส่งสินค้าที่เพิ่ม/แก้ไขไปบันทึกลง Google Sheets พร้อมคิวออฟไลน์
 */
export async function syncProductToGoogleSheet(product: Product): Promise<PostScriptResponse> {
  const pending = getPendingProducts().filter((p) => p.barcode !== product.barcode)
  pending.push(product)
  savePendingQueue(PENDING_PRODUCTS_KEY, pending)

  const res = await postToScriptWithResponse({
    action: 'saveProduct',
    product,
  })

  if (res.success) {
    const updated = getPendingProducts().filter((p) => p.barcode !== product.barcode)
    savePendingQueue(PENDING_PRODUCTS_KEY, updated)
    return { success: true }
  }

  schedulePendingSyncRetry()
  return res
}

export async function syncCategoriesToGoogleSheet(categories: string[]) {
  await postToScript({
    action: 'saveCategories',
    categories,
  })
}

export async function deleteProductFromGoogleSheet(barcode: string) {
  const updatedPending = getPendingProducts().filter((p) => p.barcode !== barcode)
  savePendingQueue(PENDING_PRODUCTS_KEY, updatedPending)

  await postToScript({
    action: 'deleteProduct',
    barcode,
  })
}

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

export async function clearDataFromGoogleSheet(
  period: 'today' | 'month' | 'all',
  dateStr: string,
  monthStr: string
): Promise<{ success: boolean }> {
  if (period === 'all') {
    savePendingQueue(PENDING_ORDERS_KEY, [])
    savePendingQueue(PENDING_EXPENSES_KEY, [])
  }
  const ok = await postToScript({
    action: 'clearData',
    period,
    dateStr,
    monthStr,
  })
  return { success: ok }
}

export async function deleteSingleOrderFromGoogleSheet(
  order: { orderNo: string; items?: unknown[]; dateStr?: string },
  restock: boolean = true
): Promise<{ success: boolean }> {
  const remaining = getPendingOrders().filter((o) => o.orderNo !== order.orderNo)
  savePendingQueue(PENDING_ORDERS_KEY, remaining)

  const ok = await postToScript({
    action: 'deleteSingleOrder',
    orderNo: order.orderNo,
    items: (order.items || []).map((it: any) => ({
      name: it?.name || '',
      barcode: it?.barcode || '',
      quantity: Number(it?.quantity) || 0,
    })),
    restock,
    dateStr: order.dateStr || '',
  })
  return { success: ok }
}
