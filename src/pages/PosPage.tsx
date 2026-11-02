/**
 * ========================================================
 * 🛒 pages/PosPage.tsx - หน้าขายสินค้าหน้าร้าน (สำหรับ iPhone)
 * ========================================================
 * รองรับการสแกนกล้อง, ปรับลดจำนวน/ยกเลิกรายการเมื่อคิดผิด,
 * ปรับระยะ My Order ลอยสูงขึ้นและเว้นระยะขอบจอ (Padding) ไม่ติด Sidebar/ขอบ
 */

import React, { useState, useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import confetti from 'canvas-confetti'
import {
  Camera,
  Search,
  Plus,
  Minus,
  Trash2,
  ArrowRight,
  CheckCircle2,
  X,
  CreditCard,
  Banknote,
  Barcode,
  RotateCcw,
  ShoppingBag,
  Package,
  Settings,
  Tag,
  RefreshCw,
} from 'lucide-react'
import { db } from '../db/database'
import type { Product, CartItem, SaleOrder } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { sound } from '../utils/audio'
import { CameraScanner } from '../components/CameraScanner'
import { ItemDiscountModal } from '../components/ItemDiscountModal'
import { syncOrderToGoogleSheet, syncAllDataFromGoogleSheet, getLocalIsoDate } from '../utils/googleSheetSync'
import { useProductCategories } from '../utils/categoryHelper'
import type { NavTab } from '../components/BottomNav'

interface PosPageProps {
  cart: CartItem[]
  setCart: React.Dispatch<React.SetStateAction<CartItem[]>>
  onNavigate: (tab: NavTab) => void
  isScannerOpen: boolean
  setIsScannerOpen: (open: boolean) => void
}

export const PosPage: React.FC<PosPageProps> = ({
  cart,
  setCart,
  onNavigate,
  isScannerOpen,
  setIsScannerOpen,
}) => {
  // ดึงรายการสินค้าทั้งหมดแบบ Real-time จาก Dexie
  const products = useLiveQuery(() => db.products.toArray()) || []
  const categories = useProductCategories()

  // สถานะการค้นหา
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด')

  // สถานะหน้าจอตรวจสอบตะกร้าและคิดเงิน
  const [isCartModalOpen, setIsCartModalOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'PROMPTPAY' | 'THAI_CHUEY_THAI'>('CASH')
  const [cashReceived, setCashReceived] = useState<string>('')
  const [lastOrderSuccess, setLastOrderSuccess] = useState<SaleOrder | null>(null)
  // สถานะสินค้าที่กำลังเปิดหน้าต่างลดราคาต่อรายการ
  const [editingDiscountItem, setEditingDiscountItem] = useState<CartItem | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      await syncAllDataFromGoogleSheet()
    } finally {
      setTimeout(() => setIsSyncing(false), 600)
    }
  }

  // ดึงการตั้งค่าเปิด/ปิด ช่องทางไทยช่วยไทย (ลูกค้าจ่าย 40%)
  const [enableThaiChueyThai, setEnableThaiChueyThai] = useState<boolean>(() => {
    const saved = localStorage.getItem('kana_enable_thai_chuey_thai')
    return saved === null ? true : saved === 'true'
  })

  React.useEffect(() => {
    const handleSettingsUpdate = () => {
      const saved = localStorage.getItem('kana_enable_thai_chuey_thai')
      setEnableThaiChueyThai(saved === null ? true : saved === 'true')
    }
    window.addEventListener('kana_settings_updated', handleSettingsUpdate)
    window.addEventListener('storage', handleSettingsUpdate)
    return () => {
      window.removeEventListener('kana_settings_updated', handleSettingsUpdate)
      window.removeEventListener('storage', handleSettingsUpdate)
    }
  }, [])

  // คำนวณยอดเงินรวมราคาปกติก่อนลด
  const originalTotalAmount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
  }, [cart])

  // คำนวณส่วนลดสินค้ารวมทั้งหมดในบิล
  const totalItemDiscount = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.discount || 0) * item.quantity, 0)
  }, [cart])

  // คำนวณยอดเงินขายจริงหลังหักส่วนลดสินค้าต่อรายการ
  const totalAmount = useMemo(() => {
    return cart.reduce((sum, item) => {
      const effPrice = Math.max(0, item.product.price - (item.discount || 0))
      return sum + effPrice * item.quantity
    }, 0)
  }, [cart])

  const totalCost = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.cost * item.quantity, 0)
  }, [cart])

  const totalItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0)
  }, [cart])

  // คำนวณยอดที่ลูกค้าต้องจ่ายจริง (กรณีไทยช่วยไทย จ่าย 40%)
  const isThaiChueyThai = paymentMethod === 'THAI_CHUEY_THAI'
  const payableAmount = useMemo(() => {
    if (isThaiChueyThai) {
      return Math.round(totalAmount * 0.4 * 100) / 100
    }
    return totalAmount
  }, [totalAmount, isThaiChueyThai])

  const subsidyAmount = useMemo(() => {
    if (isThaiChueyThai) {
      return Math.round((totalAmount - payableAmount) * 100) / 100
    }
    return 0
  }, [totalAmount, payableAmount, isThaiChueyThai])

  // คำนวณเงินทอน (กรณีไทยช่วยไทย จะมีแต่จ่ายพอดีเท่านั้น ไม่มีเงินทอน)
  const receivedNum = parseFloat(cashReceived) || 0
  const changeAmount =
    paymentMethod === 'PROMPTPAY' || paymentMethod === 'THAI_CHUEY_THAI'
      ? 0
      : Math.max(0, receivedNum - payableAmount)
  const isCashEnough =
    paymentMethod === 'PROMPTPAY' ||
    paymentMethod === 'THAI_CHUEY_THAI' ||
    receivedNum >= payableAmount

  // กรองสินค้าตามหมวดหมู่และคำค้นหา
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchCategory =
        selectedCategory === 'ทั้งหมด' || p.category === selectedCategory
      const matchSearch =
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.barcode.toLowerCase().includes(searchTerm.toLowerCase())
      return matchCategory && matchSearch
    })
  }, [products, selectedCategory, searchTerm])

  // เพิ่มสินค้าลงตะกร้า (+1) พร้อมตรวจสอบสต็อกคงเหลือ และตั้งค่าเริ่มต้นส่วนลด = 0 (Set default = 0)
  const addToCart = (product: Product) => {
    if (product.stock <= 0) {
      sound.playErrorTone()
      alert(`สินค้า "${product.name}" หมดสต็อกในคลังแล้ว`)
      return
    }

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.barcode === product.barcode)
      if (existing) {
        if (existing.quantity >= product.stock) {
          sound.playErrorTone()
          alert(`สินค้า "${product.name}" มีคงเหลือในคลังเพียง ${product.stock} ชิ้น ไม่สามารถเพิ่มเกินจำนวนคงเหลือได้`)
          return prevCart
        }
        return prevCart.map((item) =>
          item.product.barcode === product.barcode
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      } else {
        return [...prevCart, { product, quantity: 1, discount: 0 }]
      }
    })
  }

  // ปรับส่วนลดต่อรายการสำหรับลูกค้า (Admin ใส่ค่าได้เอง Default = 0)
  const updateItemDiscount = (barcode: string, discountPerPiece: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.barcode === barcode
          ? { ...item, discount: Math.max(0, discountPerPiece) }
          : item
      )
    )
  }

  // ลดจำนวนสินค้าลง (-1) หรือเอาออกจากตะกร้าเมื่อเหลือ 0
  const decreaseQuantity = (barcode: string) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.barcode === barcode) {
            return { ...item, quantity: item.quantity - 1 }
          }
          return item
        })
        .filter((item) => item.quantity > 0)
    )
  }

  // ลบสินค้าชิ้นนั้นออกจากตะกร้าทันที
  const removeFromCart = (barcode: string) => {
    setCart((prev) => prev.filter((item) => item.product.barcode !== barcode))
  }

  // ยกเลิกรายการสินค้าทั้งหมดในตะกร้า (ล้างตะกร้า)
  const handleClearCart = () => {
    if (cart.length === 0) return
    if (confirm('คุณต้องการยกเลิกและล้างสินค้าทั้งหมดในตะกร้าใช่หรือไม่?')) {
      setCart([])
      setIsCartModalOpen(false)
      setIsCheckoutOpen(false)
    }
  }

  // จัดการเมื่อกล้องสแกนพบ Barcode / QR
  const handleScanSuccess = (barcodeText: string) => {
    const trimmed = barcodeText.trim()
    const product = products.find((p) => p.barcode === trimmed)

    if (product) {
      addToCart(product)
      setIsScannerOpen(false)
    } else {
      sound.playErrorTone()
      alert(`ไม่พบสินค้าที่มีรหัส "${trimmed}" ในระบบ`)
    }
  }

  // บันทึกการขายและตัดสต็อก (พร้อมป้องกัน Double-tap และตรวจสต็อกสด)
  const handleCompleteOrder = async () => {
    if (isSubmittingOrder || cart.length === 0 || !isCashEnough) return

    setIsSubmittingOrder(true)

    // 🛡️ BS-06: ตรวจสอบสต็อกคงเหลือจริงล่าสุดจากคลัง (IndexedDB) ก่อนตัดบิลเสมอ
    for (const item of cart) {
      if (item.product.id) {
        const liveProd = await db.products.get(item.product.id)
        if (!liveProd) {
          alert(`ไม่พบสินค้า "${item.product.name}" ในระบบแล้ว (อาจถูกลบจากเครื่องอื่น)`)
          setIsSubmittingOrder(false)
          return
        }
        if (liveProd.stock < item.quantity) {
          alert(`สินค้า "${liveProd.name}" สต็อกไม่พอสำหรับคำสั่งซื้อนี้!\n(คงเหลือในคลัง ${liveProd.stock} ชิ้น, ในตะกร้ามี ${item.quantity} ชิ้น)`)
          setIsSubmittingOrder(false)
          return
        }
      }
    }

    const now = new Date()
    const dateStr = getLocalIsoDate(now)
    const monthStr = dateStr.slice(0, 7)
    const pad = (n: number) => String(n).padStart(2, '0')
    const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
    const rand = Math.floor(1000 + Math.random() * 9000)
    const orderNo = `ORD-${dateStr.replace(/-/g, '')}-${timeStr}-${rand}`

    const orderData: SaleOrder = {
      orderNo,
      items: cart.map((c) => {
        const disc = c.discount || 0
        const finalPrice = Math.max(0, c.product.price - disc)
        return {
          productId: c.product.id,
          barcode: c.product.barcode,
          name: c.product.name,
          price: c.product.price,
          cost: c.product.cost,
          quantity: c.quantity,
          discount: disc,
          subtotal: finalPrice * c.quantity,
        }
      }),
      originalTotal: originalTotalAmount,
      itemDiscountTotal: totalItemDiscount,
      totalAmount,
      totalCost,
      profit: totalAmount - totalCost,
      cashReceived:
        paymentMethod === 'PROMPTPAY' || paymentMethod === 'THAI_CHUEY_THAI'
          ? payableAmount
          : receivedNum,
      change: changeAmount,
      paymentMethod,
      customerPaid: payableAmount,
      discountAmount: subsidyAmount,
      createdAt: now.getTime(),
      dateStr,
      monthStr,
    }

    try {
      // 1. บันทึกบิลลงตาราง orders
      await db.orders.add(orderData)

      // 2. ตัดสต็อกสินค้าในตาราง products
      for (const item of cart) {
        if (item.product.id) {
          const currentProd = await db.products.get(item.product.id)
          if (currentProd) {
            const newStock = Math.max(0, currentProd.stock - item.quantity)
            await db.products.update(item.product.id, { stock: newStock })
          }
        }
      }

      // 3. ส่งบิลเข้า Google Sheets อัตโนมัติในพื้นหลัง (พร้อมระบบคิว & ดักจับกรณีสินค้าหมด)
      syncOrderToGoogleSheet(orderData).then(async (res) => {
        if (res && res.errorType === 'OUT_OF_STOCK') {
          sound.playErrorTone()
          alert(`⚠️ ไม่สามารถบันทึกบิล ${orderData.orderNo} ได้:\n${res.message || 'สินค้าหมดในคลัง (ถูกขายจากเครื่องอื่นแล้ว)'}\n\nระบบจะทำการยกเลิกบิลนี้และรีเฟรชสต็อกจริงอัตโนมัติ`)

          // Rollback ลบบิลนี้ออกจากเครื่อง
          await db.orders.where('orderNo').equals(orderData.orderNo).delete()

          // ดึงข้อมูลสต็อกล่าสุดจาก Google Sheets กลับมาอัปเดตหน้าจอทันที
          await syncAllDataFromGoogleSheet()
        }
      }).catch((e) => console.warn('Background sync order error:', e))

      // เล่นเสียงยินดี + เอฟเฟกต์พลุ
      sound.playSuccessChime()
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
      })

      // รีเซ็ตหน้าจอ
      setLastOrderSuccess(orderData)
      setCart([])
      setIsCheckoutOpen(false)
      setIsCartModalOpen(false)
      setCashReceived('')
    } catch (err) {
      console.error('Failed to save order:', err)
      alert('เกิดข้อผิดพลาดในการบันทึกบิลขาย')
    } finally {
      setIsSubmittingOrder(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 overflow-hidden relative">
      {/* ส่วนหัวของหน้าจอ (iPhone Header) */}
      <header className="bg-white border-b border-slate-200 px-4 pb-3 safe-top shrink-0 shadow-xs">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight">
              {SHOP_CONFIG.shopName}
            </h1>
            <p className="text-[11px] text-slate-500 font-medium">
              {SHOP_CONFIG.shopSubtitle}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* ปุ่มล้างตะกร้าด่วน หากมีสินค้าในตะกร้า */}
            {cart.length > 0 && (
              <button
                onClick={handleClearCart}
                className="flex items-center gap-1 px-2.5 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-semibold active:scale-95 transition-all"
                title="ยกเลิกสินค้าทั้งหมดในตะกร้า"
              >
                <RotateCcw size={14} />
                <span>ล้าง</span>
              </button>
            )}

            {/* ปุ่มดึงข้อมูลล่าสุดจาก Google Sheets */}
            <button
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-all border border-slate-200 shadow-2xs"
              title="ดึงข้อมูลล่าสุดจาก Google Sheets"
            >
              <RefreshCw size={17} className={isSyncing ? 'animate-spin text-blue-600' : ''} />
            </button>

            {/* ปุ่มคลังสินค้า (รูปกล่อง) */}
            <button
              onClick={() => onNavigate('products')}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-all border border-slate-200 shadow-2xs"
              title="คลังสินค้า"
            >
              <Package size={18} />
            </button>

            {/* ปุ่มตั้งค่าระบบ (รูปฟันเฟือง) */}
            <button
              onClick={() => onNavigate('settings')}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 transition-all border border-slate-200 shadow-2xs"
              title="ตั้งค่าระบบ"
            >
              <Settings size={18} />
            </button>
          </div>
        </div>

        {/* ช่องค้นหาสินค้า */}
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={16}
          />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="ค้นหาชื่อสินค้า หรือ รหัสบาร์โค้ด..."
            className="w-full pl-9 pr-8 py-2 bg-slate-100 rounded-xl text-xs text-slate-800 placeholder-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* แถบเลื่อนเลือกหมวดหมู่สินค้า (Pill Tabs) */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pt-2.5">
          <button
            onClick={() => setSelectedCategory('ทั้งหมด')}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              selectedCategory === 'ทั้งหมด'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                selectedCategory === cat
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </header>

      {/* พื้นที่แสดงรายการสินค้า พร้อม padding-bottom เพิ่มขึ้นเป็น pb-44 เพื่อไม่ให้ My Order บังรายการล่างสุด */}
      <main className="flex-1 overflow-y-auto p-3.5 pb-44 space-y-3">
        {filteredProducts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Barcode size={48} strokeWidth={1.5} className="mb-2 text-slate-300" />
            <p className="text-sm font-medium">ไม่พบสินค้าในรายการนี้</p>
            <p className="text-xs text-slate-400 mt-0.5">
              กดปุ่มสแกน หรือไปที่เมนู "คลังสินค้า" เพื่อเพิ่มสินค้า
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2.5">
            {filteredProducts.map((p) => {
              const inCartItem = cart.find((c) => c.product.barcode === p.barcode)
              return (
                <div
                  key={p.barcode}
                  className={`flex flex-col justify-between text-left p-3 rounded-2xl border transition-all ${
                    inCartItem
                      ? 'bg-blue-50/90 border-blue-400 shadow-xs'
                      : 'bg-white border-slate-200/80 shadow-2xs'
                  }`}
                >
                  {/* รูปภาพสินค้า (ถ้ามี) */}
                  {p.image && (
                    <div
                      onClick={() => addToCart(p)}
                      className="w-full h-24 mb-2 rounded-xl overflow-hidden bg-slate-100 shrink-0 cursor-pointer"
                    >
                      <img
                        src={p.image}
                        alt={p.name}
                        className="w-full h-full object-cover active:scale-95 transition-transform"
                      />
                    </div>
                  )}

                  <div onClick={() => addToCart(p)} className="cursor-pointer">
                    <span className="text-[10px] font-mono font-medium text-slate-400 block truncate">
                      {p.barcode}
                    </span>
                    <h3 className="font-bold text-slate-800 text-xs line-clamp-2 mt-0.5">
                      {p.name}
                    </h3>
                  </div>

                  <div className="flex items-end justify-between mt-3 pt-1 border-t border-slate-100/80">
                    <div onClick={() => addToCart(p)} className="cursor-pointer">
                      <span className="text-[10px] text-slate-400 block">
                        คงเหลือ {p.stock}
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-sm font-black text-blue-600">
                          {SHOP_CONFIG.currency}
                          {inCartItem && inCartItem.discount && inCartItem.discount > 0
                            ? (p.price - inCartItem.discount).toLocaleString()
                            : p.price.toLocaleString()}
                        </span>
                        {inCartItem && inCartItem.discount && inCartItem.discount > 0 && (
                          <span className="text-[9px] px-1 py-0.2 rounded bg-rose-100 text-rose-700 font-bold">
                            ลด ฿{inCartItem.discount}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* ปุ่มเพิ่ม/ลดจำนวนสินค้าหน้าการ์ด (สามารถกดลดได้ทันทีเมื่อคิดผิด) */}
                    {inCartItem ? (
                      <div className="flex items-center gap-1 bg-white border border-blue-300 rounded-xl p-0.5 shadow-xs">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            decreaseQuantity(p.barcode)
                          }}
                          className="h-6 w-6 rounded-lg bg-blue-100 hover:bg-blue-200 flex items-center justify-center text-blue-800 active:scale-90 transition-transform"
                          title="ลดจำนวนสินค้า"
                        >
                          <Minus size={13} strokeWidth={2.5} />
                        </button>
                        <span className="font-extrabold text-xs text-blue-700 min-w-4 text-center">
                          {inCartItem.quantity}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            addToCart(p)
                          }}
                          className="h-6 w-6 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white active:scale-90 transition-transform"
                          title="เพิ่มจำนวนสินค้า"
                        >
                          <Plus size={13} strokeWidth={2.5} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addToCart(p)}
                        className="flex h-7 w-7 items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-90 transition-transform"
                        title="เพิ่มลงตะกร้า"
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>

      {/* แถบ My Order สรุปยอดขาย (ยกตำแหน่งให้สูงขึ้นเหนือเมนูล่าง + ขยายระยะขอบไม่ติดข้าง) */}
      {cart.length > 0 && (
        <div
          className="fixed left-4 right-4 z-30 animate-in slide-in-from-bottom duration-200"
          style={{ bottom: 'calc(74px + max(env(safe-area-inset-bottom), 14px))' }}
        >
          <div className="bg-slate-900/95 backdrop-blur-md text-white px-4 py-3.5 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center justify-between gap-3">
            {/* แตะด้านซ้ายเพื่อเปิดดู/แก้ไขรายการสินค้าในตะกร้า (My Order) */}
            <div
              onClick={() => setIsCartModalOpen(true)}
              className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
            >
              <div className="relative shrink-0">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 font-black text-sm text-white shadow-md">
                  {totalItemCount}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-blue-400">
                    My Order
                  </span>
                  <span className="text-[10px] text-slate-400">
                    ({cart.length} รายการ)
                  </span>
                </div>
                <p className="text-lg font-black text-white leading-tight truncate">
                  {SHOP_CONFIG.currency}
                  {totalAmount.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* ปุ่มดูรายการตะกร้า */}
              <button
                onClick={() => setIsCartModalOpen(true)}
                className="p-2.5 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 rounded-xl text-xs font-semibold transition-all border border-slate-700"
                title="ดูรายการสั่งซื้อ"
              >
                <ShoppingBag size={18} />
              </button>

              {/* ปุ่มไปคิดเงิน */}
              <button
                onClick={() => setIsCheckoutOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl font-bold text-xs shadow-lg shadow-blue-600/30 transition-all"
              >
                <span>คิดเงิน</span>
                <ArrowRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* โมดอลดู/แก้ไขรายการในตะกร้า (Cart Review Sheet สำหรับแก้เมื่อคิดผิด) */}
      {isCartModalOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col shadow-2xl safe-bottom">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShoppingBag className="text-blue-600" size={20} />
                <h2 className="font-black text-slate-900 text-base">My Order (รายการในตะกร้า)</h2>
                <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-bold">
                  {totalItemCount} ชิ้น
                </span>
              </div>
              <button
                onClick={() => setIsCartModalOpen(false)}
                className="p-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            {/* รายการสินค้าที่สามารถ กดลด/เพิ่ม หรือ ลบทีละตัวได้ */}
            <div className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-slate-100 max-h-72">
              {cart.map((item) => (
                <div key={item.product.barcode} className="py-3 flex items-center justify-between gap-3">
                  {item.product.image && (
                    <img
                      src={item.product.image}
                      alt={item.product.name}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0 bg-slate-50"
                    />
                  )}
                  <div className="flex-1 min-w-0 pr-1">
                    <p className="font-bold text-slate-800 text-xs truncate">{item.product.name}</p>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      {item.discount && item.discount > 0 ? (
                        <>
                          <span className="line-through text-slate-300 mr-1">{SHOP_CONFIG.currency}{item.product.price}</span>
                          <span className="text-slate-800 font-bold">{SHOP_CONFIG.currency}{item.product.price - item.discount}</span>
                        </>
                      ) : (
                        `${SHOP_CONFIG.currency}${item.product.price}`
                      )}
                      {' '}x {item.quantity} ={' '}
                      <span className="text-blue-600 font-bold">
                        {SHOP_CONFIG.currency}
                        {((item.product.price - (item.discount || 0)) * item.quantity).toLocaleString()}
                      </span>
                    </p>

                    {/* ปุ่มเปิดหน้าต่างลดราคาต่อรายการ (Admin ใส่ค่าได้เอง Default = 0) */}
                    <div className="mt-1">
                      {item.discount && item.discount > 0 ? (
                        <button
                          type="button"
                          onClick={() => setEditingDiscountItem(item)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-bold text-[10px] active:scale-95 transition-all"
                        >
                          <Tag size={10} className="text-rose-500" />
                          <span>ลด ฿{item.discount}/ชิ้น (-฿{item.discount * item.quantity})</span>
                          <span className="text-[9px] text-rose-500 underline ml-0.5">แก้</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setEditingDiscountItem(item)}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 font-semibold text-[10px] border border-dashed border-slate-300 active:scale-95 transition-all"
                        >
                          <Tag size={10} className="text-slate-400" />
                          <span>ลดราคา (0฿)</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* ปุ่มลดจำนวน (-) */}
                    <button
                      onClick={() => decreaseQuantity(item.product.barcode)}
                      className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200"
                      title="ลดจำนวน"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="font-black text-xs w-6 text-center">
                      {item.quantity}
                    </span>
                    {/* ปุ่มเพิ่มจำนวน (+) */}
                    <button
                      onClick={() => addToCart(item.product)}
                      className="h-8 w-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 active:bg-slate-200"
                      title="เพิ่มจำนวน"
                    >
                      <Plus size={14} />
                    </button>
                    {/* ปุ่มยกเลิกสินค้านี้ (ลบทิ้ง) */}
                    <button
                      onClick={() => removeFromCart(item.product.barcode)}
                      className="ml-1 text-rose-500 p-2 hover:bg-rose-50 rounded-lg active:scale-90"
                      title="ยกเลิกสินค้านี้"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* แถบล่างของตะกร้า: ล้างทั้งหมด หรือ ไปคิดเงิน */}
            <div className="p-5 bg-slate-50 border-t border-slate-100 space-y-3">
              <div className="space-y-1 pb-1">
                {totalItemDiscount > 0 && (
                  <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>ยอดรวมปกติ:</span>
                    <span className="line-through">{SHOP_CONFIG.currency}{originalTotalAmount.toLocaleString()}</span>
                  </div>
                )}
                {totalItemDiscount > 0 && (
                  <div className="flex justify-between items-center text-xs text-rose-600 font-bold">
                    <span>ส่วนลดสินค้ารวม:</span>
                    <span>-{SHOP_CONFIG.currency}{totalItemDiscount.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t border-slate-200/60">
                  <span className="text-xs font-bold text-slate-700">ยอดสุทธิ:</span>
                  <span className="text-xl font-black text-slate-900">
                    {SHOP_CONFIG.currency}
                    {totalAmount.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  onClick={handleClearCart}
                  className="flex items-center justify-center gap-1.5 py-3.5 bg-rose-50 hover:bg-rose-100 active:scale-95 text-rose-600 rounded-xl text-xs font-bold transition-all"
                >
                  <Trash2 size={15} />
                  <span>ยกเลิกบิลทั้งหมด</span>
                </button>

                <button
                  onClick={() => {
                    setIsCartModalOpen(false)
                    setIsCheckoutOpen(true)
                  }}
                  className="flex items-center justify-center gap-1.5 py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs font-bold shadow-md shadow-blue-500/20 transition-all"
                >
                  <span>ไปหน้าคิดเงิน</span>
                  <ArrowRight size={15} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* โมดอลชำระเงินและคิดเงินทอน (Checkout Sheet) */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="bg-white rounded-t-3xl max-h-[90vh] flex flex-col shadow-2xl safe-bottom">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <h2 className="font-black text-slate-900 text-base">คิดเงิน & ชำระเงิน</h2>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-xs font-semibold">
                  {totalItemCount} ชิ้น
                </span>
              </div>
              <button
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1.5 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-4 sm:p-5 bg-slate-50 space-y-3.5 flex-1 overflow-y-auto">
              {/* รายการสินค้าในบิล พร้อมปุ่มลดราคาต่อรายการ (หน้าลดราคาอยู่หลังหน้าคิดเงิน) */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-3 shadow-2xs">
                <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-slate-100">
                  <div className="flex items-center gap-1.5 text-slate-700">
                    <Tag size={13} className="text-rose-500" />
                    <span className="text-xs font-bold">รายการสินค้า & ส่วนลด ({cart.length} รายการ)</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-medium">
                    แตะปุ่มเพื่อใส่ส่วนลด
                  </span>
                </div>

                <div className="divide-y divide-slate-100 max-h-44 overflow-y-auto pr-1">
                  {cart.map((item) => {
                    const hasDiscount = !!(item.discount && item.discount > 0)
                    const effPrice = Math.max(0, item.product.price - (item.discount || 0))
                    const itemSubtotal = effPrice * item.quantity

                    return (
                      <div
                        key={item.product.barcode}
                        className="py-2 flex items-center justify-between gap-2"
                      >
                        <div className="flex-1 min-w-0 pr-1">
                          <p className="font-bold text-slate-800 text-xs truncate">
                            {item.product.name}
                          </p>
                          <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                            {hasDiscount ? (
                              <>
                                <span className="line-through text-slate-300 mr-1">
                                  {SHOP_CONFIG.currency}{item.product.price}
                                </span>
                                <span className="text-slate-800 font-bold">
                                  {SHOP_CONFIG.currency}{effPrice}
                                </span>
                              </>
                            ) : (
                              `${SHOP_CONFIG.currency}${item.product.price}`
                            )}
                            {' '}x {item.quantity} ={' '}
                            <span className="text-blue-600 font-bold">
                              {SHOP_CONFIG.currency}{itemSubtotal.toLocaleString()}
                            </span>
                          </p>
                        </div>

                        {/* ปุ่มเปิดหน้าลดราคาต่อรายการ */}
                        <button
                          type="button"
                          onClick={() => setEditingDiscountItem(item)}
                          className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 flex items-center gap-1 border ${
                            hasDiscount
                              ? 'bg-rose-50 border-rose-300 text-rose-700 shadow-2xs'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          <Tag size={12} className={hasDiscount ? 'text-rose-600' : 'text-slate-400'} />
                          <span>
                            {hasDiscount
                              ? `ลด ฿${item.discount}`
                              : 'ลดราคา (0฿)'}
                          </span>
                        </button>
                      </div>
                    )
                  })}
                </div>

                {/* สรุปส่วนลดของทั้งบิล (ถ้ามี) */}
                {totalItemDiscount > 0 && (
                  <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-rose-700 bg-rose-50/60 px-2.5 py-1.5 rounded-xl">
                    <span>รวมส่วนลดสินค้าทั้งหมด:</span>
                    <span className="font-black">-{SHOP_CONFIG.currency}{totalItemDiscount.toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* เลือกวิธีชำระเงิน: เงินสด / พร้อมเพย์ / ไทยช่วยไทย (ถ้าเปิดใน Setting) */}
              <div className={`grid ${enableThaiChueyThai ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('CASH')
                    setCashReceived('')
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-bold transition-all ${
                    paymentMethod === 'CASH'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <Banknote size={16} />
                  <span>เงินสด</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setPaymentMethod('PROMPTPAY')
                    setCashReceived(totalAmount.toString())
                  }}
                  className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 py-2.5 px-2 rounded-xl border text-xs font-bold transition-all ${
                    paymentMethod === 'PROMPTPAY'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <CreditCard size={16} />
                  <span>PromptPay</span>
                </button>

                {enableThaiChueyThai && (
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentMethod('THAI_CHUEY_THAI')
                      const pay40 = Math.round(totalAmount * 0.4 * 100) / 100
                      setCashReceived(pay40.toString())
                    }}
                    className={`flex flex-col items-center justify-center gap-0.5 py-2 px-1 rounded-xl border text-xs font-bold transition-all ${
                      paymentMethod === 'THAI_CHUEY_THAI'
                        ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                        : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <span className="text-xs">🇹🇭</span>
                      <span className="text-[11px] font-black">ไทยช่วยไทย</span>
                    </div>
                    <span className={`text-[9px] px-1 rounded-full font-bold ${
                      paymentMethod === 'THAI_CHUEY_THAI' ? 'bg-amber-600 text-white' : 'bg-amber-200/70 text-amber-900'
                    }`}>
                      ลูกค้าจ่าย 40%
                    </span>
                  </button>
                )}
              </div>

              {/* กรณีเงินสดปกติ: รับเงินด่วน + คำนวณเงินทอน */}
              {paymentMethod === 'CASH' && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-slate-600">รับเงินมา:</span>
                    <input
                      type="number"
                      inputMode="decimal"
                      value={cashReceived}
                      onChange={(e) => setCashReceived(e.target.value)}
                      placeholder="0.00"
                      className="w-32 text-right px-3 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold text-slate-900 outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                    <button
                      onClick={() => setCashReceived(totalAmount.toString())}
                      className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-blue-600 active:bg-blue-50 shrink-0"
                    >
                      พอดี ({totalAmount})
                    </button>
                    {SHOP_CONFIG.quickCashAmounts.map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setCashReceived(amt.toString())}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 active:bg-slate-100 shrink-0"
                      >
                        {amt}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-medium text-slate-500">เงินทอน:</span>
                    <span
                      className={`text-base font-black ${
                        changeAmount >= 0 ? 'text-emerald-600' : 'text-rose-500'
                      }`}
                    >
                      {SHOP_CONFIG.currency}
                      {changeAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* กรณีไทยช่วยไทย (ลูกค้าจ่าย 40% พอดีเท่านั้น) */}
              {paymentMethod === 'THAI_CHUEY_THAI' && (
                <div className="p-3.5 bg-amber-50/90 border border-amber-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-600">ยอดรวมราคาสินค้า:</span>
                    <span className="font-semibold text-slate-800">
                      {SHOP_CONFIG.currency}{totalAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-amber-700 font-medium">
                    <span>โครงการช่วยจ่าย (60%):</span>
                    <span className="font-bold">
                      -{SHOP_CONFIG.currency}{subsidyAmount.toLocaleString()}
                    </span>
                  </div>
                  <div className="pt-2 border-t border-amber-200 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-amber-900 block">
                        ยอดที่ลูกค้าชำระ (40% พอดี):
                      </span>
                      <span className="text-[10px] text-amber-600 font-medium">
                        *รับชำระยอดพอดีเท่านั้น (ไม่มีเงินทอน)
                      </span>
                    </div>
                    <span className="text-xl font-black text-amber-700">
                      {SHOP_CONFIG.currency}{payableAmount.toLocaleString()}
                    </span>
                  </div>
                </div>
              )}

              {/* ยอดเงินรวมและปุ่มยืนยันชำระเงิน */}
              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 block">
                    {paymentMethod === 'THAI_CHUEY_THAI' ? 'ยอดที่ลูกค้าชำระ (40%)' : 'ยอดสุทธิ'}
                  </span>
                  <span className={`text-xl font-black ${paymentMethod === 'THAI_CHUEY_THAI' ? 'text-amber-600' : 'text-slate-900'}`}>
                    {SHOP_CONFIG.currency}
                    {payableAmount.toLocaleString()}
                  </span>
                </div>

                <button
                  onClick={handleCompleteOrder}
                  disabled={!isCashEnough || isSubmittingOrder}
                  className={`px-6 py-3.5 rounded-xl font-bold text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                    isCashEnough && !isSubmittingOrder
                      ? paymentMethod === 'THAI_CHUEY_THAI'
                        ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                        : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                      : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                  }`}
                >
                  {isSubmittingOrder ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/60 border-t-white rounded-full animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    'บันทึกการขาย'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ป็อปอัปแจ้งเตือนคิดเงินสำเร็จ */}
      {lastOrderSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-white rounded-3xl p-5 text-center shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-3">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="font-bold text-slate-900 text-base">บันทึกการขายสำเร็จ</h3>
            <p className="text-xs font-mono text-slate-400 mt-0.5">
              {lastOrderSuccess.orderNo}
            </p>

            <div className="my-3 py-2 bg-slate-50 rounded-xl text-xs space-y-1">
              <div className="flex justify-between px-3 text-slate-600">
                <span>วิธีชำระ:</span>
                <span className="font-bold text-slate-800">
                  {lastOrderSuccess.paymentMethod === 'THAI_CHUEY_THAI'
                    ? 'ไทยช่วยไทย'
                    : lastOrderSuccess.paymentMethod === 'CASH'
                    ? 'เงินสด'
                    : 'PromptPay'}
                </span>
              </div>
              <div className="flex justify-between px-3 text-slate-600">
                <span>ยอดเงินรวมสินค้า:</span>
                <span className="font-bold">
                  {SHOP_CONFIG.currency}
                  {lastOrderSuccess.totalAmount.toLocaleString()}
                </span>
              </div>
              {lastOrderSuccess.itemDiscountTotal && lastOrderSuccess.itemDiscountTotal > 0 && (
                <div className="flex justify-between px-3 text-rose-600 font-semibold">
                  <span>ส่วนลดสินค้า:</span>
                  <span>
                    -{SHOP_CONFIG.currency}
                    {lastOrderSuccess.itemDiscountTotal.toLocaleString()}
                  </span>
                </div>
              )}
              {lastOrderSuccess.paymentMethod === 'THAI_CHUEY_THAI' && (
                <>
                  <div className="flex justify-between px-3 text-amber-600 font-semibold">
                    <span>โครงการช่วย (60%):</span>
                    <span>
                      -{SHOP_CONFIG.currency}
                      {(lastOrderSuccess.discountAmount || lastOrderSuccess.totalAmount * 0.6).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 text-amber-800 font-bold border-t border-slate-200/60 pt-1">
                    <span>ลูกค้าชำระ (40% พอดี):</span>
                    <span>
                      {SHOP_CONFIG.currency}
                      {(lastOrderSuccess.customerPaid || lastOrderSuccess.totalAmount * 0.4).toLocaleString()}
                    </span>
                  </div>
                </>
              )}
              {lastOrderSuccess.paymentMethod === 'CASH' && (
                <>
                  <div className="flex justify-between px-3 text-slate-600">
                    <span>รับเงินมา:</span>
                    <span className="font-medium">
                      {SHOP_CONFIG.currency}
                      {lastOrderSuccess.cashReceived.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 text-emerald-700 font-bold border-t border-slate-200 pt-1">
                    <span>เงินทอน:</span>
                    <span>
                      {SHOP_CONFIG.currency}
                      {lastOrderSuccess.change.toLocaleString()}
                    </span>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setLastOrderSuccess(null)}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all"
            >
              ขายรายการต่อไป
            </button>
          </div>
        </div>
      )}

      {/* โมดอลกล้องสแกน Barcode / QR */}
      <CameraScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* หน้าต่างสำหรับลดราคาให้ลูกค้าต่อรายการ (Admin ใส่ค่าได้เอง Default = 0) */}
      <ItemDiscountModal
        item={editingDiscountItem}
        isOpen={!!editingDiscountItem}
        onClose={() => setEditingDiscountItem(null)}
        onSaveDiscount={updateItemDiscount}
      />
    </div>
  )
}
