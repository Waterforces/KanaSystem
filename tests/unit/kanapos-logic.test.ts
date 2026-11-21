import test from 'node:test'
import assert from 'node:assert/strict'
import { getLocalIsoDate, formatThaiDate, formatThaiMonth, formatShortDayMonth } from '../../src/utils/dateHelper'
import { resolveLocationForDate, msUntilNextMidnight } from '../../src/utils/shopLocation'
import { parseStoredThemeMode, resolveIsDark } from '../../src/utils/theme'
import {
  buildMonthDailyGroups,
  buildYearMonthlyGroups,
  buildDailySummariesInMonth,
  computeAnalytics,
  UNNAMED_LOCATION_KEY,
  UNNAMED_LOCATION_LABEL,
} from '../../src/utils/dataAnalytics'
import { parseScriptPostResponse, getExpenseSyncKey } from '../../src/utils/googleSheetSync'
import type { Expense, Product, SaleOrder } from '../../src/types/index'

const sampleProducts: Product[] = [
  {
    id: 1,
    barcode: 'KN-1001',
    name: 'อเมริกาโน่',
    price: 55,
    cost: 20,
    stock: 50,
    category: 'เครื่องดื่ม',
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 2,
    barcode: 'KN-1002',
    name: 'ครัวซองต์',
    price: 65,
    cost: 30,
    stock: 20,
    category: 'เบเกอรี่ & ขนม',
    createdAt: 1000,
    updatedAt: 1000,
  },
  {
    id: 3,
    barcode: 'KN-1003',
    name: 'แซนด์วิช',
    price: 45,
    cost: 20,
    stock: 15,
    category: 'อาหาร',
    createdAt: 1000,
    updatedAt: 1000,
  },
]

test('dateHelper formats local ISO dates and Thai dates/months accurately', () => {
  const dt = new Date(2026, 10, 21, 23, 55, 0) // 2026-11-21 local
  assert.equal(getLocalIsoDate(dt), '2026-11-21')
  assert.equal(formatThaiDate('2026-11-21'), '21 พ.ย. 2569')
  assert.equal(formatThaiMonth('2026-11'), 'พฤศจิกายน 2569')
})

test('shopLocation resets automatically across midnight (00:00)', () => {
  // Same day -> keeps trimmed location
  assert.deepEqual(
    resolveLocationForDate(' ตลาดนัด A ', '2026-11-21', '2026-11-21'),
    { location: 'ตลาดนัด A', expired: false }
  )

  // Midnight crossed -> expired and cleared
  assert.deepEqual(
    resolveLocationForDate('ตลาดนัด A', '2026-11-21', '2026-11-22'),
    { location: '', expired: true }
  )

  // Missing savedDate -> expired and cleared
  assert.deepEqual(
    resolveLocationForDate('ตลาดนัด A', null, '2026-11-21'),
    { location: '', expired: true }
  )

  // Milliseconds until midnight from 23:59:00 is ~60 seconds
  const nearMidnight = new Date(2026, 10, 21, 23, 59, 0, 0)
  const ms = msUntilNextMidnight(nearMidnight)
  assert.ok(ms >= 60000 && ms <= 61000)
})

test('theme helpers resolve light/dark/system modes properly', () => {
  assert.equal(parseStoredThemeMode(null), 'system')
  assert.equal(parseStoredThemeMode('dark'), 'dark')
  assert.equal(parseStoredThemeMode('light'), 'light')
  assert.equal(parseStoredThemeMode('invalid'), 'system')

  assert.equal(resolveIsDark('system', true), true)
  assert.equal(resolveIsDark('system', false), false)
  assert.equal(resolveIsDark('dark', false), true)
  assert.equal(resolveIsDark('light', true), false)
})

test('buildMonthDailyGroups separates multi-location days sorted by name and combines unnamed records', () => {
  const orders: SaleOrder[] = [
    // Day 21: 2 named locations + unnamed
    {
      orderNo: 'ORD-1',
      items: [{ barcode: 'KN-1001', name: 'อเมริกาโน่', price: 55, cost: 20, quantity: 2, subtotal: 110 }],
      totalAmount: 110,
      totalCost: 40,
      profit: 70,
      cashReceived: 110,
      change: 0,
      paymentMethod: 'CASH',
      location: 'สาขา ข',
      createdAt: 1001,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-2',
      items: [{ barcode: 'KN-1002', name: 'ครัวซองต์', price: 65, cost: 30, quantity: 1, subtotal: 65 }],
      totalAmount: 65,
      totalCost: 30,
      profit: 35,
      cashReceived: 65,
      change: 0,
      paymentMethod: 'PROMPTPAY',
      location: 'สาขา ก',
      createdAt: 1002,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-3',
      items: [{ barcode: 'KN-1003', name: 'แซนด์วิช', price: 45, cost: 20, quantity: 1, subtotal: 45 }],
      totalAmount: 45,
      totalCost: 20,
      profit: 25,
      cashReceived: 45,
      change: 0,
      paymentMethod: 'CASH',
      location: '',
      createdAt: 1003,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
    // Day 20: all unnamed -> should combine into 1 card
    {
      orderNo: 'ORD-4',
      items: [{ barcode: 'KN-1001', name: 'อเมริกาโน่', price: 55, cost: 20, quantity: 1, subtotal: 55 }],
      totalAmount: 55,
      totalCost: 20,
      profit: 35,
      cashReceived: 22, // Thai Chuey Thai 40%
      change: 0,
      paymentMethod: 'THAI_CHUEY_THAI',
      customerPaid: 22,
      location: '',
      createdAt: 901,
      dateStr: '2026-11-20',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-5',
      items: [{ barcode: 'KN-1002', name: 'ครัวซองต์', price: 65, cost: 30, quantity: 1, subtotal: 65 }],
      totalAmount: 65,
      totalCost: 30,
      profit: 35,
      cashReceived: 65,
      change: 0,
      paymentMethod: 'CASH',
      createdAt: 902,
      dateStr: '2026-11-20',
      monthStr: '2026-11',
    },
  ]

  const expenses: Expense[] = [
    {
      expenseNo: 'EXP-1',
      title: 'ค่าน้ำแข็ง',
      amount: 20,
      category: 'วัตถุดิบ',
      location: 'สาขา ก',
      createdAt: 1004,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
    {
      expenseNo: 'EXP-2',
      title: 'ค่าถุง',
      amount: 10,
      category: 'บรรจุภัณฑ์',
      location: '',
      createdAt: 905,
      dateStr: '2026-11-20',
      monthStr: '2026-11',
    },
  ]

  const groups = buildMonthDailyGroups(orders, expenses, '2026-11')

  // Day 21 has 3 groups sorted: สาขา ก, สาขา ข, ไม่ระบุทำเล (รวม); Day 20 has 1 combined card
  assert.equal(groups.length, 4)

  assert.equal(groups[0].periodKey, '2026-11-21')
  assert.equal(groups[0].locationLabel, 'สาขา ก')
  assert.equal(groups[0].summary.totalRevenue, 65)
  assert.equal(groups[0].summary.totalExpenses, 20)
  assert.equal(groups[0].summary.netProfit, 15) // 65 - 30 - 20

  assert.equal(groups[1].periodKey, '2026-11-21')
  assert.equal(groups[1].locationLabel, 'สาขา ข')
  assert.equal(groups[1].summary.totalRevenue, 110)
  assert.equal(groups[1].summary.totalExpenses, 0)
  assert.equal(groups[1].summary.netProfit, 70)

  assert.equal(groups[2].periodKey, '2026-11-21')
  assert.equal(groups[2].locationLabel, UNNAMED_LOCATION_LABEL)
  assert.equal(groups[2].summary.totalRevenue, 45)

  // Day 20 combined unnamed card uses full 100% revenue for Thai Chuey Thai (BS-08)
  assert.equal(groups[3].periodKey, '2026-11-20')
  assert.equal(groups[3].locationLabel, '')
  assert.equal(groups[3].isMultiLocationInPeriod, false)
  assert.equal(groups[3].summary.totalRevenue, 120)
  assert.equal(groups[3].summary.totalExpenses, 10)
  assert.equal(groups[3].summary.netProfit, 60) // (120 - 50) - 10
})

test('buildYearMonthlyGroups groups by month descending and separates multi-location months', () => {
  const orders: SaleOrder[] = [
    {
      orderNo: 'ORD-NOV-1',
      items: [],
      totalAmount: 100,
      totalCost: 40,
      profit: 60,
      cashReceived: 100,
      change: 0,
      paymentMethod: 'CASH',
      location: 'บูธ B',
      createdAt: 2000,
      dateStr: '2026-11-05',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-NOV-2',
      items: [],
      totalAmount: 200,
      totalCost: 80,
      profit: 120,
      cashReceived: 200,
      change: 0,
      paymentMethod: 'CASH',
      location: 'บูธ A',
      createdAt: 2001,
      dateStr: '2026-11-06',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-OCT-1',
      items: [],
      totalAmount: 300,
      totalCost: 100,
      profit: 200,
      cashReceived: 300,
      change: 0,
      paymentMethod: 'PROMPTPAY',
      createdAt: 1000,
      dateStr: '2026-10-15',
      monthStr: '2026-10',
    },
  ]

  const yearGroups = buildYearMonthlyGroups(orders, [], '2026')
  assert.equal(yearGroups.length, 3)
  assert.equal(yearGroups[0].periodKey, '2026-11')
  assert.equal(yearGroups[0].locationLabel, 'บูธ A')
  assert.equal(yearGroups[1].periodKey, '2026-11')
  assert.equal(yearGroups[1].locationLabel, 'บูธ B')
  assert.equal(yearGroups[2].periodKey, '2026-10')
  assert.equal(yearGroups[2].locationLabel, '')
})

test('computeAnalytics identifies top product category and filters by location', () => {
  const orders: SaleOrder[] = [
    {
      orderNo: 'ORD-A1',
      items: [
        { barcode: 'KN-1001', name: 'อเมริกาโน่', price: 55, cost: 20, quantity: 5, subtotal: 275 },
        { barcode: 'KN-1002', name: 'ครัวซองต์', price: 65, cost: 30, quantity: 2, subtotal: 130 },
      ],
      totalAmount: 405,
      totalCost: 160,
      profit: 245,
      cashReceived: 405,
      change: 0,
      paymentMethod: 'CASH',
      location: 'ร้าน 1',
      createdAt: 1000,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-A2',
      items: [
        { barcode: 'KN-1002', name: 'ครัวซองต์', price: 65, cost: 30, quantity: 6, subtotal: 390 },
      ],
      totalAmount: 390,
      totalCost: 180,
      profit: 210,
      cashReceived: 156,
      change: 0,
      paymentMethod: 'THAI_CHUEY_THAI',
      location: 'ร้าน 2',
      createdAt: 2000,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-A3',
      items: [
        { barcode: 'KN-1003', name: 'แซนด์วิช', price: 45, cost: 20, quantity: 1, subtotal: 45 },
      ],
      totalAmount: 45,
      totalCost: 20,
      profit: 25,
      cashReceived: 45,
      change: 0,
      paymentMethod: 'PROMPTPAY',
      location: '',
      createdAt: 3000,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
  ]

  const allReport = computeAnalytics(orders, [], sampleProducts, {
    period: 'month',
    todayStr: '2026-11-21',
    locationFilter: 'ALL',
  })

  assert.deepEqual(allReport.availableLocations, ['ร้าน 1', 'ร้าน 2'])
  assert.equal(allReport.hasUnnamedRecords, true)
  assert.equal(allReport.totalUnitsSold, 14)
  assert.equal(allReport.topCategories[0].category, 'เบเกอรี่ & ขนม')
  assert.equal(allReport.topCategories[0].quantity, 8)
  assert.equal(allReport.topCategories[0].revenue, 520)

  const loc1Report = computeAnalytics(orders, [], sampleProducts, {
    period: 'month',
    todayStr: '2026-11-21',
    locationFilter: 'ร้าน 1',
  })
  assert.equal(loc1Report.topCategories[0].category, 'เครื่องดื่ม')
  assert.equal(loc1Report.summary.totalRevenue, 405)

  const unnamedReport = computeAnalytics(orders, [], sampleProducts, {
    period: 'month',
    todayStr: '2026-11-21',
    locationFilter: UNNAMED_LOCATION_KEY,
  })
  assert.equal(unnamedReport.summary.totalRevenue, 45)
  assert.equal(unnamedReport.topCategories[0].category, 'อาหาร')
})

test('parseScriptPostResponse handles HTTP errors, HTML 200 pages, and GAS JSON outcomes', () => {
  const err429 = parseScriptPostResponse(false, 429, 'Too Many Requests')
  assert.equal(err429.success, false)
  assert.match(err429.message || '', /429/)

  const err500 = parseScriptPostResponse(false, 500, 'Internal Server Error')
  assert.equal(err500.success, false)

  const err503 = parseScriptPostResponse(false, 503, 'Service Unavailable')
  assert.equal(err503.success, false)

  const html200 = parseScriptPostResponse(true, 200, '<!DOCTYPE html><html><body>Google Script Error</body></html>')
  assert.equal(html200.success, false)

  const okJson = parseScriptPostResponse(true, 200, JSON.stringify({ status: 'success', duplicate: false }))
  assert.equal(okJson.success, true)

  const oosJson = parseScriptPostResponse(
    true,
    200,
    JSON.stringify({ status: 'error', errorType: 'OUT_OF_STOCK', message: 'สต็อกไม่พอ' })
  )
  assert.equal(oosJson.success, false)
  assert.equal(oosJson.errorType, 'OUT_OF_STOCK')
  assert.equal(oosJson.message, 'สต็อกไม่พอ')
})

test('getExpenseSyncKey prioritizes expenseNo and stays independent of ms createdAt drift', () => {
  const keyWithIdA = getExpenseSyncKey({
    expenseNo: '  EXP-20261121-101010-AB12CD  ',
    title: 'ค่าน้ำแข็ง',
    dateStr: '2026-11-21',
    amount: 45,
  })
  const keyWithIdB = getExpenseSyncKey({
    expenseNo: 'EXP-20261121-101010-AB12CD',
    title: 'ค่าน้ำแข็ง (อัปเดต)',
    dateStr: '2026-11-21',
    amount: 50,
  })
  const keyDifferentExpenseSameTitle = getExpenseSyncKey({
    expenseNo: 'EXP-20261121-102000-ZZ9999',
    title: 'ค่าน้ำแข็ง',
    dateStr: '2026-11-21',
    amount: 45,
  })
  assert.equal(keyWithIdA, keyWithIdB)
  assert.notEqual(keyWithIdA, keyDifferentExpenseSameTitle)
  assert.ok(keyWithIdA.includes('EXP-20261121-101010-AB12CD'))

  const legacyA = getExpenseSyncKey({
    title: '  ค่าไฟตลาดนัด  ',
    dateStr: '2026-11-21',
    amount: 120.5,
  })
  const legacyB = getExpenseSyncKey({
    title: 'ค่าไฟตลาดนัด',
    dateStr: '2026-11-21',
    amount: 120.5,
  })
  assert.equal(legacyA, legacyB)
  assert.notEqual(legacyA, keyWithIdA)
})

test('computeAnalytics sorts topProducts by revenue before slicing top 10 and merges barcode + name-only lines', () => {
  const catalog: Product[] = Array.from({ length: 12 }, (_, idx) => ({
    id: idx + 1,
    barcode: `P-${String(idx + 1).padStart(2, '0')}`,
    name: `สินค้า ${idx + 1}`,
    price: idx === 11 ? 5000 : 10,
    cost: 5,
    stock: 100,
    category: 'ทั่วไป',
    createdAt: 1000,
    updatedAt: 1000,
  }))

  // 11 cheap high-quantity items (qty 5..15, rev 50..150) + 1 expensive low-qty item (qty 1, rev 5000)
  const bulkItems = catalog.slice(0, 11).map((p, i) => ({
    barcode: p.barcode,
    name: p.name,
    price: p.price,
    cost: p.cost,
    quantity: 5 + i,
    subtotal: (5 + i) * p.price,
  }))

  const orders: SaleOrder[] = [
    {
      orderNo: 'ORD-TOP-1',
      items: [
        ...bulkItems,
        { barcode: catalog[11].barcode, name: catalog[11].name, price: 5000, cost: 2000, quantity: 1, subtotal: 5000 },
      ],
      totalAmount: 6100,
      totalCost: 2550,
      profit: 3550,
      cashReceived: 6100,
      change: 0,
      paymentMethod: 'CASH',
      createdAt: 1000,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
    // Second order buys P-01 without barcode (legacy name-only line)
    {
      orderNo: 'ORD-TOP-2',
      items: [
        { barcode: '', name: 'สินค้า 1', price: 10, cost: 5, quantity: 3, subtotal: 30 },
      ],
      totalAmount: 30,
      totalCost: 15,
      profit: 15,
      cashReceived: 30,
      change: 0,
      paymentMethod: 'CASH',
      createdAt: 2000,
      dateStr: '2026-11-21',
      monthStr: '2026-11',
    },
  ]

  const byRevenue = computeAnalytics(orders, [], catalog, {
    period: 'month',
    todayStr: '2026-11-21',
    locationFilter: 'ALL',
    sortBy: 'revenue',
  })

  assert.equal(byRevenue.topProducts.length, 10)
  assert.equal(byRevenue.topProducts[0].name, 'สินค้า 12')
  assert.equal(byRevenue.topProducts[0].revenue, 5000)

  const byQty = computeAnalytics(orders, [], catalog, {
    period: 'month',
    todayStr: '2026-11-21',
    locationFilter: 'ALL',
    sortBy: 'quantity',
  })
  // P-01 had qty 5 (with barcode) + qty 3 (name-only) = 8 merged cleanly, never duplicated
  const mergedP1 = byQty.topProducts.filter((p) => p.name === 'สินค้า 1')
  assert.equal(mergedP1.length, 1)
  assert.equal(mergedP1[0].quantity, 8)
})

test('formatShortDayMonth and buildDailySummariesInMonth group month bills into DD/MM cards sorted descending', () => {
  assert.equal(formatShortDayMonth('2026-11-20'), '20/11')
  assert.equal(formatShortDayMonth('2026-01-05'), '05/01')

  const orders: SaleOrder[] = [
    {
      orderNo: 'ORD-D18',
      items: [],
      totalAmount: 200,
      totalCost: 80,
      profit: 120,
      cashReceived: 80,
      change: 0,
      paymentMethod: 'THAI_CHUEY_THAI',
      createdAt: new Date(2026, 10, 18, 12, 0).getTime(),
      dateStr: '2026-11-18',
      monthStr: '2026-11',
    },
    {
      orderNo: 'ORD-D20',
      items: [],
      totalAmount: 400,
      totalCost: 150,
      profit: 250,
      cashReceived: 400,
      change: 0,
      paymentMethod: 'PROMPTPAY',
      createdAt: new Date(2026, 10, 20, 14, 0).getTime(),
      dateStr: '2026-11-20',
      monthStr: '2026-11',
    },
  ]

  const expenses: Expense[] = [
    {
      expenseNo: 'EXP-D20',
      title: 'ค่าน้ำแข็ง',
      amount: 50,
      category: 'ทั่วไป',
      createdAt: new Date(2026, 10, 20, 15, 0).getTime(),
      dateStr: '2026-11-20',
      monthStr: '2026-11',
    },
    {
      expenseNo: 'EXP-D19-ONLY',
      title: 'ซื้อถุง',
      amount: 35,
      category: 'ทั่วไป',
      createdAt: new Date(2026, 10, 19, 10, 0).getTime(),
      dateStr: '2026-11-19',
      monthStr: '2026-11',
    },
  ]

  const daily = buildDailySummariesInMonth(orders, expenses)
  assert.equal(daily.length, 3)

  assert.equal(daily[0].dateStr, '2026-11-20')
  assert.equal(daily[0].shortDateLabel, '20/11')
  assert.equal(daily[0].summary.totalRevenue, 400)
  assert.equal(daily[0].summary.totalExpenses, 50)
  assert.equal(daily[0].summary.netProfit, 200)

  assert.equal(daily[1].dateStr, '2026-11-19')
  assert.equal(daily[1].shortDateLabel, '19/11')
  assert.equal(daily[1].summary.totalRevenue, 0)
  assert.equal(daily[1].summary.totalExpenses, 35)
  assert.equal(daily[1].summary.netProfit, -35)

  assert.equal(daily[2].dateStr, '2026-11-18')
  assert.equal(daily[2].shortDateLabel, '18/11')
  assert.equal(daily[2].summary.totalRevenue, 200)
  assert.equal(daily[2].summary.netProfit, 120)
})
