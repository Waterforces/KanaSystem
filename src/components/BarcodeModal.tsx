/**
 * ========================================================
 * 🏷️ components/BarcodeModal.tsx - แสดง/ดาวน์โหลด/พิมพ์ บาร์โค้ดสินค้า (CODE128)
 * ========================================================
 * วาดบาร์โค้ดแท่งมาตรฐานค้าปลีกด้วย JsBarcode พร้อมสั่งพิมพ์ป้ายสติ๊กเกอร์
 * ขยายขนาดบาร์โค้ดให้ใหญ่ คมชัด สแกนติดง่ายขึ้นทั้งด้วยปืนเลเซอร์และกล้องมือถือ
 */

import React, { useEffect, useRef, useState } from 'react'
import JsBarcode from 'jsbarcode'
import { X, Printer, Copy, Check, Barcode } from 'lucide-react'
import type { Product } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'

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

  useEffect(() => {
    if (!isOpen || !product) return

    // วาด Barcode CODE128 ขนาดใหญ่พิเศษ คมชัด อ่านง่าย
    if (barcodeSvgRef.current) {
      try {
        JsBarcode(barcodeSvgRef.current, product.barcode, {
          format: 'CODE128',
          width: 2.7,        // ขยายความหนาของเส้นบาร์โค้ดจาก 2.2 เป็น 2.7
          height: 96,        // ขยายความสูงของแท่งบาร์โค้ดจาก 75 เป็น 96
          displayValue: true,
          fontSize: 16,      // ขยายขนาดตัวเลขใต้บาร์โค้ด
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

  // คัดลอกรหัสสินค้า
  const copyBarcode = () => {
    navigator.clipboard.writeText(product.barcode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // พิมพ์ป้ายสินค้า (Print Sticker Label)
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-md rounded-t-3xl sm:rounded-2xl bg-white p-5 shadow-2xl safe-bottom">
        {/* หัวโมดอล */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-blue-50 text-blue-600 rounded-xl">
              <Barcode size={22} />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 text-base">{product.name}</h3>
              <p className="text-xs text-slate-500">
                ราคา: {SHOP_CONFIG.currency}{product.price.toLocaleString()} | หมวด: {product.category}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* พื้นที่แสดงรูป Barcode แท่งสำหรับติดสินค้า (ขยายขนาดให้ใหญ่ คมชัด สแกนง่าย) */}
        <div
          id="printable-label"
          className="my-5 flex flex-col items-center justify-center bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-inner"
        >
          <div className="text-center mb-2">
            <span className="text-[11px] font-medium text-slate-400 uppercase tracking-widest">
              {SHOP_CONFIG.shopName}
            </span>
            <p className="font-bold text-slate-800 text-base">{product.name}</p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-200/80 flex items-center justify-center min-h-[160px] w-full overflow-x-auto">
            <svg ref={barcodeSvgRef} className="max-w-full h-auto" />
          </div>

          <p className="font-black text-blue-600 text-xl mt-2.5">
            {SHOP_CONFIG.currency}{product.price.toLocaleString()}
          </p>
        </div>

        {/* รหัสตัวเลข + ปุ่มคัดลอก */}
        <div className="flex items-center justify-between bg-slate-100 px-3.5 py-2.5 rounded-xl mb-4 text-xs">
          <span className="text-slate-500 font-medium">รหัสบาร์โค้ด:</span>
          <div className="flex items-center gap-2">
            <code className="font-mono font-bold text-slate-800 text-sm">
              {product.barcode}
            </code>
            <button
              onClick={copyBarcode}
              className="p-1 rounded bg-white text-slate-600 hover:text-blue-600 shadow-xs active:scale-90 transition-transform"
              title="คัดลอกรหัส"
            >
              {copied ? (
                <Check size={14} className="text-emerald-600" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
        </div>

        {/* ปุ่มคำสั่งด้านล่าง */}
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-black active:scale-95 text-white rounded-xl text-sm font-semibold transition-all shadow-md shadow-slate-900/10"
          >
            <Printer size={16} />
            <span>พิมพ์ป้ายบาร์โค้ด</span>
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center gap-2 py-3 bg-slate-200 hover:bg-slate-300 active:scale-95 text-slate-800 rounded-xl text-sm font-semibold transition-all"
          >
            <span>ปิด</span>
          </button>
        </div>
      </div>
    </div>
  )
}
