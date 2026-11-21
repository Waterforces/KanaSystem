'use client'

import React, { useEffect, useId, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { X, Printer, Copy, Check, Barcode } from 'lucide-react'
import type { Product } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { ModalDialog } from './ModalDialog'

interface BarcodeModalProps {
  product: Product | null
  isOpen: boolean
  onClose: () => void
}

export const BarcodeModal: React.FC<BarcodeModalProps> = ({
  product,
  isOpen,
  onClose,
}) => {
  const [copied, setCopied] = useState(false)
  const barcodeSvgRef = useRef<SVGSVGElement | null>(null)
  const titleId = useId()

  useEffect(() => {
    if (!isOpen || !product) return

    if (barcodeSvgRef.current) {
      try {
        JsBarcode(barcodeSvgRef.current, product.barcode, {
          format: 'CODE128',
          width: 2.7,
          height: 96,
          displayValue: true,
          fontSize: 16,
          margin: 12,
          background: '#ffffff',
          lineColor: '#000000',
        })
      } catch (err) {
        console.error('Error generating barcode:', err)
      }
    }
  }, [isOpen, product])

  if (!isOpen || !product) return null

  const copyBarcode = () => {
    navigator.clipboard.writeText(product.barcode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePrint = () => {
    window.print()
  }

  return (
    <ModalDialog
      isOpen={isOpen}
      onClose={onClose}
      labelledBy={titleId}
      position="bottom-sheet"
      panelClassName="w-full max-w-md md:max-w-lg bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl p-5 md:p-6 shadow-2xl border border-slate-200 dark:border-slate-800 safe-bottom"
    >
      {/* หัวโมดอล */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-xl shrink-0">
            <Barcode aria-hidden="true" size={22} />
          </div>
          <div className="min-w-0">
            <h3 id={titleId} className="font-bold text-slate-900 dark:text-slate-100 text-base md:text-xl truncate">
              {product.name}
            </h3>
            <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400">
              ราคา: {SHOP_CONFIG.currency}{product.price.toLocaleString()} | หมวด: {product.category}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="ปิดหน้าต่างบาร์โค้ด"
          className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
        >
          <X aria-hidden="true" size={20} />
        </button>
      </div>

      {/* พื้นที่แสดง Barcode (คงสีขาวดำเพื่อให้ปืนสแกนและกล้องอ่านได้เสมอแม้เปิดโหมดกลางคืน) */}
      <div
        id="printable-label"
        className="my-5 flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-inner text-slate-900"
      >
        <div className="text-center mb-2">
          <span className="text-[11px] md:text-xs font-medium text-slate-500 uppercase tracking-widest">
            {SHOP_CONFIG.shopName}
          </span>
          <p className="font-bold text-slate-800 text-base md:text-lg">{product.name}</p>
        </div>

        <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200/80 flex items-center justify-center min-h-[160px] w-full overflow-x-auto">
          <svg ref={barcodeSvgRef} className="max-w-full h-auto" />
        </div>

        <p className="font-black text-blue-600 text-xl md:text-2xl mt-2.5">
          {SHOP_CONFIG.currency}{product.price.toLocaleString()}
        </p>
      </div>

      {/* รหัสตัวเลข + ปุ่มคัดลอก */}
      <div className="flex items-center justify-between bg-slate-100 dark:bg-slate-800 px-3.5 py-2.5 rounded-xl mb-4 text-xs md:text-base">
        <span className="text-slate-500 dark:text-slate-400 font-medium">รหัสบาร์โค้ด:</span>
        <div className="flex items-center gap-2">
          <code className="font-mono font-bold text-slate-800 dark:text-slate-100 text-sm md:text-base">
            {product.barcode}
          </code>
          <button
            type="button"
            onClick={copyBarcode}
            aria-label="คัดลอกรหัสบาร์โค้ด"
            className="min-h-10 min-w-10 flex items-center justify-center rounded-lg bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 shadow-xs active:scale-90 transition-transform"
          >
            {copied ? (
              <Check aria-hidden="true" size={16} className="text-emerald-600 dark:text-emerald-400" />
            ) : (
              <Copy aria-hidden="true" size={16} />
            )}
          </button>
        </div>
      </div>

      {/* ปุ่มคำสั่งด้านล่าง */}
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={handlePrint}
          className="flex items-center justify-center gap-2 min-h-11 py-3 bg-slate-900 dark:bg-blue-600 hover:bg-black dark:hover:bg-blue-500 active:scale-95 text-white rounded-xl text-sm md:text-base font-semibold transition-all shadow-md"
        >
          <Printer aria-hidden="true" size={18} />
          <span>พิมพ์ป้ายบาร์โค้ด</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="flex items-center justify-center gap-2 min-h-11 py-3 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 active:scale-95 text-slate-800 dark:text-slate-100 rounded-xl text-sm md:text-base font-semibold transition-all"
        >
          <span>ปิด</span>
        </button>
      </div>
    </ModalDialog>
  )
}
