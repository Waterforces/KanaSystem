'use client'

import React, { useEffect, useId, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Plus,
  Trash2,
  X,
  RefreshCw,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Calendar,
} from 'lucide-react'
import { db } from '../../db/database'
import type { Expense, PeriodLocationSummary, SaleOrder } from '../../types'
import { SHOP_CONFIG } from '../../config/shopConfig'
import {
  syncExpenseToGoogleSheet,
  deleteExpenseFromGoogleSheet,
  syncAllDataFromGoogleSheet,
  clearDataFromGoogleSheet,
  deleteSingleOrderFromGoogleSheet,
  getLocalIsoDate,
} from '../../utils/googleSheetSync'
import { formatThaiDate, formatThaiMonth } from '../../utils/dateHelper'
import { getLocalShopLocation } from '../../utils/shopLocation'
import {
  buildMonthDailyGroups,
  buildYearMonthlyGroups,
  calculateFinancialSummary,
  getExpenseMonthStr,
  getOrderMonthStr,
} from '../../utils/dataAnalytics'
import { ModalDialog } from '../../components/ModalDialog'
import { PeriodDetailModal } from '../../components/PeriodDetailModal'
import { AnalyticsModal } from '../../components/AnalyticsModal'

export default function DataPage() {
  const orders = useLiveQuery(() => db.orders.orderBy('createdAt').reverse().toArray()) || []
  const expenses = useLiveQuery(() => db.expenses.orderBy('createdAt').reverse().toArray()) || []
  const products = useLiveQuery(() => db.products.toArray()) || []

  const [activePeriodTab, setActivePeriodTab] = useState<'month' | 'year'>('month')
  const [currentDateStr, setCurrentDateStr] = useState<string>('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [deletingOrderNo, setDeletingOrderNo] = useState<string | null>(null)

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false)
  const [isClearModalOpen, setIsClearModalOpen] = useState(false)
  const [isConfirmingClearAll, setIsConfirmingClearAll] = useState(false)
  const [clearAllConfirmText, setClearAllConfirmText] = useState('')

  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false)
  const [expenseTitle, setExpenseTitle] = useState('')
  const [expenseAmount, setExpenseAmount] = useState('')
  const [expenseCategory, setExpenseCategory] = useState(
    SHOP_CONFIG.expenseCategories[0] || 'ซื้อวัตถุดิบ/สินค้าเข้าร้าน'
  )
  const [expenseNote, setExpenseNote] = useState('')

  const [syncModal, setSyncModal] = useState<{
    isOpen: boolean
    title: string
    timeStr: string
  }>({
    isOpen: false,
    title: 'ซิงค์แล้ว',
    timeStr: '',
  })

  const expenseModalTitleId = useId()
  const clearModalTitleId = useId()
  const syncModalTitleId = useId()

  useEffect(() => {
    syncAllDataFromGoogleSheet().catch(() => {})
  }, [])

  // อัปเดตวันที่ปัจจุบันอัตโนมัติ (รองรับเปิดเว็บข้ามเที่ยงคืน BS-07 และป้องกัน hydration mismatch)
  useEffect(() => {
    const updateDate = () => setCurrentDateStr(getLocalIsoDate())
    updateDate()
    window.addEventListener('focus', updateDate)
    const timer = setInterval(updateDate, 30000)
    return () => {
      window.removeEventListener('focus', updateDate)
      clearInterval(timer)
    }
  }, [])

  const todayStr = currentDateStr
  const currentMonthStr = todayStr ? todayStr.slice(0, 7) : ''
  const currentYearStr = todayStr ? todayStr.slice(0, 4) : ''

  // การ์ดรายวันในเดือนนี้ (เรียงบนลงล่าง และแยกตามทำเลเมื่อมีมากกว่า 1 ร้าน)
  const monthDailyGroups = useMemo(
    () => buildMonthDailyGroups(orders, expenses, currentMonthStr),
    [orders, expenses, currentMonthStr]
  )

  // การ์ดรายเดือนในปีนี้ (เรียงบนลงล่าง และแยกตามทำเลเมื่อมีมากกว่า 1 ร้าน)
  const yearMonthlyGroups = useMemo(
    () => buildYearMonthlyGroups(orders, expenses, currentYearStr),
    [orders, expenses, currentYearStr]
  )

  const activeGroups = activePeriodTab === 'month' ? monthDailyGroups : yearMonthlyGroups

  const selectedGroup: PeriodLocationSummary | null = useMemo(() => {
    if (!selectedGroupId) return null
    return activeGroups.find((g) => g.id === selectedGroupId) || null
  }, [activeGroups, selectedGroupId])

  // สรุปยอดรวมทั้งหมดของแท็บที่เปิดอยู่ (เดือนนี้ หรือ ปีนี้)
  const overviewSummary = useMemo(() => {
    if (activePeriodTab === 'month') {
      const mOrders = orders.filter((o) => getOrderMonthStr(o) === currentMonthStr)
      const mExpenses = expenses.filter((e) => getExpenseMonthStr(e) === currentMonthStr)
      return calculateFinancialSummary(mOrders, mExpenses)
    }
    const yPrefix = `${currentYearStr}-`
    const yOrders = orders.filter((o) => getOrderMonthStr(o).startsWith(yPrefix))
    const yExpenses = expenses.filter((e) => getExpenseMonthStr(e).startsWith(yPrefix))
    return calculateFinancialSummary(yOrders, yExpenses)
  }, [activePeriodTab, orders, expenses, currentMonthStr, currentYearStr])

  const handleSyncWithSheet = async () => {
    setIsSyncing(true)
    try {
      const res = await syncAllDataFromGoogleSheet()
      const timeStr = new Date().toLocaleTimeString('th-TH', {
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
        })
      } else {
        alert(`เชื่อมต่อ Google Sheets ไม่สำเร็จ: ${res.error}`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'เกิดข้อผิดพลาดในการซิงก์'
      alert(msg)
    } finally {
      setIsSyncing(false)
    }
  }

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
    const pad = (n: number) => String(n).padStart(2, '0')
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, '0')
    const expenseNo = `EXP-${dateStr.replace(/-/g, '')}-${timeStr}-${rand}`

    // แนบทำเลเฉพาะเครื่องณ เวลาบันทึก (ล้างอัตโนมัติถ้าข้ามเที่ยงคืน)
    const activeLocation = getLocalShopLocation(now)

    const newExpense: Expense = {
      expenseNo,
      title: expenseTitle.trim(),
      amount: amountNum,
      category: expenseCategory,
      note: expenseNote.trim(),
      location: activeLocation || '',
      createdAt: now.getTime(),
      dateStr,
      monthStr,
    }

    await db.expenses.add(newExpense)

    setExpenseTitle('')
    setExpenseAmount('')
    setExpenseNote('')
    setIsAddExpenseOpen(false)

    await syncExpenseToGoogleSheet(newExpense)
  }

  const handleDeleteExpense = async (expense: Expense) => {
    if (!expense || !expense.id) return
    if (confirm(`คุณต้องการลบรายการรายจ่าย "${expense.title}" ใช่หรือไม่?`)) {
      await db.expenses.delete(expense.id)
      await deleteExpenseFromGoogleSheet(expense)
    }
  }

  const handleDeleteSingleOrder = async (order: SaleOrder) => {
    const itemCount = (order.items || []).reduce((sum, item) => sum + item.quantity, 0)
    const isThaiHelp =
      order.paymentMethod === 'THAI_CHUEY_THAI' ||
      (order.cashReceived > 0 && Math.abs(order.cashReceived - order.totalAmount * 0.4) < 0.01)

    const confirmMsg =
      `⚠️ คุณต้องการยกเลิกบิล "${order.orderNo}" ใช่หรือไม่?\n\n` +
      `• ยอดรวม: ${
        isThaiHelp
          ? `${SHOP_CONFIG.currency}${(order.totalAmount * 0.4).toLocaleString()} (เต็ม ${SHOP_CONFIG.currency}${order.totalAmount.toLocaleString()})`
          : `${SHOP_CONFIG.currency}${order.totalAmount.toLocaleString()}`
      }\n` +
      `• ประเภท: ${isThaiHelp ? 'ไทยช่วยไทย' : order.paymentMethod === 'CASH' ? 'เงินสด' : 'PromptPay'}\n` +
      `• จำนวนสินค้า: ${itemCount} ชิ้น\n\n` +
      `🔄 ระบบจะทำการคืนสต็อกสินค้าทั้งหมดในบิลนี้กลับเข้าคลังอัตโนมัติ และลบบิลออกจากทั้งบนเว็บและ Google Sheets!`

    if (!confirm(confirmMsg)) return

    setDeletingOrderNo(order.orderNo)
    try {
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

      if (order.id) {
        await db.orders.delete(order.id)
      } else {
        await db.orders.where('orderNo').equals(order.orderNo).delete()
      }

      await deleteSingleOrderFromGoogleSheet(order, true)
      await syncAllDataFromGoogleSheet()

      alert(`✅ ยกเลิกบิล ${order.orderNo} เรียบร้อยแล้ว (คืนสต็อกสินค้าเข้าคลังแล้ว)`)
    } catch (err: unknown) {
      console.error('Delete single order error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      alert(`เกิดข้อผิดพลาดในการยกเลิกบิล: ${msg}`)
    } finally {
      setDeletingOrderNo(null)
    }
  }

  const handleClearScope = async (scope: 'today' | 'month' | 'all') => {
    const liveTodayStr = getLocalIsoDate()
    const liveMonthStr = liveTodayStr.slice(0, 7)

    const allOrders = await db.orders.toArray()
    const allExpenses = await db.expenses.toArray()

    const targetOrders =
      scope === 'today'
        ? allOrders.filter((o) => o.dateStr === liveTodayStr)
        : scope === 'month'
        ? allOrders.filter((o) => getOrderMonthStr(o) === liveMonthStr)
        : allOrders

    const targetExpenses =
      scope === 'today'
        ? allExpenses.filter((e) => e.dateStr === liveTodayStr)
        : scope === 'month'
        ? allExpenses.filter((e) => getExpenseMonthStr(e) === liveMonthStr)
        : allExpenses

    const label =
      scope === 'today' ? 'ข้อมูลวันนี้' : scope === 'month' ? 'ข้อมูลเดือนนี้' : 'ข้อมูลทั้งหมด'

    if (targetOrders.length === 0 && targetExpenses.length === 0) {
      alert(`ไม่มีข้อมูลบิลขายหรือรายจ่ายสำหรับ "${label}"`)
      return
    }

    const cascadingDesc =
      scope === 'all'
        ? '• ข้อมูลทั้งหมด: ล้างชีตรวมออเดอร์ทั้งหมด, ประจำเดือนทุกเดือน, ประจำวันทุกวัน และรายจ่ายทั้งหมด'
        : scope === 'month'
        ? '• ข้อมูลเดือนนี้: ล้างชีตประจำเดือนนี้, ทุกชีตประจำวันในเดือนนี้ และตัดยอดออกจากชีตรวมทั้งหมด'
        : '• ข้อมูลวันนี้: ล้างชีตประจำวันนี้ และตัดยอดออกจากชีตเดือนและชีตรวมทั้งหมด'

    const closeClearModal = () => {
      setIsClearModalOpen(false)
      setIsConfirmingClearAll(false)
      setClearAllConfirmText('')
    }

    if (scope === 'all') {
      if (clearAllConfirmText.trim() !== 'CLEAR') {
        alert('กรุณาพิมพ์คำว่า "CLEAR" ตัวพิมพ์ใหญ่เพื่อยืนยัน')
        return
      }
    } else {
      const confirmMsg =
        `⚠️ คุณแน่ใจหรือไม่ว่าต้องการล้าง "${label}"?\n\n` +
        `${cascadingDesc}\n\n` +
        `• บิลขายที่จะถูกลบ: ${targetOrders.length} บิล\n` +
        `• รายจ่ายที่จะถูกลบ: ${targetExpenses.length} รายการ\n\n` +
        `การดำเนินการนี้จะล้างข้อมูลทั้งบนเว็บและบน Google Sheets!`

      if (!confirm(confirmMsg)) return
    }

    setIsClearing(true)
    closeClearModal()
    try {
      if (scope === 'all') {
        await db.orders.clear()
        await db.expenses.clear()
      } else {
        const orderIds = targetOrders.map((o) => o.id).filter(Boolean) as number[]
        const expIds = targetExpenses.map((e) => e.id).filter(Boolean) as number[]
        if (orderIds.length > 0) await db.orders.bulkDelete(orderIds)
        if (expIds.length > 0) await db.expenses.bulkDelete(expIds)
      }

      await clearDataFromGoogleSheet(scope, liveTodayStr, liveMonthStr)
      alert(`✅ ล้าง${label} เรียบร้อยแล้ว ทั้งบนเว็บและบน Google Sheets`)
    } catch (err: unknown) {
      console.error('Clear data error:', err)
      const msg = err instanceof Error ? err.message : String(err)
      alert(`เกิดข้อผิดพลาดในการล้างข้อมูล: ${msg}`)
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-950 pb-20 md:pb-24 overflow-hidden transition-colors">
      {/* ส่วนหัวหน้าจอ */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 pb-3 md:pb-4 safe-top shrink-0 shadow-xs transition-colors">
        <div className="max-w-5xl mx-auto space-y-2.5 md:space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-lg md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Data &amp; บัญชีร้าน
              </h1>
              <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                สรุปรายรับ-รายจ่ายแยกตามทำเลและช่วงเวลา
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSyncWithSheet}
                disabled={isSyncing}
                className="flex items-center gap-1.5 min-h-11 px-3 md:px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-95 text-slate-700 dark:text-slate-200 rounded-xl text-xs md:text-base font-semibold border border-slate-200 dark:border-slate-700 transition-all disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`w-4 h-4 ${isSyncing ? 'animate-spin text-emerald-600 dark:text-emerald-400' : ''}`}
                />
                <span>{isSyncing ? 'กำลังซิงก์...' : 'ซิงก์ชีต'}</span>
              </button>

              {/* ปุ่มวิเคราะห์ (แทนที่ปุ่ม Excel เดิม) */}
              <button
                type="button"
                onClick={() => setIsAnalyticsOpen(true)}
                className="flex items-center gap-1.5 min-h-11 px-3.5 md:px-5 py-2 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white rounded-xl text-xs md:text-base font-bold shadow-md shadow-emerald-600/20 transition-all"
              >
                <BarChart3 aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                <span>วิเคราะห์</span>
              </button>
            </div>
          </div>

          {/* 2 แท็บหลัก: เดือนนี้ / ปีนี้ */}
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setActivePeriodTab('month')}
              className={`flex-1 py-2 md:py-2.5 text-xs md:text-base font-bold rounded-lg transition-all ${
                activePeriodTab === 'month'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              เดือนนี้{currentMonthStr ? ` (${formatThaiMonth(currentMonthStr)})` : ''}
            </button>
            <button
              type="button"
              onClick={() => setActivePeriodTab('year')}
              className={`flex-1 py-2 md:py-2.5 text-xs md:text-base font-bold rounded-lg transition-all ${
                activePeriodTab === 'year'
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              ปีนี้{currentYearStr ? ` (${parseInt(currentYearStr, 10) + 543})` : ''}
            </button>
          </div>

          {/* แถบเครื่องมือ: จดรายจ่าย + Clear ข้อมูล */}
          <div className="flex items-center justify-between gap-2 pt-0.5">
            <button
              type="button"
              onClick={() => setIsAddExpenseOpen(true)}
              className="flex items-center gap-1.5 min-h-10 px-3 md:px-4 py-1.5 bg-rose-500 hover:bg-rose-600 active:scale-95 text-white rounded-xl text-xs md:text-base font-bold shadow-xs transition-all"
            >
              <Plus aria-hidden="true" size={16} />
              <span>จดรายจ่าย</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsConfirmingClearAll(false)
                setClearAllConfirmText('')
                setIsClearModalOpen(true)
              }}
              disabled={isClearing}
              className="flex items-center gap-1.5 min-h-10 px-3 md:px-4 py-1.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:scale-95 text-rose-600 dark:text-rose-400 rounded-xl text-xs md:text-base font-bold border border-rose-200 dark:border-rose-800 transition-all disabled:opacity-50"
            >
              <Trash2 aria-hidden="true" size={15} className={isClearing ? 'animate-spin' : ''} />
              <span>{isClearing ? 'กำลังล้าง...' : 'Clear ข้อมูล'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* เนื้อหาหลัก */}
      <main className="flex-1 overflow-y-auto p-3.5 md:p-6">
        <div className="max-w-5xl mx-auto space-y-3.5 md:space-y-5">
          {/* สรุปยอดรวมของช่วงเวลา (KPI Cards 3 ใบ) */}
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <div className="bg-white dark:bg-slate-900 p-3 md:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 mb-1">
                <TrendingUp aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-[10px] md:text-sm font-bold">รายรับรวม</span>
              </div>
              <p className="text-sm md:text-2xl font-black text-slate-900 dark:text-white truncate">
                {SHOP_CONFIG.currency}
                {overviewSummary.totalRevenue.toLocaleString()}
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                {overviewSummary.orderCount} บิล
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3 md:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center gap-1 text-rose-500 dark:text-rose-400 mb-1">
                <TrendingDown aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-[10px] md:text-sm font-bold">รายจ่ายรวม</span>
              </div>
              <p className="text-sm md:text-2xl font-black text-slate-900 dark:text-white truncate">
                {SHOP_CONFIG.currency}
                {overviewSummary.totalExpenses.toLocaleString()}
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                {activePeriodTab === 'month' ? 'เดือนนี้' : 'ปีนี้'}
              </p>
            </div>

            <div className="bg-white dark:bg-slate-900 p-3 md:p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs">
              <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 mb-1">
                <DollarSign aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                <span className="text-[10px] md:text-sm font-bold">สรุปสุทธิ</span>
              </div>
              <p
                className={`text-sm md:text-2xl font-black truncate ${
                  overviewSummary.netProfit >= 0
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-rose-600 dark:text-rose-400'
                }`}
              >
                {SHOP_CONFIG.currency}
                {overviewSummary.netProfit.toLocaleString()}
              </p>
              <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                หักต้นทุน+จ่าย
              </p>
            </div>
          </div>

          {/* รายการการ์ดรายวัน (เดือนนี้) หรือ รายเดือน (ปีนี้) เรียงแนวตั้งจากบนลงล่าง */}
          {activeGroups.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 md:p-14 text-center text-slate-400 border border-slate-200/80 dark:border-slate-800">
              <Calendar aria-hidden="true" size={40} className="mx-auto mb-2 opacity-60" />
              <p className="text-sm md:text-lg font-semibold">
                ยังไม่มีข้อมูลการซื้อขายหรือรายจ่ายใน{activePeriodTab === 'month' ? 'เดือนนี้' : 'ปีนี้'}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5 md:space-y-3.5">
              {activeGroups.map((group) => {
                const titleText =
                  activePeriodTab === 'month'
                    ? formatThaiDate(group.periodKey)
                    : formatThaiMonth(group.periodKey)

                return (
                  <div
                    key={group.id}
                    className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 md:p-5 border border-slate-200/80 dark:border-slate-800 shadow-2xs flex items-center justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0 space-y-2">
                      {/* แถวหัวการ์ด: วัน/เดือน + ชื่อทำเล (ถ้ามี) */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <h2 className="font-black text-slate-900 dark:text-white text-sm md:text-lg">
                          {titleText}
                        </h2>
                        {group.locationLabel && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] md:text-sm font-bold">
                            <MapPin aria-hidden="true" size={12} />
                            <span>{group.locationLabel}</span>
                          </span>
                        )}
                      </div>

                      {/* ข้อมูล รายรับ / รายจ่าย / สรุป */}
                      <div className="grid grid-cols-3 gap-2 pt-1">
                        <div>
                          <span className="text-[10px] md:text-xs text-slate-400 block">
                            รายรับ ({group.orders.length} บิล)
                          </span>
                          <span className="text-xs md:text-base font-black text-emerald-600 dark:text-emerald-400">
                            +{SHOP_CONFIG.currency}{group.summary.totalRevenue.toLocaleString()}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] md:text-xs text-slate-400 block">
                            รายจ่าย ({group.expenses.length})
                          </span>
                          <span className="text-xs md:text-base font-black text-rose-600 dark:text-rose-400">
                            -{SHOP_CONFIG.currency}{group.summary.totalExpenses.toLocaleString()}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] md:text-xs text-slate-400 block">
                            สรุปสุทธิ
                          </span>
                          <span
                            className={`text-xs md:text-base font-black ${
                              group.summary.netProfit >= 0
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-rose-600 dark:text-rose-400'
                            }`}
                          >
                            {SHOP_CONFIG.currency}{group.summary.netProfit.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* ปุ่มด้านข้างสำหรับดูรายการซื้อขายด้านใน */}
                    <button
                      type="button"
                      onClick={() => setSelectedGroupId(group.id)}
                      aria-label={`ดูรายการซื้อขาย ${titleText} ${group.locationLabel || ''}`}
                      className="shrink-0 min-h-12 px-3 md:px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/70 text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-300 border border-slate-200 dark:border-slate-700 rounded-xl flex items-center gap-1 text-xs md:text-base font-bold active:scale-95 transition-all"
                    >
                      <span>ดูรายการ</span>
                      <ChevronRight aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* โมดอลดูรายการซื้อขายด้านใน (ของวัน หรือ ของเดือน) */}
      <PeriodDetailModal
        group={selectedGroup}
        periodType={activePeriodTab}
        isOpen={!!selectedGroup}
        onClose={() => setSelectedGroupId(null)}
        onDeleteOrder={handleDeleteSingleOrder}
        onDeleteExpense={handleDeleteExpense}
        deletingOrderNo={deletingOrderNo}
      />

      {/* โมดอลวิเคราะห์ข้อมูล (แทนปุ่ม Excel เดิม) */}
      <AnalyticsModal
        isOpen={isAnalyticsOpen}
        onClose={() => setIsAnalyticsOpen(false)}
        orders={orders}
        expenses={expenses}
        products={products}
        todayStr={todayStr}
      />

      {/* โมดอลบันทึกรายจ่าย */}
      <ModalDialog
        isOpen={isAddExpenseOpen}
        onClose={() => setIsAddExpenseOpen(false)}
        labelledBy={expenseModalTitleId}
        position="bottom-sheet"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div>
            <h2 id={expenseModalTitleId} className="font-bold text-slate-900 dark:text-white text-base md:text-xl">
              บันทึกรายจ่ายร้าน
            </h2>
            <p className="text-[11px] md:text-sm text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">
              📅 ประจำวันที่: {todayStr} (เพิ่มได้เฉพาะของวันนี้)
            </p>
            <p className="text-[11px] md:text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-1">
              <MapPin aria-hidden="true" className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              <span>
                ทำเลเครื่องนี้:{' '}
                <strong className="text-slate-700 dark:text-slate-200">
                  {(isAddExpenseOpen && getLocalShopLocation()) || 'ไม่ได้ตั้งค่า (รวมในส่วนกลาง)'}
                </strong>
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAddExpenseOpen(false)}
            aria-label="ปิดหน้าต่างรายจ่าย"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <form onSubmit={handleSaveExpense} className="p-4 md:p-6 space-y-3.5 overflow-y-auto safe-bottom">
          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
              รายการค่าใช้จ่าย <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={expenseTitle}
              onChange={(e) => setExpenseTitle(e.target.value)}
              placeholder="เช่น ซื้อถุงหูหิ้ว, ค่าน้ำแข็ง, ค่าไฟ"
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-medium text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
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
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-bold text-rose-600 dark:text-rose-400 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-rose-500"
            />
          </div>

          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
              หมวดหมู่ค่าใช้จ่าย
            </label>
            <select
              value={expenseCategory}
              onChange={(e) => setExpenseCategory(e.target.value)}
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-medium text-slate-900 dark:text-white outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-rose-500"
            >
              {SHOP_CONFIG.expenseCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 mb-1">
              หมายเหตุเพิ่มเติม (ถ้ามี)
            </label>
            <input
              type="text"
              value={expenseNote}
              onChange={(e) => setExpenseNote(e.target.value)}
              placeholder="เช่น ซื้อจากแม็คโคร"
              className="w-full px-3 py-2.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-lg font-medium text-slate-700 dark:text-slate-200 outline-none focus:bg-white dark:focus:bg-slate-900 focus:border-rose-500"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full min-h-12 py-3 bg-rose-600 hover:bg-rose-500 active:scale-95 text-white rounded-xl text-sm md:text-lg font-bold shadow-md shadow-rose-600/20 transition-all"
            >
              บันทึกรายจ่าย
            </button>
          </div>
        </form>
      </ModalDialog>

      {/* โมดอลเลือกช่วงเวลาล้างข้อมูล (Clear Data) */}
      <ModalDialog
        isOpen={isClearModalOpen}
        onClose={() => {
          setIsClearModalOpen(false)
          setIsConfirmingClearAll(false)
          setClearAllConfirmText('')
        }}
        labelledBy={clearModalTitleId}
        position="center"
        panelClassName="w-full max-w-xs md:max-w-md rounded-3xl bg-white dark:bg-slate-900 p-5 md:p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <h3 id={clearModalTitleId} className="font-black text-slate-900 dark:text-white text-base md:text-xl">
            {isConfirmingClearAll ? 'ยืนยันล้างข้อมูลทั้งหมด' : 'เลือกช่วงข้อมูลที่จะล้าง'}
          </h3>
          <button
            type="button"
            onClick={() => {
              setIsClearModalOpen(false)
              setIsConfirmingClearAll(false)
              setClearAllConfirmText('')
            }}
            aria-label="ปิดหน้าต่างล้างข้อมูล"
            className="min-h-10 min-w-10 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>

        {!isConfirmingClearAll ? (
          <>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-3 mb-4">
              ระบบจะล้างทั้งในเครื่องนี้และบน Google Sheets ตามลำดับชั้นอัตโนมัติ
            </p>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleClearScope('today')}
                className="w-full min-h-11 py-3 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-xs md:text-base border border-rose-200 dark:border-rose-800 transition-all"
              >
                ล้างข้อมูลวันนี้ ({formatThaiDate(todayStr)})
              </button>
              <button
                type="button"
                onClick={() => handleClearScope('month')}
                className="w-full min-h-11 py-3 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold text-xs md:text-base border border-rose-200 dark:border-rose-800 transition-all"
              >
                ล้างข้อมูลเดือนนี้ ({formatThaiMonth(currentMonthStr)})
              </button>
              <button
                type="button"
                onClick={() => {
                  if (orders.length === 0 && expenses.length === 0) {
                    alert('ไม่มีข้อมูลบิลขายหรือรายจ่ายสำหรับ "ข้อมูลทั้งหมด"')
                    return
                  }
                  setClearAllConfirmText('')
                  setIsConfirmingClearAll(true)
                }}
                className="w-full min-h-11 py-3 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs md:text-base transition-all"
              >
                ล้างข้อมูลทั้งหมดตั้งแต่เปิดร้าน
              </button>
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs md:text-sm text-rose-800 dark:text-rose-200 space-y-1">
              <p className="font-bold">⚠️ คำเตือน: การล้างข้อมูลทั้งหมดตั้งแต่เปิดร้าน</p>
              <p>จะลบชีตรวมออเดอร์ทั้งหมด, ประจำเดือนทุกเดือน, ประจำวันทุกวัน และรายจ่ายทั้งหมดทั้งบนเครื่องและ Google Sheets</p>
              <p className="font-semibold pt-1">
                • บิลขายที่จะถูกลบ: {orders.length.toLocaleString()} บิล | รายจ่าย: {expenses.length.toLocaleString()} รายการ
              </p>
            </div>

            <div>
              <label className="block text-xs md:text-sm font-bold text-slate-700 dark:text-slate-200 mb-1.5">
                พิมพ์คำว่า <span className="text-rose-600 dark:text-rose-400 font-black">CLEAR</span> ตัวพิมพ์ใหญ่เพื่อยืนยัน:
              </label>
              <input
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={clearAllConfirmText}
                onChange={(e) => setClearAllConfirmText(e.target.value)}
                placeholder="พิมพ์ CLEAR"
                className="w-full px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-sm md:text-base font-bold text-slate-900 dark:text-white outline-none focus:border-rose-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsConfirmingClearAll(false)
                  setClearAllConfirmText('')
                }}
                className="min-h-11 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs md:text-sm transition-all"
              >
                ย้อนกลับ
              </button>
              <button
                type="button"
                disabled={clearAllConfirmText.trim() !== 'CLEAR'}
                onClick={() => handleClearScope('all')}
                className="min-h-11 py-2.5 px-3 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs md:text-sm transition-all"
              >
                ยืนยันล้างทั้งหมด
              </button>
            </div>
          </div>
        )}
      </ModalDialog>

      {/* โมดอลแจ้งเตือนซิงก์สำเร็จ */}
      <ModalDialog
        isOpen={syncModal.isOpen}
        onClose={() => setSyncModal((prev) => ({ ...prev, isOpen: false }))}
        labelledBy={syncModalTitleId}
        position="center"
        panelClassName="w-full max-w-xs md:max-w-sm rounded-3xl bg-white dark:bg-slate-900 p-5 md:p-6 shadow-2xl text-center border border-slate-200 dark:border-slate-800"
      >
        <div>
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 mb-3 shadow-inner">
            <CheckCircle2 aria-hidden="true" size={32} strokeWidth={2.5} />
          </div>

          <h3 id={syncModalTitleId} className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
            {syncModal.title}
          </h3>

          <p className="text-sm md:text-base font-bold text-emerald-600 dark:text-emerald-400 mt-1 mb-5">
            {syncModal.timeStr}
          </p>

          <button
            type="button"
            onClick={() => setSyncModal((prev) => ({ ...prev, isOpen: false }))}
            className="w-full min-h-11 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-sm md:text-base transition-all shadow-md shadow-emerald-600/20"
          >
            ตกลง
          </button>
        </div>
      </ModalDialog>
    </div>
  )
}
