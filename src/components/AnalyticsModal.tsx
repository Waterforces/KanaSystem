'use client'

import React, { useId, useMemo, useState } from 'react'
import { X, BarChart3, Award, CreditCard, MapPin, TrendingUp } from 'lucide-react'
import type { Expense, Product, SaleOrder } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import {
  computeAnalytics,
  UNNAMED_LOCATION_KEY,
  UNNAMED_LOCATION_LABEL,
} from '../utils/dataAnalytics'
import { getLocalIsoDate } from '../utils/dateHelper'
import { ModalDialog } from './ModalDialog'

interface AnalyticsModalProps {
  isOpen: boolean
  onClose: () => void
  orders: SaleOrder[]
  expenses: Expense[]
  products: Product[]
  todayStr: string
}

/**
 * หน้าต่างวิเคราะห์ข้อมูลการขาย (แทนปุ่ม Excel เดิม)
 * วิเคราะห์สินค้าประเภทไหนขายดีที่สุด, Top สินค้าขายดี, และสัดส่วนช่องทางชำระเงิน
 */
export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  orders,
  expenses,
  products,
  todayStr,
}) => {
  const [period, setPeriod] = useState<'today' | 'month' | 'year'>('month')
  const [locationFilter, setLocationFilter] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<'quantity' | 'revenue'>('quantity')
  const titleId = useId()

  const report = useMemo(() => {
    return computeAnalytics(orders, expenses, products, {
      period,
      todayStr: todayStr || getLocalIsoDate(),
      locationFilter,
      sortBy,
    })
  }, [orders, expenses, products, period, todayStr, locationFilter, sortBy])

  const sortedCategories = report.topCategories
  const sortedProducts = report.topProducts

  if (!isOpen) return null

  const bestCategory = sortedCategories[0]

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      position="bottom-sheet"
      panelClassName="w-full max-w-md md:max-w-3xl rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-800 safe-bottom"
    >
      {/* หัวโมดอล */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
            <BarChart3 aria-hidden="true" size={22} />
          </div>
          <div>
            <h2 id={titleId} className="font-black text-slate-900 dark:text-white text-base md:text-xl">
              วิเคราะห์ยอดขาย &amp; ประเภทสินค้าขายดี
            </h2>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              ดูอันดับประเภทสินค้าขายดี สินค้ายอดนิยม และช่องทางชำระเงิน
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่างวิเคราะห์"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      {/* ตัวกรองช่วงเวลา + ทำเลร้านค้า */}
      <div className="px-4 md:px-6 pt-3 pb-2 space-y-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 bg-slate-50/70 dark:bg-slate-950/40">
        <div className="flex bg-slate-200/70 dark:bg-slate-800 p-1 rounded-xl gap-1">
          {(
            [
              { id: 'today', label: 'วันนี้' },
              { id: 'month', label: 'เดือนนี้' },
              { id: 'year', label: 'ปีนี้' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setPeriod(tab.id)
                setLocationFilter('ALL')
              }}
              className={`flex-1 py-2 rounded-lg text-xs md:text-base font-bold transition-all ${
                period === tab.id
                  ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {(report.availableLocations.length > 0 || report.hasUnnamedRecords) && (
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            <span className="inline-flex items-center gap-1 text-[11px] md:text-sm font-bold text-slate-500 dark:text-slate-400 shrink-0">
              <MapPin aria-hidden="true" size={14} />
              ทำเล:
            </span>
            <button
              type="button"
              onClick={() => setLocationFilter('ALL')}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all ${
                locationFilter === 'ALL'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
              }`}
            >
              ทุกทำเลรวมกัน
            </button>
            {report.availableLocations.map((loc) => (
              <button
                key={loc}
                type="button"
                onClick={() => setLocationFilter(loc)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all ${
                  locationFilter === loc
                    ? 'bg-slate-900 dark:bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {loc}
              </button>
            ))}
            {report.hasUnnamedRecords && report.availableLocations.length > 0 && (
              <button
                type="button"
                onClick={() => setLocationFilter(UNNAMED_LOCATION_KEY)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs md:text-sm font-bold transition-all ${
                  locationFilter === UNNAMED_LOCATION_KEY
                    ? 'bg-slate-900 dark:bg-blue-600 text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {UNNAMED_LOCATION_LABEL}
              </button>
            )}
          </div>
        )}
      </div>

      {/* เนื้อหาการวิเคราะห์ */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4 md:space-y-5 max-h-[65dvh]">
        {/* สรุปยอดรวม */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 md:gap-3">
          <div className="bg-slate-50 dark:bg-slate-800/70 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <span className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 block">
              ยอดขายรวม
            </span>
            <span className="text-base md:text-xl font-black text-emerald-600 dark:text-emerald-400">
              {SHOP_CONFIG.currency}{report.summary.totalRevenue.toLocaleString()}
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <span className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 block">
              ขายได้ทั้งหมด
            </span>
            <span className="text-base md:text-xl font-black text-slate-900 dark:text-white">
              {report.totalUnitsSold.toLocaleString()} ชิ้น
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <span className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 block">
              รายจ่าย
            </span>
            <span className="text-base md:text-xl font-black text-rose-600 dark:text-rose-400">
              {SHOP_CONFIG.currency}{report.summary.totalExpenses.toLocaleString()}
            </span>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/70 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-700">
            <span className="text-[10px] md:text-xs font-bold text-slate-500 dark:text-slate-400 block">
              กำไรสุทธิ
            </span>
            <span
              className={`text-base md:text-xl font-black ${
                report.summary.netProfit >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              {SHOP_CONFIG.currency}{report.summary.netProfit.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ไฮไลท์ประเภทสินค้าขายดีที่สุด */}
        {bestCategory && (
          <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2.5 rounded-xl bg-emerald-600 text-white shrink-0">
                <Award aria-hidden="true" size={22} />
              </div>
              <div className="min-w-0">
                <span className="text-[11px] md:text-xs font-bold text-emerald-700 dark:text-emerald-300 uppercase">
                  สินค้าประเภทที่ขายดีที่สุด
                </span>
                <p className="text-base md:text-xl font-black text-slate-900 dark:text-white truncate">
                  {bestCategory.category}
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-sm md:text-lg font-black text-emerald-700 dark:text-emerald-300">
                {bestCategory.quantity.toLocaleString()} ชิ้น
              </p>
              <p className="text-xs md:text-sm font-semibold text-slate-600 dark:text-slate-300">
                {SHOP_CONFIG.currency}{bestCategory.revenue.toLocaleString()}
              </p>
            </div>
          </div>
        )}

        {/* อันดับประเภทสินค้าขายดี (Top Categories) */}
        <section className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-lg flex items-center gap-1.5">
              <TrendingUp aria-hidden="true" size={18} className="text-emerald-600 dark:text-emerald-400" />
              <span>อันดับประเภทสินค้าขายดี</span>
            </h3>
            <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-[11px] md:text-xs font-bold">
              <button
                type="button"
                onClick={() => setSortBy('quantity')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  sortBy === 'quantity'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                เรียงตามจำนวนชิ้น
              </button>
              <button
                type="button"
                onClick={() => setSortBy('revenue')}
                className={`px-2.5 py-1 rounded-md transition-all ${
                  sortBy === 'revenue'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                เรียงตามยอดขาย
              </button>
            </div>
          </div>

          {sortedCategories.length === 0 ? (
            <div className="py-6 text-center text-xs md:text-base text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
              ยังไม่มีข้อมูลการขายในช่วงเวลานี้
            </div>
          ) : (
            <div className="space-y-2">
              {sortedCategories.map((cat, idx) => {
                const barPct =
                  sortBy === 'revenue' ? cat.revenueSharePct : cat.quantitySharePct
                return (
                  <div
                    key={cat.category}
                    className="p-3 md:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`w-6 h-6 md:w-7 md:h-7 rounded-lg flex items-center justify-center text-xs md:text-sm font-black shrink-0 ${
                            idx === 0
                              ? 'bg-amber-500 text-white'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white text-xs md:text-base truncate">
                          {cat.category}
                        </span>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="font-black text-xs md:text-base text-slate-900 dark:text-white">
                          {cat.quantity.toLocaleString()} ชิ้น
                        </span>
                        <span className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 ml-2">
                          ({SHOP_CONFIG.currency}{cat.revenue.toLocaleString()})
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all"
                        style={{ width: `${Math.min(100, Math.max(4, barPct))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] md:text-xs text-slate-500 dark:text-slate-400">
                      <span>สัดส่วน {barPct}% ({cat.orderCount} บิล)</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                        กำไรขั้นต้น {SHOP_CONFIG.currency}{cat.profit.toLocaleString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>

        {/* Top 10 สินค้าขายดีรายชิ้น */}
        {sortedProducts.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-lg">
              อันดับสินค้าขายดีรายชิ้น (Top {sortedProducts.length})
            </h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 overflow-hidden">
              {sortedProducts.map((item, idx) => (
                <div
                  key={item.key}
                  className="px-3.5 py-2.5 md:py-3 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-xs md:text-sm font-bold text-slate-400 w-5 shrink-0">
                      #{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-base truncate">
                        {item.name}
                      </p>
                      <span className="text-[10px] md:text-xs text-slate-400">
                        {item.category}
                      </span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-black text-xs md:text-base text-blue-600 dark:text-blue-400">
                      {item.quantity.toLocaleString()} ชิ้น
                    </p>
                    <p className="text-[10px] md:text-xs text-slate-500 dark:text-slate-400">
                      {SHOP_CONFIG.currency}{item.revenue.toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* สัดส่วนช่องทางชำระเงิน */}
        {report.paymentBreakdown.length > 0 && (
          <section className="space-y-2.5">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm md:text-lg flex items-center gap-1.5">
              <CreditCard aria-hidden="true" size={18} className="text-blue-600 dark:text-blue-400" />
              <span>สัดส่วนช่องทางชำระเงิน</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {report.paymentBreakdown.map((pm) => (
                <div
                  key={pm.method}
                  className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700"
                >
                  <div className="flex items-center justify-between text-xs md:text-sm">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {pm.label}
                    </span>
                    <span className="text-[11px] md:text-xs font-bold text-blue-600 dark:text-blue-400">
                      {pm.sharePct}%
                    </span>
                  </div>
                  <p className="text-sm md:text-lg font-black text-slate-900 dark:text-white mt-1">
                    {SHOP_CONFIG.currency}{pm.customerPaidAmount.toLocaleString()}
                  </p>
                  <p className="text-[10px] md:text-xs text-slate-400 mt-0.5">
                    {pm.count} บิล
                    {pm.method === 'THAI_CHUEY_THAI'
                      ? ` (เต็ม ${SHOP_CONFIG.currency}${pm.totalOrderAmount.toLocaleString()})`
                      : ''}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </ModalDialog>
  )
}
