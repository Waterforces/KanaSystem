/**
 * ========================================================
 * 🏷️ components/ItemDiscountModal.tsx - หน้าต่างลดราคาสินค้าต่อรายการ
 * ========================================================
 * ให้ Admin กำหนดส่วนลดพิเศษต่อชิ้นสำหรับลูกค้ารายการนั้นๆ ได้เอง (Default = 0)
 */

import React, { useState, useEffect } from 'react'
import { X, Tag, Percent, Check, RotateCcw } from 'lucide-react'
import type { CartItem } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'

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

  useEffect(() => {
    if (isOpen && item) {
      setDiscountVal((item.discount || 0).toString())
    }
  }, [isOpen, item])

  if (!isOpen || !item) return null

  const originalPrice = item.product.price
  const quantity = item.quantity

  // คำนวณส่วนลดต่อชิ้น (ไม่เกินราคาปกติ และไม่ติดลบ)
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

  // กำหนดส่วนลดเป็นจำนวนเงินตรงๆ
  const setExactDiscount = (amt: number) => {
    const capped = Math.min(originalPrice, Math.max(0, amt))
    setDiscountVal(capped.toString())
  }

  // กำหนดส่วนลดตามเปอร์เซ็นต์
  const setPercentDiscount = (percent: number) => {
    const amt = Math.round((originalPrice * percent) / 100)
    setExactDiscount(amt)
  }

  // กำหนดราคาขายสุทธิ (ระบบจะแปลงเป็นส่วนลดให้)
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
    <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 shadow-2xl safe-bottom max-h-[90vh] overflow-y-auto">
        {/* หัวหน้าต่าง */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-rose-50 text-rose-600 rounded-xl">
              <Tag size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">ลดราคาต่อรายการ</h3>
              <p className="text-xs text-slate-400">กำหนดส่วนลดพิเศษให้ลูกค้า (ค่าเริ่มต้น: 0฿)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* ข้อมูลสินค้าที่กำลังลดราคา */}
        <div className="my-4 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl flex items-center gap-3">
          {item.product.image ? (
            <img
              src={item.product.image}
              alt={item.product.name}
              className="w-12 h-12 rounded-xl object-cover border border-slate-200 shrink-0 bg-white"
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 shrink-0 font-bold text-xs">
              {item.product.category.slice(0, 2)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-slate-900 text-xs truncate">{item.product.name}</h4>
            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
              <span>ราคาปกติ: <strong className="text-slate-800">{SHOP_CONFIG.currency}{originalPrice.toLocaleString()}</strong></span>
              <span>•</span>
              <span>จำนวน: <strong className="text-blue-600">{quantity} ชิ้น</strong></span>
            </div>
          </div>
        </div>

        {/* ช่องใส่ส่วนลดต่อชิ้น */}
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <span>ส่วนลดต่อชิ้น (บาท)</span>
                <span className="text-[10px] font-normal text-slate-400">(Default: 0)</span>
              </label>
              {validDiscount > 0 && (
                <button
                  type="button"
                  onClick={() => setExactDiscount(0)}
                  className="text-[11px] text-slate-400 hover:text-rose-600 flex items-center gap-1 font-semibold"
                >
                  <RotateCcw size={12} />
                  <span>ล้างเป็น 0</span>
                </button>
              )}
            </div>

            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-sm">
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
                className="w-full pl-8 pr-12 py-2.5 bg-white border-2 border-slate-200 rounded-xl text-base font-black text-slate-900 outline-none focus:border-rose-500 transition-colors"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 font-semibold">
                / ชิ้น
              </span>
            </div>
          </div>

          {/* ปุ่มลัดเลือกส่วนลดด่วน (Quick Discount Chips) */}
          <div className="space-y-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              ปุ่มลัดส่วนลด:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setExactDiscount(0)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                  validDiscount === 0
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
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
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all ${
                      isActive
                        ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                        : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
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
                    className={`px-2 py-1 rounded-lg text-xs font-bold border transition-all flex items-center gap-0.5 ${
                      isActive
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <span>{pct}%</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* หรือระบุราคาขายสุทธิหลังลด */}
          <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <span className="text-xs text-slate-500 font-medium">หรือกำหนดราคาขายสุทธิ:</span>
            <div className="flex items-center gap-1">
              <span className="text-xs font-bold text-slate-400">{SHOP_CONFIG.currency}</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max={originalPrice}
                step="any"
                value={finalPricePerUnit}
                onChange={(e) => handleFinalPriceChange(e.target.value)}
                className="w-20 text-right px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-blue-500"
              />
              <span className="text-xs text-slate-400 font-medium">/ชิ้น</span>
            </div>
          </div>
        </div>

        {/* สรุปยอดคำนวณแบบ Real-time */}
        <div className="mt-4 p-3 bg-blue-50/70 border border-blue-100 rounded-2xl text-xs space-y-1.5">
          <div className="flex justify-between text-slate-600">
            <span>ราคาเดิม ({quantity} ชิ้น):</span>
            <span className={validDiscount > 0 ? 'line-through text-slate-400' : 'font-medium'}>
              {SHOP_CONFIG.currency}{totalOriginal.toLocaleString()}
            </span>
          </div>

          {validDiscount > 0 && (
            <div className="flex justify-between text-rose-600 font-bold">
              <span>ส่วนลดทั้งหมด (-{validDiscount}฿ x {quantity}):</span>
              <span>-{SHOP_CONFIG.currency}{totalItemDiscount.toLocaleString()}</span>
            </div>
          )}

          <div className="flex justify-between items-center text-slate-900 font-black border-t border-blue-200/60 pt-1.5">
            <span>ยอดรวมรายการนี้:</span>
            <span className="text-base text-blue-700">
              {SHOP_CONFIG.currency}{totalItemPayable.toLocaleString()}
            </span>
          </div>
        </div>

        {/* ปุ่มยืนยัน / ยกเลิก */}
        <div className="grid grid-cols-2 gap-2 mt-4">
          <button
            type="button"
            onClick={onClose}
            className="py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="py-3 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-1.5"
          >
            <Check size={16} />
            <span>ใช้ส่วนลดนี้</span>
          </button>
        </div>
      </div>
    </div>
  )
}
