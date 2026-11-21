import { formatShortDayMonth, getLocalIsoDate } from './dateHelper'
import type {
  AnalyticsReport,
  CategoryAnalyticsItem,
  Expense,
  FinancialSummary,
  PaymentAnalyticsItem,
  PeriodLocationSummary,
  Product,
  ProductAnalyticsItem,
  SaleOrder,
} from '../types'

export const UNNAMED_LOCATION_KEY = '__UNNAMED__'
export const UNNAMED_LOCATION_LABEL = 'ไม่ระบุทำเล (รวม)'

export function normalizeLocation(location?: string | null): string {
  return (location || '').trim()
}

export function getOrderMonthStr(order: Pick<SaleOrder, 'monthStr' | 'dateStr'>): string {
  if (order.monthStr && /^\d{4}-\d{2}$/.test(order.monthStr)) return order.monthStr
  return order.dateStr ? order.dateStr.slice(0, 7) : ''
}

export function getExpenseMonthStr(expense: Pick<Expense, 'monthStr' | 'dateStr'>): string {
  if (expense.monthStr && /^\d{4}-\d{2}$/.test(expense.monthStr)) return expense.monthStr
  return expense.dateStr ? expense.dateStr.slice(0, 7) : ''
}

/**
 * คำนวณสรุปตัวเลขทางการเงินจากชุดบิลขายและรายจ่าย
 * คงกฎ BS-08: บิลไทยช่วยไทยคิดยอดขายรวมและกำไรจากยอดเต็ม 100% (totalAmount / profit)
 */
export function calculateFinancialSummary(
  orders: SaleOrder[],
  expenses: Expense[]
): FinancialSummary {
  const totalRevenue = orders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)
  const totalCost = orders.reduce((sum, o) => sum + (Number(o.totalCost) || 0), 0)
  const grossProfit = totalRevenue - totalCost
  const totalExpenses = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0)
  const netProfit = grossProfit - totalExpenses

  return {
    totalRevenue,
    totalCost,
    grossProfit,
    totalExpenses,
    netProfit,
    orderCount: orders.length,
  }
}

/**
 * จัดกลุ่มรายการในแต่ละช่วงเวลา (วัน หรือ เดือน) ตามทำเลร้านค้า:
 * - หากมีมากกว่า 1 ร้าน/ทำเล แยกแสดงเป็นการ์ดคนละใบ และเรียงตามชื่อสถานที่ตั้ง
 * - รายการที่ไม่ได้กรอกทำเล (location ว่าง) จะนับยอดรวมเข้าด้วยกันในกลุ่มเดียว
 */
function groupPeriodRecordsByLocation(
  periodKey: string,
  periodOrders: SaleOrder[],
  periodExpenses: Expense[]
): PeriodLocationSummary[] {
  const bucketMap = new Map<string, { orders: SaleOrder[]; expenses: Expense[] }>()

  const getOrCreateBucket = (locKey: string) => {
    let bucket = bucketMap.get(locKey)
    if (!bucket) {
      bucket = { orders: [], expenses: [] }
      bucketMap.set(locKey, bucket)
    }
    return bucket
  }

  for (const order of periodOrders) {
    getOrCreateBucket(normalizeLocation(order.location)).orders.push(order)
  }
  for (const expense of periodExpenses) {
    getOrCreateBucket(normalizeLocation(expense.location)).expenses.push(expense)
  }

  const locationKeys = Array.from(bucketMap.keys())
  const isMultiLocation = locationKeys.length > 1

  // เรียงตามชื่อสถานที่ตั้ง (ไทย/อังกฤษ) โดยนำทำเลที่มีชื่อขึ้นก่อน และกลุ่มที่ไม่ระบุทำเลไว้ท้ายสุด
  locationKeys.sort((a, b) => {
    if (a === '' && b !== '') return 1
    if (a !== '' && b === '') return -1
    return a.localeCompare(b, 'th')
  })

  return locationKeys.map((locKey) => {
    const bucket = bucketMap.get(locKey)!
    const sortedOrders = [...bucket.orders].sort((a, b) => b.createdAt - a.createdAt)
    const sortedExpenses = [...bucket.expenses].sort((a, b) => b.createdAt - a.createdAt)

    return {
      id: `${periodKey}__${locKey || UNNAMED_LOCATION_KEY}`,
      periodKey,
      location: locKey,
      locationLabel: locKey || (isMultiLocation ? UNNAMED_LOCATION_LABEL : ''),
      isMultiLocationInPeriod: isMultiLocation,
      orders: sortedOrders,
      expenses: sortedExpenses,
      summary: calculateFinancialSummary(sortedOrders, sortedExpenses),
    }
  })
}

/**
 * สร้างการ์ดรายวันของเดือนที่เลือก (เรียงจากวันล่าสุดลงล่าง และแยกตามทำเลเมื่อมีหลายร้านในวันนั้น)
 */
export function buildMonthDailyGroups(
  orders: SaleOrder[],
  expenses: Expense[],
  targetMonthStr: string
): PeriodLocationSummary[] {
  const dayKeys = new Set<string>()
  const ordersByDay = new Map<string, SaleOrder[]>()
  const expensesByDay = new Map<string, Expense[]>()

  for (const o of orders) {
    if (getOrderMonthStr(o) !== targetMonthStr || !o.dateStr) continue
    dayKeys.add(o.dateStr)
    const list = ordersByDay.get(o.dateStr) || []
    list.push(o)
    ordersByDay.set(o.dateStr, list)
  }

  for (const e of expenses) {
    if (getExpenseMonthStr(e) !== targetMonthStr || !e.dateStr) continue
    dayKeys.add(e.dateStr)
    const list = expensesByDay.get(e.dateStr) || []
    list.push(e)
    expensesByDay.set(e.dateStr, list)
  }

  const sortedDays = Array.from(dayKeys).sort((a, b) => b.localeCompare(a))
  const result: PeriodLocationSummary[] = []

  for (const dayStr of sortedDays) {
    const groups = groupPeriodRecordsByLocation(
      dayStr,
      ordersByDay.get(dayStr) || [],
      expensesByDay.get(dayStr) || []
    )
    result.push(...groups)
  }

  return result
}

/**
 * สร้างการ์ดรายเดือนของปีที่เลือก (เรียงจากเดือนล่าสุดลงล่าง และแยกตามทำเลเมื่อมีหลายร้านในเดือนนั้น)
 */
export function buildYearMonthlyGroups(
  orders: SaleOrder[],
  expenses: Expense[],
  targetYearStr: string
): PeriodLocationSummary[] {
  const monthKeys = new Set<string>()
  const ordersByMonth = new Map<string, SaleOrder[]>()
  const expensesByMonth = new Map<string, Expense[]>()
  const yearPrefix = `${targetYearStr}-`

  for (const o of orders) {
    const mStr = getOrderMonthStr(o)
    if (!mStr.startsWith(yearPrefix)) continue
    monthKeys.add(mStr)
    const list = ordersByMonth.get(mStr) || []
    list.push(o)
    ordersByMonth.set(mStr, list)
  }

  for (const e of expenses) {
    const mStr = getExpenseMonthStr(e)
    if (!mStr.startsWith(yearPrefix)) continue
    monthKeys.add(mStr)
    const list = expensesByMonth.get(mStr) || []
    list.push(e)
    expensesByMonth.set(mStr, list)
  }

  const sortedMonths = Array.from(monthKeys).sort((a, b) => b.localeCompare(a))
  const result: PeriodLocationSummary[] = []

  for (const monthStr of sortedMonths) {
    const groups = groupPeriodRecordsByLocation(
      monthStr,
      ordersByMonth.get(monthStr) || [],
      expensesByMonth.get(monthStr) || []
    )
    result.push(...groups)
  }

  return result
}

/**
 * วิเคราะห์ข้อมูลการขายตามช่วงเวลาและทำเล (สินค้าประเภทไหนขายดีที่สุด + Top สินค้า + ช่องทางชำระเงิน)
 */
export function computeAnalytics(
  orders: SaleOrder[],
  expenses: Expense[],
  products: Product[],
  options: {
    period: 'today' | 'month' | 'year'
    todayStr: string
    locationFilter?: string // 'ALL' | UNNAMED_LOCATION_KEY | location name
    sortBy?: 'quantity' | 'revenue'
  }
): AnalyticsReport {
  const { period, todayStr, locationFilter = 'ALL', sortBy = 'quantity' } = options
  const normalizedLocationFilter =
    locationFilter === 'ALL' || locationFilter === UNNAMED_LOCATION_KEY
      ? locationFilter
      : normalizeLocation(locationFilter)
  const monthStr = todayStr.slice(0, 7)
  const yearPrefix = `${todayStr.slice(0, 4)}-`

  const matchesPeriod = (dateStr: string, mStr: string) => {
    if (period === 'today') return dateStr === todayStr
    if (period === 'month') return mStr === monthStr
    return mStr.startsWith(yearPrefix)
  }

  const periodOrders = orders.filter((o) => matchesPeriod(o.dateStr, getOrderMonthStr(o)))
  const periodExpenses = expenses.filter((e) => matchesPeriod(e.dateStr, getExpenseMonthStr(e)))

  // รวบรวมรายชื่อทำเลทั้งหมดที่มีในช่วงเวลานั้นสำหรับ Dropdown ตัวกรอง
  const namedLocationSet = new Set<string>()
  let hasUnnamedRecords = false

  for (const o of periodOrders) {
    const loc = normalizeLocation(o.location)
    if (loc) namedLocationSet.add(loc)
    else hasUnnamedRecords = true
  }
  for (const e of periodExpenses) {
    const loc = normalizeLocation(e.location)
    if (loc) namedLocationSet.add(loc)
    else hasUnnamedRecords = true
  }

  const availableLocations = Array.from(namedLocationSet).sort((a, b) => a.localeCompare(b, 'th'))

  const matchesLocation = (loc?: string) => {
    if (normalizedLocationFilter === 'ALL') return true
    const norm = normalizeLocation(loc)
    if (normalizedLocationFilter === UNNAMED_LOCATION_KEY) return norm === ''
    return norm === normalizedLocationFilter
  }

  const scopedOrders = periodOrders.filter((o) => matchesLocation(o.location))
  const scopedExpenses = periodExpenses.filter((e) => matchesLocation(e.location))

  // ดัชนีช่วยจับคู่หมวดหมู่และต้นทุนสินค้าจากคลัง
  const productByBarcode = new Map<string, Product>()
  const productByName = new Map<string, Product>()
  for (const p of products) {
    if (p.barcode) productByBarcode.set(p.barcode.trim(), p)
    if (p.name) productByName.set(p.name.trim(), p)
  }

  const categoryMap = new Map<
    string,
    { quantity: number; revenue: number; cost: number; orderNos: Set<string> }
  >()
  const productMap = new Map<string, ProductAnalyticsItem>()

  let totalUnitsSold = 0
  let totalItemRevenue = 0

  for (const order of scopedOrders) {
    for (const item of order.items || []) {
      const qty = Math.max(0, Number(item.quantity) || 0)
      if (qty === 0) continue

      const matchedProd =
        (item.barcode ? productByBarcode.get(item.barcode.trim()) : undefined) ||
        (item.name ? productByName.get(item.name.trim()) : undefined)

      const category = matchedProd?.category || 'อื่นๆ'
      const regularPrice = Number(item.price) || matchedProd?.price || 0
      const disc = Math.max(0, Number(item.discount) || 0)
      const revenue =
        item.subtotal != null && !isNaN(Number(item.subtotal))
          ? Number(item.subtotal)
          : Math.max(0, regularPrice - disc) * qty
      const unitCost = Number(item.cost) || matchedProd?.cost || 0
      const itemCost = unitCost * qty

      totalUnitsSold += qty
      totalItemRevenue += revenue

      // รวมยอดตามหมวดหมู่สินค้า
      const catEntry = categoryMap.get(category) || {
        quantity: 0,
        revenue: 0,
        cost: 0,
        orderNos: new Set<string>(),
      }
      catEntry.quantity += qty
      catEntry.revenue += revenue
      catEntry.cost += itemCost
      catEntry.orderNos.add(order.orderNo)
      categoryMap.set(category, catEntry)

      // รวมยอดตามรายการสินค้า (ใช้บาร์โค้ดจากคลังที่จับคู่ได้ก่อน เพื่อรวมบิลเก่าและใหม่เป็นสินค้าตัวเดียวกัน)
      const pKey = (matchedProd?.barcode || item.barcode || item.name || '').trim()
      if (pKey) {
        const existingProd = productMap.get(pKey) || {
          key: pKey,
          barcode: matchedProd?.barcode || item.barcode || '',
          name: item.name || matchedProd?.name || 'ไม่ระบุชื่อ',
          category,
          quantity: 0,
          revenue: 0,
          profit: 0,
        }
        existingProd.quantity += qty
        existingProd.revenue += revenue
        existingProd.profit += revenue - itemCost
        productMap.set(pKey, existingProd)
      }
    }
  }

  const topCategories: CategoryAnalyticsItem[] = Array.from(categoryMap.entries())
    .map(([category, val]) => ({
      category,
      quantity: val.quantity,
      revenue: val.revenue,
      cost: val.cost,
      profit: val.revenue - val.cost,
      orderCount: val.orderNos.size,
      quantitySharePct: totalUnitsSold > 0 ? Math.round((val.quantity / totalUnitsSold) * 1000) / 10 : 0,
      revenueSharePct: totalItemRevenue > 0 ? Math.round((val.revenue / totalItemRevenue) * 1000) / 10 : 0,
    }))
    .sort((a, b) =>
      sortBy === 'revenue'
        ? b.revenue - a.revenue || b.quantity - a.quantity
        : b.quantity - a.quantity || b.revenue - a.revenue
    )

  const topProducts: ProductAnalyticsItem[] = Array.from(productMap.values())
    .sort((a, b) =>
      sortBy === 'revenue'
        ? b.revenue - a.revenue || b.quantity - a.quantity
        : b.quantity - a.quantity || b.revenue - a.revenue
    )
    .slice(0, 10)

  // สรุปช่องทางการชำระเงิน
  const paymentBuckets: Record<
    'CASH' | 'PROMPTPAY' | 'THAI_CHUEY_THAI',
    { label: string; count: number; totalOrderAmount: number; customerPaidAmount: number }
  > = {
    CASH: { label: 'เงินสด', count: 0, totalOrderAmount: 0, customerPaidAmount: 0 },
    PROMPTPAY: { label: 'PromptPay', count: 0, totalOrderAmount: 0, customerPaidAmount: 0 },
    THAI_CHUEY_THAI: { label: 'ไทยช่วยไทย (40%)', count: 0, totalOrderAmount: 0, customerPaidAmount: 0 },
  }

  for (const order of scopedOrders) {
    const isThaiHelp =
      order.paymentMethod === 'THAI_CHUEY_THAI' ||
      (order.cashReceived > 0 && Math.abs(order.cashReceived - order.totalAmount * 0.4) < 0.01)

    const methodKey: 'CASH' | 'PROMPTPAY' | 'THAI_CHUEY_THAI' = isThaiHelp
      ? 'THAI_CHUEY_THAI'
      : order.paymentMethod === 'CASH'
      ? 'CASH'
      : 'PROMPTPAY'

    const bucket = paymentBuckets[methodKey]
    bucket.count += 1
    bucket.totalOrderAmount += Number(order.totalAmount) || 0
    bucket.customerPaidAmount += isThaiHelp
      ? Math.round((Number(order.totalAmount) || 0) * 0.4 * 100) / 100
      : Number(order.totalAmount) || 0
  }

  const totalOrdersCount = scopedOrders.length
  const paymentBreakdown: PaymentAnalyticsItem[] = (
    ['CASH', 'PROMPTPAY', 'THAI_CHUEY_THAI'] as const
  )
    .map((method) => {
      const b = paymentBuckets[method]
      return {
        method,
        label: b.label,
        count: b.count,
        totalOrderAmount: b.totalOrderAmount,
        customerPaidAmount: b.customerPaidAmount,
        sharePct: totalOrdersCount > 0 ? Math.round((b.count / totalOrdersCount) * 1000) / 10 : 0,
      }
    })
    .filter((item) => item.count > 0)

  return {
    summary: calculateFinancialSummary(scopedOrders, scopedExpenses),
    totalUnitsSold,
    availableLocations,
    hasUnnamedRecords,
    topCategories,
    topProducts,
    paymentBreakdown,
  }
}

export interface DailyCardSummary {
  dateStr: string
  shortDateLabel: string
  orders: SaleOrder[]
  expenses: Expense[]
  summary: FinancialSummary
}

function resolveRecordDateStr(dateStr: string | undefined, createdAt: number): string {
  if (dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr
  return Number.isFinite(createdAt) ? getLocalIsoDate(new Date(createdAt)) : ''
}

/**
 * สรุปข้อมูลรายวัน (DD/MM) ภายในเดือนที่เลือก สำหรับแสดงเป็นการ์ดรายวันในแท็บ "ปีนี้"
 */
export function buildDailySummariesInMonth(
  orders: SaleOrder[],
  expenses: Expense[]
): DailyCardSummary[] {
  const bucketMap = new Map<string, { orders: SaleOrder[]; expenses: Expense[] }>()

  const getBucket = (dateKey: string) => {
    const existing = bucketMap.get(dateKey)
    if (existing) return existing
    const fresh = { orders: [] as SaleOrder[], expenses: [] as Expense[] }
    bucketMap.set(dateKey, fresh)
    return fresh
  }

  for (const order of orders) {
    const dateKey = resolveRecordDateStr(order.dateStr, order.createdAt)
    if (!dateKey) continue
    getBucket(dateKey).orders.push(order)
  }

  for (const expense of expenses) {
    const dateKey = resolveRecordDateStr(expense.dateStr, expense.createdAt)
    if (!dateKey) continue
    getBucket(dateKey).expenses.push(expense)
  }

  return Array.from(bucketMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([dateStr, bucket]) => ({
      dateStr,
      shortDateLabel: formatShortDayMonth(dateStr),
      orders: bucket.orders,
      expenses: bucket.expenses,
      summary: calculateFinancialSummary(bucket.orders, bucket.expenses),
    }))
}
