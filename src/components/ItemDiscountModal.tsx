'use client'

import React, { useEffect, useId, useState } from 'react'
import { X, Tag, Check, RotateCcw } from 'lucide-react'
import type { CartItem } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { ModalDialog } from './ModalDialog'

interface ItemDiscountModalProps {
  item: CartItem | null
  isOpen: boolean
  onClose: () => void
  onSaveDiscount: (barcode: string, discountPerPiece: number) => void
}

export const ItemDiscountModal: React.FC<ItemDiscountModalProps> = ({
  item,
  isOpen,
  onClose,
  onSaveDiscount,
}) => {
  const [discountVal, setDiscountVal] = useState<string>('0')
  const titleId = useId()

  useEffect(() => {
    if (isOpen && item) {
      setDiscountVal((item.discount || 0).toString())
    }
  }, [isOpen, item])

  if (!isOpen || !item) return null

  const originalPrice = item.product.price
  const quantity = item.quantity

  const parsedDiscount = parseFloat(discountVal) || 0
  const validDiscount = Math.min(originalPrice, Math.max(0, parsedDiscount))
  const finalPricePerUnit = Math.max(0, originalPrice - validDiscount)
  const totalItemDiscount = validDiscount * quantity
  const totalItemPayable = finalPricePerUnit * quantity
  const totalOriginal = originalPrice * quantity

  const handleApply = () => {
    onSaveDiscount(item.product.barcode, validDiscount)
    onClose()
  }

  const setExactDiscount = (amt: number) => {
    const capped = Math.min(originalPrice, Math.max(0, amt))
    setDiscountVal(capped.toString())
  }

  const setPercentDiscount = (percent: number) => {
    const amt = Math.round((originalPrice * percent) / 100)
    setExactDiscount(amt)
  }

  const handleFinalPriceChange = (targetPrice: string) => {
    const p = parseFloat(targetPrice)
    if (isNaN(p)) {
      setDiscountVal('0')
    } else {
      const disc = Math.max(0, originalPrice - p)
      setDiscountVal(Math.min(originalPrice, disc).toString())
    }
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      position="bottom-sheet"
      zIndexClass="z-60"
      panelClassName="w-full max-w-sm md:max-w-lg rounded-t-3xl sm:rounded-3xl bg-white dark:bg-slate-900 p-5 md:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 safe-bottom"
    >
      {/* หัวหน้าต่าง */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-xl">
            <Tag aria-hidden="true" size={20} />
          </div>
          <div>
            <h3 id={titleId} className="font-bold text-slate-900 dark:text-slate-100 text-base md:text-xl">
              ลดราคาต่อรายการ
            </h3>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              กำหนดส่วนลดพิเศษให้ลูกค้า (ค่าเริ่มต้น: 0฿)
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่างส่วนลด"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      <div className="modal-body-scroll pr-0.5">
        {/* ข้อมูลสินค้าที่กำลังลดราคา */}
        <div className="my-4 p-3 md:p-4 bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 rounded-2xl flex items-center gap-3">
          {item.product.image ? (
            <img
              src={item.product.image}
              alt={item.product.name}
              className="w-12 h-12 md:w-16 md:h-16 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white"
            />
          ) : (
            <div className="w-12 h-12 md:w-16 md:h-16 rounded-xl bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 shrink-0 font-bold text-xs md:text-sm">
              {item.product.category.slice(0, 2)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm md:text-lg truncate">
              {item.product.name}
            </h4>
            <div className="flex items-center gap-2 mt-0.5 text-xs md:text-sm text-slate-500 dark:text-slate-400">
              <span>
                ราคาปกติ:{' '}
                <strong className="text-slate-800 dark:text-slate-200">
                  {SHOP_CONFIG.currency}{originalPrice.toLocaleString()}
                </strong>
              </span>
              <span>•</span>
              <span>
                จำนวน:{' '}
                <strong className="text-blue-600 dark:text-blue-400">{quantity} ชิ้น</strong>
              </span>
            </div>
          </div>
        </div>

        {/* ช่องใส่ส่วนลดต่อชิ้น */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs md:text-base font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1">
                <span>ส่วนลดต่อชิ้น (บาท)</span>
                <span className="text-[11px] md:text-xs font-normal text-slate-400">(Default: 0)</span>
              </label>
              {validDiscount > 0 && (
                <button
                  type="button"
                  onClick={() => setExactDiscount(0)}
                  className="text-xs md:text-sm text-slate-500 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 flex items-center gap-1 font-semibold"
                >
                  <RotateCcw aria-hidden="true" size={14} />
                  <span>ล้างเป็น 0</span>
                </button>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-base md:text-lg">
                {SHOP_CONFIG.currency}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max={originalPrice}
                step="any"
                value={discountVal}
                onChange={(e) => setDiscountVal(e.target.value)}
                placeholder="0"
                autoFocus
                className="w-full pl-8 pr-14 py-2.5 md:py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-base md:text-xl font-black text-slate-900 dark:text-slate-100 outline-none focus:border-rose-500 transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs md:text-sm text-slate-400 font-semibold">
                / ชิ้น
              </span>
            </div>
          </div>

          {/* ปุ่มลัดเลือกส่วนลดด่วน */}
          <div className="space-y-1.5">
            <span className="text-[11px] md:text-xs font-bold text-slate-400 uppercase tracking-wider">
              ปุ่มลัดส่วนลด:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setExactDiscount(0)}
                className={`px-3 py-1.5 min-h-10 rounded-lg text-xs md:text-sm font-bold border transition-all ${
                  validDiscount === 0
                    ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-slate-100'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                ไม่ลด (0฿)
              </button>
              {[5, 10, 20, 50].map((amt) => {
                if (amt >= originalPrice) return null
                const isActive = validDiscount === amt
                return (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setExactDiscount(amt)}
                    className={`px-3 py-1.5 min-h-10 rounded-lg text-xs md:text-sm font-bold border transition-all ${
                      isActive
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-900/60'
                    }`}
                  >
                    -{amt}฿
                  </button>
                )
              })}
              {[10, 20, 50].map((pct) => {
                const isActive = Math.round((originalPrice * pct) / 100) === validDiscount
                return (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setPercentDiscount(pct)}
                    className={`px-2.5 py-1.5 min-h-10 rounded-lg text-xs md:text-sm font-bold border transition-all ${
                      isActive
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                    }`}
                  >
                    {pct}%
                  </button>
                )
              })}
            </div>
          </div>

          {/* หรือระบุราคาขายสุทธิหลังลด */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
            <span className="text-xs md:text-base text-slate-500 dark:text-slate-400 font-medium">
              หรือกำหนดราคาขายสุทธิ:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-xs md:text-base font-bold text-slate-400">
                {SHOP_CONFIG.currency}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max={originalPrice}
                step="any"
                value={finalPricePerUnit}
                onChange={(e) => handleFinalPriceChange(e.target.value)}
                className="w-24 text-right px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-base font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-blue-500"
              />
              <span className="text-xs md:text-sm text-slate-400 font-medium">/ชิ้น</span>
            </div>
          </div>
        </div>

        {/* สรุปยอดคำนวณแบบ Real-time */}
        <div className="mt-4 p-3.5 bg-blue-50/70 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900 rounded-2xl text-xs md:text-base space-y-1.5">
          <div className="flex justify-between text-slate-600 dark:text-slate-300">
            <span>ราคาเดิม ({quantity} ชิ้น):</span>
            <span className={validDiscount > 0 ? 'line-through text-slate-400' : 'font-medium'}>
              {SHOP_CONFIG.currency}{totalOriginal.toLocaleString()}
            </span>
          </div>

          {validDiscount > 0 && (
            <div className="flex justify-between text-rose-600 dark:text-rose-400 font-bold">
              <span>ส่วนลดทั้งหมด (-{validDiscount}฿ x {quantity}):</span>
              <span>-{SHOP_CONFIG.currency}{totalItemDiscount.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-slate-900 dark:text-slate-100 font-black border-t border-blue-200/60 dark:border-blue-800/60 pt-1.5">
            <span>ยอดรวมรายการนี้:</span>
            <span className="text-base md:text-xl text-blue-700 dark:text-blue-400">
              {SHOP_CONFIG.currency}{totalItemPayable.toLocaleString()}
            </span>
          </div>
        </div>
      </div>

      {/* ปุ่มยืนยัน / ยกเลิก */}
      <div className="grid grid-cols-2 gap-2.5 mt-4 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs md:text-base font-bold transition-all"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="min-h-11 py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs md:text-base font-bold shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5"
        >
          <Check aria-hidden="true" size={18} />
          <span>ใช้ส่วนลดนี้</span>
        </button>
      </div>
    </ModalDialog>
  )
}
