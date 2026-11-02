/**
 * ========================================================
 * 📊 pages/FinancePage.tsx - หน้าบัญชี รายรับ-รายจ่าย & ส่งออก Excel
 * ========================================================
 * คำนวณรายรับ รายจ่าย ต้นทุน กำไรสุทธิ และส่งออกเป็นไฟล์ Excel (.xlsx)
 * ตั้งชื่อไฟล์ตามรูปแบบ: DD-MM-YYYY.xlsx สำหรับเปิดบนคอมพิวเตอร์
 */

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  FileSpreadsheet,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Trash2,
  X,
  Receipt,
  Wallet,
  Share2,
  RefreshCw,
  CheckCircle2,
} from 'lucide-react'
import { db } from '../db/database'
import type { Expense, FinancialSummary, SaleOrder } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { exportFinancialReportToExcel } from '../utils/excelHelper'
import {
  syncExpenseToGoogleSheet,
  deleteExpenseFromGoogleSheet,
  syncAllDataFromGoogleSheet,
  clearDataFromGoogleSheet,
  deleteSingleOrderFromGoogleSheet,
  getLocalIsoDate,
} from '../utils/googleSheetSync'

export const FinancePage: React.FC = () => {
  const orders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray()) || []
  const expenses = useLiveQuery(() => db.expenses.orderBy('createdAt').reverse().toArray()) || []
  const products = useLiveQuery(() => db.products.toArray()) || []
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncModal, setSyncModal] = useState<{
    isOpen: boolean
    title: string
    timeStr: string
    productsCount?: number
    ordersCount?: number
    expensesCount?: number
  }>({
    isOpen: false,
    title: 'ซิงค์แล้ว',
    timeStr: '',
  })

  // ดึงข้อมูลล่าสุดจาก Google Sheets เสมอเมื่อเปิดเข้าหน้าบัญชี
  React.useEffect(() => {
    syncAllDataFromGoogleSheet().catch(() => {})
  }, [])

  // 🛡️ BS-07: อัปเดตวันที่และเดือนปัจจุบันแบบ Dynamic (รองรับกรณีเปิดหน้าเว็บค้างข้ามเที่ยงคืน)
  const [currentDateStr, setCurrentDateStr] = useState<string>(getLocalIsoDate())

  React.useEffect(() => {
    const updateDate = () => {
      const fresh = getLocalIsoDate()
      setCurrentDateStr(fresh)
    }
    window.addEventListener('focus', updateDate)
    const timer = setInterval(updateDate, 30000)
    return () => {
      window.removeEventListener('focus', updateDate)
      clearInterval(timer)
    }
  }, [])

  // การเลือกช่วงเวลา
  const todayStr = currentDateStr
  const currentMonthStr = todayStr.slice(0, 7)
  const [dateFilter, setDateFilter] = useState<'today' | 'month' | 'all'>('today')
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses'>('sales')
  const [deletingOrderNo, setDeletingOrderNo] = useState<string | null>(null)

  // สถานะโมดอลเพิ่มรายจ่าย
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)
  const [expenseTitle, setExpenseTitle] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState(
    SHOP_CONFIG.expenseCategories[0] || 'ซื้อวัตถุดิบ/สินค้าเข้าร้าน'
  )
  const [expenseNote, setExpenseNote] = useState('')

  // กรองบิลขายตามช่วงเวลา
  const filteredOrders = useMemo(() => {
    if (dateFilter === 'today') {
      return orders.filter((o) => o.dateStr === todayStr)
    } else if (dateFilter === 'month') {
      return orders.filter((o) => o.monthStr === currentMonthStr)
    }
    return orders
  }, [orders, dateFilter, todayStr, currentMonthStr])

  // กรองรายจ่ายตามช่วงเวลา
  const filteredExpenses = useMemo(() => {
    if (dateFilter === 'today') {
      return expenses.filter((e) => e.dateStr === todayStr)
    } else if (dateFilter === 'month') {
      return expenses.filter((e) => e.monthStr === currentMonthStr)
    }
    return expenses
  }, [expenses, dateFilter, todayStr, currentMonthStr])

  // สรุปตัวเลขทางการเงิน
  const summary: FinancialSummary = useMemo(() => {
    const totalRevenue = filteredOrders.reduce((sum, o) => sum + o.totalAmount, 0)
    const totalCost = filteredOrders.reduce((sum, o) => sum + o.totalCost, 0)
    const grossProfit = totalRevenue - totalCost
    const totalExp = filteredExpenses.reduce((sum, e) => sum + e.amount, 0)
    const netProfit = grossProfit - totalExp

    return {
      totalRevenue,
      totalCost,
      grossProfit,
      totalExpenses: totalExp,
      netProfit,
      orderCount: filteredOrders.length,
    }
  }, [filteredOrders, filteredExpenses])

  // บันทึกรายจ่ายใหม่
  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    const amountNum = parseFloat(expenseAmount) || 0
    if (!expenseTitle.trim() || amountNum <= 0) {
      alert('กรุณากรอกรายการและจำนวนเงินที่ถูกต้อง')
      return
    }

    const now = new Date()
    const dateStr = getLocalIsoDate(now)
    const monthStr = dateStr.slice(0, 7)

    const newExpense: Expense = {
      title: expenseTitle.trim(),
      amount: amountNum,
      category: expenseCategory,
      note: expenseNote.trim(),
      createdAt: now.getTime(),
      dateStr,
      monthStr,
    }

    await db.expenses.add(newExpense)
    syncExpenseToGoogleSheet(newExpense)
    setExpenseTitle('')
    setExpenseAmount('')
    setExpenseNote('')
    setIsAddExpenseOpen(false)
  }

  // ลบรายจ่าย
  const handleDeleteExpense = async (expense: Expense) => {
    if (!expense || !expense.id) return
    if (confirm(`คุณต้องการลบรายการรายจ่าย "${expense.title}" ใช่หรือไม่?`)) {
      await db.expenses.delete(expense.id)
      await deleteExpenseFromGoogleSheet(expense)
    }
  }

  // ซิงก์ข้อมูลทั้งหมดกับ Google Sheets
  const handleSyncWithSheet = async () => {
    setIsSyncing(true)
    try {
      const res = await syncAllDataFromGoogleSheet()
      const now = new Date()
      const timeStr = now.toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      })

      if (res.success) {
        setSyncModal({
          isOpen: true,
          title: 'ซิงค์แล้ว',
          timeStr: `เวลา ${timeStr} น.`,
          productsCount: res.productsCount,
          ordersCount: res.ordersCount,
          expensesCount: res.expensesCount,
        })
      } else {
        alert(`เชื่อมต่อ Google Sheets ไม่สำเร็จ: ${res.error}`)
      }
    } catch (e: any) {
      alert(e?.message || 'เกิดข้อผิดพลาดในการซิงก์')
    } finally {
      setIsSyncing(false)
    }
  }

  // ส่งออกรายงาน Excel (.xlsx) สำหรับเปิดบนคอมพิวเตอร์ (ชื่อไฟล์ DD-MM-YYYY.xlsx)
  const handleExportExcel = async () => {
    const filterLabel =
      dateFilter === 'today'
        ? `ประจำวัน (${todayStr})`
        : dateFilter === 'month'
        ? `ประจำเดือน (${currentMonthStr})`
        : 'ทั้งหมดตั้งแต่เปิดร้าน'

    await exportFinancialReportToExcel({
      summary,
      orders: filteredOrders,
      expenses: filteredExpenses,
      products,
      filterTitle: `รายงานรายรับ-รายจ่าย ${filterLabel}`,
      targetDate: dateFilter === 'today' ? todayStr : undefined,
    })
  }

  const [isClearing, setIsClearing] = useState(false)

  const periodLabel =
    dateFilter === 'today'
      ? 'วันนี้'
      : dateFilter === 'month'
      ? 'เดือนนี้'
      : 'ทั้งหมด'

  const periodClearLabel =
    dateFilter === 'today'
      ? 'ข้อมูลวันนี้'
      : dateFilter === 'month'
      ? 'ข้อมูลเดือนนี้'
      : 'ข้อมูลทั้งหมด'

  const handleDeleteSingleOrder = async (order: SaleOrder) => {
    const itemCount = (order.items || []).reduce((sum, item) => sum + item.quantity, 0)
    const isThaiHelp =
      order.paymentMethod === 'THAI_CHUEY_THAI' ||
      (order.cashReceived > 0 && Math.abs(order.cashReceived - (order.totalAmount * 0.4)) < 0.01)

    const confirmMsg =
      `⚠️ คุณต้องการยกเลิกบิล "${order.orderNo}" ใช่หรือไม่?\n\n` +
      `• ยอดรวม: ${isThaiHelp ? `${SHOP_CONFIG.currency}${(order.totalAmount * 0.4).toLocaleString()} (เต็ม ${SHOP_CONFIG.currency}${order.totalAmount.toLocaleString()})` : `${SHOP_CONFIG.currency}${order.totalAmount.toLocaleString()}`}\n` +
      `• ประเภท: ${isThaiHelp ? 'ไทยช่วยไทย' : order.paymentMethod === 'CASH' ? 'เงินสด' : 'PromptPay'}\n` +
      `• จำนวนสินค้า: ${itemCount} ชิ้น\n\n` +
      `🔄 ระบบจะทำการคืนสต็อกสินค้าทั้งหมดในบิลนี้กลับเข้าคลังอัตโนมัติ และลบบิลออกจากทั้งบนเว็บและ Google Sheets!`

    if (!confirm(confirmMsg)) return

    setDeletingOrderNo(order.orderNo)
    try {
      // 1. คืนสต็อกสินค้าในเครื่อง (IndexedDB) - BS-01: รองรับทั้ง barcode และ fallback ด้วยชื่อสินค้า
      if (order.items && order.items.length > 0) {
        for (const item of order.items) {
          if (!item.quantity) continue
          let prod = null
          if (item.barcode) {
            prod = await db.products.where('barcode').equals(item.barcode).first()
          }
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
      }

      // 2. ลบบิลออกจากเครื่อง (IndexedDB)
      if (order.id) {
        await db.orders.delete(order.id)
      } else {
        await db.orders.where('orderNo').equals(order.orderNo).delete()
      }

      // 3. ส่งคำสั่งไปลบบน Google Sheets พร้อมคืนสต็อกบน Google Sheets
      await deleteSingleOrderFromGoogleSheet(order, true)

      // 4. ซิงก์สต็อกล่าสุดกลับมาจาก Google Sheets เพื่อให้ข้อมูลสินค้าตรงกัน 100%
      await syncAllDataFromGoogleSheet()

      alert(`✅ ยกเลิกบิล ${order.orderNo} เรียบร้อยแล้ว (คืนสต็อกสินค้าเข้าคลังแล้ว)`)
    } catch (err: any) {
      console.error('Delete single order error:', err)
      alert(`เกิดข้อผิดพลาดในการยกเลิกบิล: ${err?.message || err}`)
    } finally {
      setDeletingOrderNo(null)
    }
  }

  const handleClearPeriodData = async () => {
    // 🛡️ BS-07: คำนวณวันที่และเดือนสดใหม่ ณ วินาทีที่กดปุ่ม เพื่อป้องกันกรณีเปิดเว็บข้ามเที่ยงคืน
    const liveTodayStr = getLocalIsoDate()
    const liveMonthStr = liveTodayStr.slice(0, 7)

    const orderCount = filteredOrders.length
    const expenseCount = filteredExpenses.length

    if (orderCount === 0 && expenseCount === 0) {
      alert(`ไม่มีข้อมูลบิลขายหรือรายจ่ายสำหรับช่วงเวลา "${periodLabel}"`)
      return
    }

    const cascadingDesc =
      dateFilter === 'all'
        ? '• ข้อมูลทั้งหมด: ล้างชีตรวมออเดอร์ทั้งหมด, ประจำเดือนทุกเดือน, ประจำวันทุกวัน และรายจ่ายทั้งหมด'
        : dateFilter === 'month'
        ? `• ข้อมูลเดือนนี้: ล้างชีตประจำเดือนนี้, ทุกชีตประจำวันในเดือนนี้ และตัดยอดออกจากชีตรวมทั้งหมด`
        : `• ข้อมูลวันนี้: ล้างชีตประจำวันนี้ และตัดยอดออกจากชีตเดือนและชีตรวมทั้งหมด`

    const confirmMsg =
      `⚠️ คุณแน่ใจหรือไม่ว่าต้องการล้าง "${periodClearLabel}"?\n\n` +
      `${cascadingDesc}\n\n` +
      `• บิลขายที่จะถูกลบ: ${orderCount} บิล\n` +
      `• รายจ่ายที่จะถูกลบ: ${expenseCount} รายการ\n\n` +
      `การดำเนินการนี้จะล้างข้อมูลทั้งบนเว็บและบน Google Sheets!`

    if (!confirm(confirmMsg)) return

    if (dateFilter === 'all') {
      const typed = prompt(
        '⚠️ คุณกำลังจะล้างข้อมูลบิลขายและรายจ่ายทั้งหมดตั้งแต่เปิดร้าน!\nกรุณาพิมพ์คำว่า "CLEAR" ตัวพิมพ์ใหญ่เพื่อยืนยัน:'
      )
      if (typed !== 'CLEAR') {
        if (typed !== null) alert('คำยืนยันไม่ถูกต้อง ยกเลิกการล้างข้อมูล')
        return
      }
    }

    setIsClearing(true)
    try {
      // 1. ลบข้อมูลในเครื่อง (IndexedDB) ตามลำดับชั้น Cascading
      if (dateFilter === 'today') {
        const orderIds = filteredOrders.map((o) => o.id).filter(Boolean) as number[]
        const expenseIds = filteredExpenses.map((e) => e.id).filter(Boolean) as number[]
        if (orderIds.length > 0) await db.orders.bulkDelete(orderIds)
        if (expenseIds.length > 0) await db.expenses.bulkDelete(expenseIds)
      } else if (dateFilter === 'month') {
        // ลบออเดอร์และรายจ่ายของทุกวันในเดือนนี้ออกจากเครื่อง
        const allOrders = await db.orders.toArray()
        const monthOrderIds = allOrders
          .filter((o) => o.monthStr === liveMonthStr || (o.dateStr && o.dateStr.startsWith(liveMonthStr)))
          .map((o) => o.id)
          .filter(Boolean) as number[]
        if (monthOrderIds.length > 0) await db.orders.bulkDelete(monthOrderIds)

        const allExpenses = await db.expenses.toArray()
        const monthExpIds = allExpenses
          .filter((e) => e.monthStr === liveMonthStr || (e.dateStr && e.dateStr.startsWith(liveMonthStr)))
          .map((e) => e.id)
          .filter(Boolean) as number[]
        if (monthExpIds.length > 0) await db.expenses.bulkDelete(monthExpIds)
      } else {
        await db.orders.clear()
        await db.expenses.clear()
      }

      // 2. ส่งคำสั่งไปล้างแถวข้อมูลบน Google Sheets (ตามลำดับชั้น Cascading)
      await clearDataFromGoogleSheet(dateFilter, liveTodayStr, liveMonthStr)

      alert(`✅ ล้าง${periodClearLabel} เรียบร้อยแล้ว ทั้งบนเว็บและบน Google Sheets`)
    } catch (err: any) {
      console.error('Clear data error:', err)
      alert(`เกิดข้อผิดพลาดในการล้างข้อมูล: ${err?.message || err}`)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 pb-20 overflow-hidden">
      {/* ส่วนหัวหน้าจอ */}
      <header className="bg-white border-b border-slate-200 px-4 pb-3 safe-top shrink-0 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              บัญชี & กำไร
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              ส่งออก Excel ไปเปิดบนคอมพิวเตอร์
            </p>
          </div>

          {/* ปุ่มส่งออก Excel (ปุ่มสีเขียวโดดเด่น) */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSyncWithSheet}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-all disabled:opacity-50"
              title="ดึงยอดขายและรายจ่ายล่าสุดจาก Google Sheets"
            >
              <RefreshCw size={14} className={isSyncing ? 'animate-spin text-emerald-600' : ''} />
              <span>{isSyncing ? 'กำลังซิงก์...' : 'ซิงก์ชีต'}</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all"
              title="ส่งออกไฟล์ Excel (.xlsx) ไปเปิดบนคอมพิวเตอร์"
            >
              <FileSpreadsheet size={17} />
              <span>โหลด Excel</span>
            </button>
          </div>
        </div>

        {/* ปุ่มเลือกช่วงเวลา: วันนี้ / เดือนนี้ / ทั้งหมด */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setDateFilter('today')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              dateFilter === 'today'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            วันนี้
          </button>
          <button
            onClick={() => setDateFilter('month')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              dateFilter === 'month'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            เดือนนี้
          </button>
          <button
            onClick={() => setDateFilter('all')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              dateFilter === 'all'
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            ทั้งหมด
          </button>
        </div>

        {/* แถบระบุช่วงเวลา พร้อมปุ่ม Clear Data สำหรับ วัน / เดือน / ทั้งหมด */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-slate-500 font-medium truncate pr-2">
            ช่วงเวลา: <strong className="text-slate-800 font-bold">{periodLabel}</strong>
            <span className="text-[10px] text-slate-400 ml-1">
              ({filteredOrders.length} บิล, {filteredExpenses.length} รายจ่าย)
            </span>
          </span>

          <button
            onClick={handleClearPeriodData}
            disabled={isClearing}
            className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 rounded-lg text-[11px] font-bold border border-rose-200 transition-all shrink-0 disabled:opacity-50"
            title={`ล้าง${periodClearLabel} ทั้งบนเว็บและใน Google Sheets`}
          >
            <Trash2 size={12} className={isClearing ? 'animate-spin' : ''} />
            <span>{isClearing ? 'กำลังล้าง...' : `Clear ${periodClearLabel}`}</span>
          </button>
        </div>
      </header>

      {/* เนื้อหาหลัก */}
      <main className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* การ์ดสรุปยอดเงิน 3 ใบ (KPI Cards) */}
        <div className="grid grid-cols-3 gap-2">
          {/* รายรับ */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-1 text-emerald-600 mb-1">
              <TrendingUp size={14} />
              <span className="text-[10px] font-bold">รายรับขาย</span>
            </div>
            <p className="text-sm font-black text-slate-900">
              {SHOP_CONFIG.currency}
              {summary.totalRevenue.toLocaleString()}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5">
              {summary.orderCount} บิล
            </p>
          </div>

          {/* รายจ่าย */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-1 text-rose-500 mb-1">
              <TrendingDown size={14} />
              <span className="text-[10px] font-bold">รายจ่ายร้าน</span>
            </div>
            <p className="text-sm font-black text-slate-900">
              {SHOP_CONFIG.currency}
              {summary.totalExpenses.toLocaleString()}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5">
              {filteredExpenses.length} รายการ
            </p>
          </div>

          {/* กำไรสุทธิ */}
          <div className="bg-white p-3 rounded-2xl border border-slate-200/80 shadow-2xs">
            <div className="flex items-center gap-1 text-blue-600 mb-1">
              <DollarSign size={14} />
              <span className="text-[10px] font-bold">กำไรสุทธิ</span>
            </div>
            <p
              className={`text-sm font-black ${
                summary.netProfit >= 0 ? 'text-blue-600' : 'text-rose-600'
              }`}
            >
              {SHOP_CONFIG.currency}
              {summary.netProfit.toLocaleString()}
            </p>
            <p className="text-[9px] text-slate-400 mt-0.5">
              หักต้นทุน+จ่าย
            </p>
          </div>
        </div>

        {/* กล่องคำแนะนำสำหรับเปิดบนคอมพิวเตอร์ */}
        <div className="bg-blue-50/70 border border-blue-200/60 rounded-2xl p-2.5 flex items-center justify-between text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="text-blue-600 shrink-0" size={18} />
            <span className="text-[11px] font-medium leading-tight">
              ชื่อไฟล์อัตโนมัติ: <code className="font-mono font-bold bg-white px-1.5 py-0.5 rounded border border-blue-200">DD-MM-YYYY.xlsx</code> จัดตารางสูตรพร้อมเปิดบน Excel คอมพิวเตอร์
            </span>
          </div>
        </div>

        {/* แถบสลับดู: รายการขาย / รายการรายจ่าย */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'sales'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <Receipt size={14} />
              <span>ประวัติบิลขาย ({filteredOrders.length})</span>
            </button>
            <button
              onClick={() => setActiveTab('expenses')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'expenses'
                  ? 'bg-slate-900 text-white'
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              <Wallet size={14} />
              <span>รายจ่ายร้าน ({filteredExpenses.length})</span>
            </button>
          </div>

          {activeTab === 'expenses' && (
            <button
              onClick={() => setIsAddExpenseOpen(true)}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white rounded-xl text-xs font-bold shadow-xs transition-all"
            >
              <Plus size={14} />
              <span>จดรายจ่าย</span>
            </button>
          )}
        </div>

        {/* ตารางแสดงข้อมูลตามแท็บที่เลือก */}
        {activeTab === 'sales' ? (
          <div className="space-y-2">
            {filteredOrders.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200/80">
                <Receipt size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-medium">ยังไม่มีบิลขายในช่วงเวลานี้</p>
              </div>
            ) : (
              filteredOrders.map((o) => {
                const isThaiHelp =
                  o.paymentMethod === 'THAI_CHUEY_THAI' ||
                  (o.cashReceived > 0 && Math.abs(o.cashReceived - (o.totalAmount * 0.4)) < 0.01)

                return (
                  <div
                    key={o.id || o.orderNo}
                    className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs flex items-center justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-slate-500">
                          {o.orderNo}
                        </span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded-md font-medium ${
                            isThaiHelp
                              ? 'bg-amber-100 text-amber-800 font-bold'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {isThaiHelp ? 'ไทยช่วยไทย' : o.paymentMethod === 'CASH' ? 'เงินสด' : 'PromptPay'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {new Date(o.createdAt).toLocaleTimeString('th-TH', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        • {o.items.length} รายการ
                      </p>
                    </div>

                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="text-right">
                        {isThaiHelp ? (
                          <>
                            <p className="font-black text-sm text-amber-700">
                              +{SHOP_CONFIG.currency}
                              {(o.totalAmount * 0.4).toLocaleString()}
                              <span className="text-[10px] font-medium text-slate-400 ml-1">
                                (เต็ม {SHOP_CONFIG.currency}{o.totalAmount.toLocaleString()})
                              </span>
                            </p>
                            <p className="text-[10px] font-semibold text-emerald-600">
                              กำไร {SHOP_CONFIG.currency}
                              {o.profit.toLocaleString()}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="font-black text-sm text-slate-900">
                              +{SHOP_CONFIG.currency}
                              {o.totalAmount.toLocaleString()}
                            </p>
                            <p className="text-[10px] font-semibold text-emerald-600">
                              กำไร {SHOP_CONFIG.currency}
                              {o.profit.toLocaleString()}
                            </p>
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteSingleOrder(o)}
                        disabled={deletingOrderNo === o.orderNo}
                        title="ยกเลิก/ลบบิลนี้ (คืนสต็อกเข้าคลัง)"
                        className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 rounded-xl transition-all disabled:opacity-40"
                      >
                        <Trash2 size={16} className={deletingOrderNo === o.orderNo ? 'animate-spin' : ''} />
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredExpenses.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-400 border border-slate-200/80">
                <Wallet size={36} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-medium">ยังไม่มีรายการรายจ่าย</p>
                <button
                  onClick={() => setIsAddExpenseOpen(true)}
                  className="mt-3 px-3 py-1.5 bg-rose-50 text-rose-600 rounded-xl text-xs font-bold"
                >
                  + จดรายจ่ายแรก
                </button>
              </div>
            ) : (
              filteredExpenses.map((e) => (
                <div
                  key={e.id}
                  className="bg-white rounded-2xl p-3 border border-slate-200/80 shadow-2xs flex items-center justify-between"
                >
                  <div>
                    <span className="text-[10px] text-rose-500 font-semibold bg-rose-50 px-2 py-0.5 rounded-md">
                      {e.category}
                    </span>
                    <h4 className="font-bold text-xs text-slate-800 mt-1">
                      {e.title}
                    </h4>
                    {e.note && (
                      <p className="text-[10px] text-slate-400 mt-0.5">{e.note}</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-black text-sm text-rose-600">
                      -{SHOP_CONFIG.currency}
                      {e.amount.toLocaleString()}
                    </span>
                    <button
                      onClick={() => handleDeleteExpense(e)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </main>

      {/* โมดอลบันทึกรายจ่าย (Add Expense Sheet) */}
      {isAddExpenseOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl safe-bottom">
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100">
              <h2 className="font-bold text-slate-900 text-base">บันทึกรายจ่ายร้าน</h2>
              <button
                onClick={() => setIsAddExpenseOpen(false)}
                className="p-1 rounded-full bg-slate-100 text-slate-600"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  รายการค่าใช้จ่าย <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="เช่น ซื้อถุงหูหิ้ว, ค่าน้ำแข็ง, ค่าไฟ"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  จำนวนเงิน (บาท) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  step="any"
                  min="0"
                  inputMode="decimal"
                  required
                  value={expenseAmount}
                  onChange={(e) => setExpenseAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-rose-600 outline-none focus:bg-white focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หมวดหมู่ค่าใช้จ่าย
                </label>
                <select
                  value={expenseCategory}
                  onChange={(e) => setExpenseCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 outline-none focus:bg-white focus:border-rose-500"
                >
                  {SHOP_CONFIG.expenseCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  หมายเหตุเพิ่มเติม (ถ้ามี)
                </label>
                <input
                  type="text"
                  value={expenseNote}
                  onChange={(e) => setExpenseNote(e.target.value)}
                  placeholder="เช่น ซื้อจากแม็คโคร"
                  className="w-full px-3 py-2 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 outline-none focus:bg-white focus:border-rose-500"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-3 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all"
                >
                  บันทึกรายจ่าย
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* หน้าต่าง Popup แจ้งเตือน: ซิงค์แล้ว พร้อมเวลา */}
      {syncModal.isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl text-center animate-in zoom-in-95 duration-150 border border-slate-100">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3 shadow-inner">
              <CheckCircle2 size={32} strokeWidth={2.5} />
            </div>

            <h3 className="text-xl font-black text-slate-900 tracking-tight">
              {syncModal.title}
            </h3>

            <p className="text-sm font-bold text-emerald-600 mt-1 mb-5">
              {syncModal.timeStr}
            </p>

            <button
              onClick={() => setSyncModal((prev) => ({ ...prev, isOpen: false }))}
              className="mt-4 w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-sm transition-all shadow-md shadow-emerald-600/20"
            >
              ตกลง
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
