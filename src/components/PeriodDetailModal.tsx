'use client'

import React, { useEffect, useId, useMemo, useState } from 'react'
import {
  X,
  Receipt,
  Wallet,
  Trash2,
  MapPin,
  Calendar,
  ChevronRight,
  ArrowLeft,
} from 'lucide-react'
import type { Expense, PeriodLocationSummary, SaleOrder } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { formatShortDayMonth, formatThaiDate, formatThaiMonth } from '../utils/dateHelper'
import { buildDailySummariesInMonth } from '../utils/dataAnalytics'
import { ModalDialog } from './ModalDialog'

interface PeriodDetailModalProps {
  group: PeriodLocationSummary | null
  periodType: 'month' | 'year'
  isOpen: boolean
  onClose: () => void
  onDeleteOrder: (order: SaleOrder) => Promise<void>
  onDeleteExpense: (expense: Expense) => Promise<void>
  deletingOrderNo: string | null
}

/**
 * หน้าต่างแสดงรายการซื้อขายและรายจ่ายภายในวันหรือเดือนที่เลือก:
 * - แท็บ "เดือนนี้" (รายวัน): แสดงบิลขายและรายจ่ายของวันนั้นทันที
 * - แท็บ "ปีนี้" (รายเดือน): แสดงการ์ดสรุปรายวัน DD/MM (รายรับ-รายจ่าย-สุทธิ) พร้อมปุ่มดูบิลในเดือนนั้น
 */
export const PeriodDetailModal: React.FC<PeriodDetailModalProps> = ({
  group,
  periodType,
  isOpen,
  onClose,
  onDeleteOrder,
  onDeleteExpense,
  deletingOrderNo,
}) => {
  const [activeTab, setActiveTab] = useState<'sales' | 'expenses'>('sales')
  const [yearViewMode, setYearViewMode] = useState<'daily' | 'all_bills' | 'single_day'>('daily')
  const [selectedDateStr, setSelectedDateStr] = useState<string | null>(null)
  const titleId = useId()

  useEffect(() => {
    setActiveTab('sales')
    setYearViewMode('daily')
    setSelectedDateStr(null)
  }, [isOpen, group?.id, periodType])

  const dailyCards = useMemo(() => {
    if (!group || periodType !== 'year') return []
    return buildDailySummariesInMonth(group.orders, group.expenses)
  }, [group, periodType])

  const selectedDayCard = useMemo(() => {
    if (!selectedDateStr) return null
    return dailyCards.find((d) => d.dateStr === selectedDateStr) || null
  }, [dailyCards, selectedDateStr])

  if (!isOpen || !group) return null

  const formattedPeriod =
    periodType === 'month' ? formatThaiDate(group.periodKey) : formatThaiMonth(group.periodKey)

  const isDailyOverview = periodType === 'year' && yearViewMode === 'daily'

  const visibleOrders =
    periodType === 'year' && yearViewMode === 'single_day' && selectedDateStr
      ? selectedDayCard?.orders || []
      : group.orders

  const visibleExpenses =
    periodType === 'year' && yearViewMode === 'single_day' && selectedDateStr
      ? selectedDayCard?.expenses || []
      : group.expenses

  const activeSummary =
    periodType === 'year' && yearViewMode === 'single_day' && selectedDayCard
      ? selectedDayCard.summary
      : group.summary

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      position="bottom-sheet"
      panelClassName="w-full max-w-md md:max-w-2xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 safe-bottom"
    >
      {/* หัวโมดอล */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 id={titleId} className="font-black text-slate-900 dark:text-white text-base md:text-xl">
              {formattedPeriod}
            </h2>
            {group.locationLabel && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[11px] md:text-sm font-bold">
                <MapPin aria-hidden="true" size={12} />
                <span>{group.locationLabel}</span>
              </span>
            )}
          </div>
          <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {periodType === 'year' && yearViewMode === 'single_day' && selectedDateStr
              ? `วันที่ ${formatShortDayMonth(selectedDateStr)} (${formatThaiDate(selectedDateStr)}) • ${visibleOrders.length} บิลขาย • ${visibleExpenses.length} รายจ่าย`
              : `${group.orders.length} บิลขาย • ${group.expenses.length} รายจ่าย`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดรายละเอียดรายการซื้อขาย"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 shrink-0 transition-colors"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      {/* แถบสรุปยอดของชุดข้อมูลที่กำลังดู */}
      <div className="grid grid-cols-3 gap-2 p-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="bg-white dark:bg-slate-900 p-2.5 md:p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="text-[10px] md:text-xs font-bold text-emerald-600 dark:text-emerald-400 block">
            รายรับ
          </span>
          <span className="text-sm md:text-lg font-black text-slate-900 dark:text-white">
            {SHOP_CONFIG.currency}{activeSummary.totalRevenue.toLocaleString()}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-2.5 md:p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="text-[10px] md:text-xs font-bold text-rose-500 dark:text-rose-400 block">
            รายจ่าย
          </span>
          <span className="text-sm md:text-lg font-black text-slate-900 dark:text-white">
            {SHOP_CONFIG.currency}{activeSummary.totalExpenses.toLocaleString()}
          </span>
        </div>
        <div className="bg-white dark:bg-slate-900 p-2.5 md:p-3 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <span className="text-[10px] md:text-xs font-bold text-blue-600 dark:text-blue-400 block">
            สรุปสุทธิ
          </span>
          <span
            className={`text-sm md:text-lg font-black ${
              activeSummary.netProfit >= 0
                ? 'text-blue-600 dark:text-blue-400'
                : 'text-rose-600 dark:text-rose-400'
            }`}
          >
            {SHOP_CONFIG.currency}{activeSummary.netProfit.toLocaleString()}
          </span>
        </div>
      </div>

      {isDailyOverview ? (
        <>
          {/* หัวข้อส่วนการ์ดรายวัน (DD/MM) */}
          <div className="flex items-center justify-between px-4 pt-3 pb-1 shrink-0">
            <span className="text-xs md:text-sm font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Calendar aria-hidden="true" size={14} className="text-blue-500" />
              <span>สรุปรายวัน ({dailyCards.length} วัน) — แตะวันที่เพื่อดูบิลของวันนั้น</span>
            </span>
          </div>

          {/* รายการการ์ดวันที่ DD/MM */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-2 max-h-[46dvh]">
            {dailyCards.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs md:text-base">
                ไม่มีรายการซื้อขายหรือรายจ่ายในเดือนนี้
              </div>
            ) : (
              dailyCards.map((day) => (
                <button
                  key={day.dateStr}
                  type="button"
                  onClick={() => {
                    setSelectedDateStr(day.dateStr)
                    setYearViewMode('single_day')
                    setActiveTab(day.orders.length > 0 ? 'sales' : 'expenses')
                  }}
                  className="w-full text-left bg-slate-50 dark:bg-slate-800/70 hover:bg-blue-50/70 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-700 rounded-2xl p-3 md:p-3.5 transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <span className="px-2.5 py-0.5 rounded-lg bg-slate-900 dark:bg-blue-600 text-white font-black text-xs md:text-base tracking-tight">
                        {day.shortDateLabel}
                      </span>
                      <span className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                        {day.orders.length} บิลขาย • {day.expenses.length} รายจ่าย
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-0.5 text-[11px] md:text-xs font-bold text-blue-600 dark:text-blue-400 shrink-0">
                      <span>ดูบิล</span>
                      <ChevronRight aria-hidden="true" size={14} />
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                    <div>
                      <span className="text-[10px] md:text-xs text-slate-400 block">รายรับ</span>
                      <span className="text-xs md:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                        +{SHOP_CONFIG.currency}{day.summary.totalRevenue.toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] md:text-xs text-slate-400 block">รายจ่าย</span>
                      <span className="text-xs md:text-base font-extrabold text-rose-600 dark:text-rose-400">
                        -{SHOP_CONFIG.currency}{day.summary.totalExpenses.toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] md:text-xs text-slate-400 block">สุทธิ</span>
                      <span
                        className={`text-xs md:text-base font-black ${
                          day.summary.netProfit >= 0
                            ? 'text-blue-600 dark:text-blue-400'
                            : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {SHOP_CONFIG.currency}{day.summary.netProfit.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {/* ปุ่มดูบิลทั้งหมดในเดือนนั้น */}
          <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSelectedDateStr(null)
                setYearViewMode('all_bills')
                setActiveTab('sales')
              }}
              className="w-full min-h-12 py-3 px-4 rounded-xl bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 active:scale-[0.99] text-white font-bold text-xs md:text-base shadow-sm flex items-center justify-center gap-2 transition-all"
            >
              <Receipt aria-hidden="true" size={18} />
              <span>
                ดูบิลในเดือนนี้ทั้งหมด ({group.orders.length.toLocaleString()} บิลขาย •{' '}
                {group.expenses.length.toLocaleString()} รายจ่าย)
              </span>
            </button>
          </div>
        </>
      ) : (
        <>
          {/* แถบย้อนกลับเมื่ออยู่ในมุมมองแท็บ "ปีนี้" */}
          {periodType === 'year' && (
            <div className="flex items-center justify-between gap-2 px-4 pt-3 shrink-0">
              <button
                type="button"
                onClick={() => {
                  setYearViewMode('daily')
                  setSelectedDateStr(null)
                  setActiveTab('sales')
                }}
                className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs md:text-sm font-bold transition-colors"
              >
                <ArrowLeft aria-hidden="true" size={15} />
                <span>กลับดูรายวัน (DD/MM)</span>
              </button>

              {yearViewMode === 'single_day' && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDateStr(null)
                    setYearViewMode('all_bills')
                  }}
                  className="inline-flex items-center gap-1 min-h-10 px-3 py-1.5 rounded-xl bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-xs md:text-sm font-bold transition-colors"
                >
                  <Receipt aria-hidden="true" size={14} />
                  <span>ดูบิลทั้งเดือน ({group.orders.length})</span>
                </button>
              )}
            </div>
          )}

          {/* ปุ่มสลับดู บิลขาย / รายจ่าย */}
          <div className="flex gap-2 px-4 pt-3 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('sales')}
              className={`flex items-center gap-1.5 min-h-10 px-3.5 py-2 rounded-xl text-xs md:text-base font-bold transition-all ${
                activeTab === 'sales'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Receipt aria-hidden="true" size={16} />
              <span>บิลขาย ({visibleOrders.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('expenses')}
              className={`flex items-center gap-1.5 min-h-10 px-3.5 py-2 rounded-xl text-xs md:text-base font-bold transition-all ${
                activeTab === 'expenses'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
              }`}
            >
              <Wallet aria-hidden="true" size={16} />
              <span>รายจ่าย ({visibleExpenses.length})</span>
            </button>
          </div>

          {/* รายการบิลขาย / รายจ่ายด้านใน */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2.5 max-h-[50dvh]">
            {activeTab === 'sales' ? (
              visibleOrders.length === 0 ? (
                <div className="py-10 text-center text-slate-400 text-xs md:text-base">
                  ไม่มีบิลขายในช่วงนี้
                </div>
              ) : (
                visibleOrders.map((o) => {
                  const isThaiHelp =
                    o.paymentMethod === 'THAI_CHUEY_THAI' ||
                    (o.cashReceived > 0 && Math.abs(o.cashReceived - o.totalAmount * 0.4) < 0.01)

                  return (
                    <div
                      key={o.id || o.orderNo}
                      className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3 md:p-4 border border-slate-200/80 dark:border-slate-700 flex items-start justify-between gap-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[11px] md:text-sm font-bold text-slate-600 dark:text-slate-300">
                            {o.orderNo}
                          </span>
                          <span
                            className={`text-[10px] md:text-xs px-2 py-0.5 rounded-md font-semibold ${
                              isThaiHelp
                                ? 'bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 font-bold'
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                            }`}
                          >
                            {isThaiHelp
                              ? 'ไทยช่วยไทย'
                              : o.paymentMethod === 'CASH'
                              ? 'เงินสด'
                              : 'PromptPay'}
                          </span>
                          {o.location && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] md:text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-semibold">
                              <MapPin aria-hidden="true" size={10} />
                              {o.location}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 mt-1">
                          {formatThaiDate(o.dateStr)}{' '}
                          {new Date(o.createdAt).toLocaleTimeString('th-TH', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}{' '}
                          • {o.items.length} รายการ
                        </p>
                        {o.items && o.items.length > 0 && (
                          <p className="text-[11px] md:text-sm text-slate-600 dark:text-slate-300 mt-1 leading-snug">
                            {o.items
                              .map((it) => `${it.name} x${it.quantity}`)
                              .join(', ')}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-right">
                          {isThaiHelp ? (
                            <>
                              <p className="font-black text-sm md:text-lg text-amber-700 dark:text-amber-300">
                                +{SHOP_CONFIG.currency}
                                {(o.totalAmount * 0.4).toLocaleString()}
                                <span className="block sm:inline text-[10px] md:text-xs font-medium text-slate-400 sm:ml-1">
                                  (เต็ม {SHOP_CONFIG.currency}{o.totalAmount.toLocaleString()})
                                </span>
                              </p>
                              <p className="text-[10px] md:text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                กำไร {SHOP_CONFIG.currency}{o.profit.toLocaleString()}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="font-black text-sm md:text-lg text-slate-900 dark:text-white">
                                +{SHOP_CONFIG.currency}{o.totalAmount.toLocaleString()}
                              </p>
                              <p className="text-[10px] md:text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                กำไร {SHOP_CONFIG.currency}{o.profit.toLocaleString()}
                              </p>
                            </>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onDeleteOrder(o)}
                          disabled={deletingOrderNo === o.orderNo}
                          aria-label={`ยกเลิกบิล ${o.orderNo} และคืนสต็อก`}
                          className="min-h-11 min-w-11 flex items-center justify-center text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 active:scale-95 rounded-xl transition-all disabled:opacity-40"
                        >
                          <Trash2
                            aria-hidden="true"
                            size={18}
                            className={deletingOrderNo === o.orderNo ? 'animate-spin' : ''}
                          />
                        </button>
                      </div>
                    </div>
                  )
                })
              )
            ) : visibleExpenses.length === 0 ? (
              <div className="py-10 text-center text-slate-400 text-xs md:text-base">
                ไม่มีรายการรายจ่ายในช่วงนี้
              </div>
            ) : (
              visibleExpenses.map((e) => (
                <div
                  key={e.id || e.expenseNo || `${e.title}_${e.createdAt}`}
                  className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-3 md:p-4 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between gap-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] md:text-xs text-rose-600 dark:text-rose-300 font-semibold bg-rose-50 dark:bg-rose-950/70 px-2 py-0.5 rounded-md">
                        {e.category}
                      </span>
                      {e.location && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] md:text-xs px-2 py-0.5 rounded-md bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 font-semibold">
                          <MapPin aria-hidden="true" size={10} />
                          {e.location}
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-xs md:text-base text-slate-800 dark:text-slate-100 mt-1">
                      {e.title}
                    </h4>
                    <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                      {formatThaiDate(e.dateStr)}
                      {e.note ? ` • ${e.note}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-black text-sm md:text-lg text-rose-600 dark:text-rose-400">
                      -{SHOP_CONFIG.currency}{e.amount.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteExpense(e)}
                      aria-label={`ลบรายจ่าย ${e.title}`}
                      className="min-h-11 min-w-11 flex items-center justify-center rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/60"
                    >
                      <Trash2 aria-hidden="true" size={18} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </ModalDialog>
  )
}
