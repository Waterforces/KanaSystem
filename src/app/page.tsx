'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useLiveQuery } from 'dexie-react-hooks'
import confetti from 'canvas-confetti'
import {
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
  MapPin,
} from 'lucide-react'
import { db } from '../db/database'
import type { Product, CartItem, SaleOrder } from '../types'
import { SHOP_CONFIG } from '../config/shopConfig'
import { sound } from '../utils/audio'
import { CameraScanner } from '../components/CameraScanner'
import { ItemDiscountModal } from '../components/ItemDiscountModal'
import { ModalDialog } from '../components/ModalDialog'
import { usePosContext } from '../components/PosProvider'
import {
  syncOrderToGoogleSheet,
  syncAllDataFromGoogleSheet,
  getLocalIsoDate,
} from '../utils/googleSheetSync'
import { useProductCategories } from '../utils/categoryHelper'
import { getLocalShopLocation } from '../utils/shopLocation'

export default function PosPage() {
  const {
    cart,
    setCart,
    isScannerOpen,
    setIsScannerOpen,
    shopLocation,
  } = usePosContext()

  const products = useLiveQuery(() => db.products.toArray()) || []
  const categories = useProductCategories()

  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('ทั้งหมด')

  const [isCartModalOpen, setIsCartModalOpen] = useState(false)
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'PROMPTPAY' | 'THAI_CHUEY_THAI'>('CASH')
  const [cashReceived, setCashReceived] = useState<string>('')
  const [lastOrderSuccess, setLastOrderSuccess] = useState<SaleOrder | null>(null)
  const [editingDiscountItem, setEditingDiscountItem] = useState<CartItem | null>(null)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false)
  const isSubmittingRef = useRef(false)
  const [enableThaiChueyThai, setEnableThaiChueyThai] = useState<boolean>(true)

  const cartTitleId = useId()
  const checkoutTitleId = useId()
  const successTitleId = useId()

  useEffect(() => {
    const readSetting = () => {
      try {
        const saved = localStorage.getItem('kana_enable_thai_chuey_thai')
        setEnableThaiChueyThai(saved === null ? true : saved === 'true')
      } catch {
        setEnableThaiChueyThai(true)
      }
    }
    readSetting()

    window.addEventListener('kana_settings_updated', readSetting)
    window.addEventListener('storage', readSetting)
    return () => {
      window.removeEventListener('kana_settings_updated', readSetting)
      window.removeEventListener('storage', readSetting)
    }
  }, [])

  // หากปิดช่องทางไทยช่วยไทยขณะเลือกค้างอยู่ ให้สลับกลับเป็นเงินสด
  useEffect(() => {
    if (!enableThaiChueyThai && paymentMethod === 'THAI_CHUEY_THAI') {
      setPaymentMethod('CASH')
      setCashReceived('')
    }
  }, [enableThaiChueyThai, paymentMethod])

  const handleManualSync = async () => {
    setIsSyncing(true)
    try {
      await syncAllDataFromGoogleSheet()
    } finally {
      setTimeout(() => setIsSyncing(false), 600)
    }
  }

  const originalTotalAmount = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0),
    [cart]
  )

  const totalItemDiscount = useMemo(
    () => cart.reduce((sum, item) => sum + (item.discount || 0) * item.quantity, 0),
    [cart]
  )

  const totalAmount = useMemo(
    () =>
      cart.reduce((sum, item) => {
        const effPrice = Math.max(0, item.product.price - (item.discount || 0))
        return sum + effPrice * item.quantity
      }, 0),
    [cart]
  )

  const totalCost = useMemo(
    () => cart.reduce((sum, item) => sum + item.product.cost * item.quantity, 0),
    [cart]
  )

  const totalItemCount = useMemo(
    () => cart.reduce((sum, item) => sum + item.quantity, 0),
    [cart]
  )

  const isThaiChueyThai = paymentMethod === 'THAI_CHUEY_THAI'
  const payableAmount = useMemo(
    () => (isThaiChueyThai ? Math.round(totalAmount * 0.4 * 100) / 100 : totalAmount),
    [totalAmount, isThaiChueyThai]
  )

  const subsidyAmount = useMemo(
    () => (isThaiChueyThai ? Math.round((totalAmount - payableAmount) * 100) / 100 : 0),
    [totalAmount, payableAmount, isThaiChueyThai]
  )

  const receivedNum = parseFloat(cashReceived) || 0
  const changeAmount =
    paymentMethod === 'PROMPTPAY' || paymentMethod === 'THAI_CHUEY_THAI'
      ? 0
      : Math.max(0, receivedNum - payableAmount)
  const isCashEnough =
    paymentMethod === 'PROMPTPAY' ||
    paymentMethod === 'THAI_CHUEY_THAI' ||
    receivedNum >= payableAmount

  const filteredProducts = useMemo(() => {
    const q = searchTerm.toLowerCase()
    return products.filter((p) => {
      const matchCategory = selectedCategory === 'ทั้งหมด' || p.category === selectedCategory
      const matchSearch =
        p.name.toLowerCase().includes(q) || p.barcode.toLowerCase().includes(q)
      return matchCategory && matchSearch
    })
  }, [products, selectedCategory, searchTerm])

  const addToCart = (product: Product) => {
    const liveProduct = products.find((p) => p.barcode === product.barcode) || product
    if (liveProduct.stock <= 0) {
      sound.playErrorTone()
      alert(`สินค้า "${liveProduct.name}" หมดสต็อกในคลังแล้ว`)
      return
    }

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.barcode === liveProduct.barcode)
      if (existing) {
        if (existing.quantity >= liveProduct.stock) {
          sound.playErrorTone()
          alert(
            `สินค้า "${liveProduct.name}" มีคงเหลือในคลังเพียง ${liveProduct.stock} ชิ้น ไม่สามารถเพิ่มเกินจำนวนคงเหลือได้`
          )
          return prevCart
        }
        return prevCart.map((item) =>
          item.product.barcode === liveProduct.barcode
            ? { ...item, product: liveProduct, quantity: item.quantity + 1 }
            : item
        )
      }
      return [...prevCart, { product: liveProduct, quantity: 1, discount: 0 }]
    })
  }

  const updateItemDiscount = (barcode: string, discountPerPiece: number) => {
    setCart((prev) =>
      prev.map((item) =>
        item.product.barcode === barcode
          ? { ...item, discount: Math.max(0, discountPerPiece) }
          : item
      )
    )
  }

  const decreaseQuantity = (barcode: string) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.product.barcode === barcode ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    )
  }

  const removeFromCart = (barcode: string) => {
    setCart((prev) => prev.filter((item) => item.product.barcode !== barcode))
  }

  const handleClearCart = () => {
    if (cart.length === 0) return
    if (confirm('คุณต้องการยกเลิกและล้างสินค้าทั้งหมดในตะกร้าใช่หรือไม่?')) {
      setCart([])
      setIsCartModalOpen(false)
      setIsCheckoutOpen(false)
    }
  }

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

  const handleCompleteOrder = async () => {
    if (isSubmittingRef.current || isSubmittingOrder || cart.length === 0 || !isCashEnough) return

    isSubmittingRef.current = true
    setIsSubmittingOrder(true)

    try {
      // ตรวจสอบสต็อกคงเหลือจริงล่าสุดจากคลังด้วย barcode (ไม่ผูกกับ auto-increment id ที่อาจเปลี่ยนหลังซิงก์)
      const matchedProducts = new Map<string, Product>()
      for (const item of cart) {
        const liveProd = await db.products.where('barcode').equals(item.product.barcode).first()
        if (!liveProd) {
          alert(`ไม่พบสินค้า "${item.product.name}" ในระบบแล้ว (อาจถูกลบจากเครื่องอื่น)`)
          return
        }
        if (liveProd.stock < item.quantity) {
          alert(
            `สินค้า "${liveProd.name}" สต็อกไม่พอสำหรับคำสั่งซื้อนี้!\n(คงเหลือในคลัง ${liveProd.stock} ชิ้น, ในตะกร้ามี ${item.quantity} ชิ้น)`
          )
          return
        }
        matchedProducts.set(item.product.barcode, liveProd)
      }

      const now = new Date()
      const dateStr = getLocalIsoDate(now)
      const monthStr = dateStr.slice(0, 7)
      const pad = (n: number) => String(n).padStart(2, '0')
      const timeStr = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
      const randSuffix =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()
          : Math.random().toString(36).slice(2, 8).toUpperCase()
      const orderNo = `ORD-${dateStr.replace(/-/g, '')}-${timeStr}-${randSuffix}`

      // อ่านทำเลเฉพาะเครื่องสดใหม่ ณ เวลาบันทึก (ล้างอัตโนมัติถ้าข้ามเที่ยงคืนแล้ว)
      const activeLocation = getLocalShopLocation(now)

      const orderData: SaleOrder = {
        orderNo,
        items: cart.map((c) => {
          const liveP = matchedProducts.get(c.product.barcode) || c.product
          const disc = c.discount || 0
          const finalPrice = Math.max(0, liveP.price - disc)
          return {
            productId: liveP.id,
            barcode: liveP.barcode,
            name: liveP.name,
            price: liveP.price,
            cost: liveP.cost,
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
        location: activeLocation || '',
        createdAt: now.getTime(),
        dateStr,
        monthStr,
      }

      // บันทึกบิล + ตัดสต็อกใน IndexedDB Transaction เดียวกันแบบ Atomic
      await db.transaction('rw', db.orders, db.products, async () => {
        await db.orders.add(orderData)
        for (const item of cart) {
          const currentProd = await db.products.where('barcode').equals(item.product.barcode).first()
          if (currentProd && currentProd.id) {
            const newStock = Math.max(0, currentProd.stock - item.quantity)
            await db.products.update(currentProd.id, { stock: newStock, updatedAt: now.getTime() })
          }
        }
      })

      syncOrderToGoogleSheet(orderData)
        .then(async (res) => {
          if (res && res.errorType === 'OUT_OF_STOCK') {
            sound.playErrorTone()
            // คืนสต็อกและลบบิลในเครื่องทันทีใน Transaction เดียว ก่อนดึงข้อมูลล่าสุดจาก Cloud
            await db.transaction('rw', db.orders, db.products, async () => {
              await db.orders.where('orderNo').equals(orderData.orderNo).delete()
              for (const item of orderData.items) {
                const p = await db.products.where('barcode').equals(item.barcode).first()
                if (p && p.id) {
                  await db.products.update(p.id, {
                    stock: (p.stock || 0) + item.quantity,
                    updatedAt: Date.now(),
                  })
                }
              }
            })
            alert(
              `⚠️ ไม่สามารถบันทึกบิล ${orderData.orderNo} ได้:\n${res.message || 'สินค้าหมดในคลัง (ถูกขายจากเครื่องอื่นแล้ว)'}\n\nระบบได้ยกเลิกบิลนี้และคืนสต็อกให้เรียบร้อยแล้ว`
            )
            await syncAllDataFromGoogleSheet().catch(() => {})
          }
        })
        .catch((e) => console.warn('Background sync order error:', e))

      sound.playSuccessChime()
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.7 },
      })

      setLastOrderSuccess(orderData)
      setCart([])
      setIsCheckoutOpen(false)
      setIsCartModalOpen(false)
      setCashReceived('')
    } catch (err) {
      console.error('Failed to save order:', err)
      alert('เกิดข้อผิดพลาดในการบันทึกบิลขาย')
    } finally {
      isSubmittingRef.current = false
      setIsSubmittingOrder(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-100 dark:bg-slate-950 overflow-hidden relative transition-colors">
      {/* ส่วนหัวของหน้าจอ */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 md:px-6 pb-3 md:pb-4 safe-top shrink-0 shadow-xs transition-colors">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between gap-2 mb-2.5 md:mb-3.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg md:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  {SHOP_CONFIG.shopName}
                </h1>
                {shopLocation && (
                  <Link
                    href="/settings/"
                    className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 text-[11px] md:text-sm font-bold max-w-[200px] md:max-w-xs truncate"
                    title="ทำเลร้านค้าเฉพาะเครื่องนี้ (แตะเพื่อแก้ไข)"
                  >
                    <MapPin aria-hidden="true" className="w-3 h-3 md:w-4 md:h-4 shrink-0" />
                    <span className="truncate">{shopLocation}</span>
                  </Link>
                )}
              </div>
              <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium">
                {SHOP_CONFIG.shopSubtitle}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearCart}
                  className="flex items-center gap-1 min-h-11 px-3 py-2 bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/60 rounded-xl text-xs md:text-base font-semibold active:scale-95 transition-all"
                  title="ยกเลิกสินค้าทั้งหมดในตะกร้า"
                >
                  <RotateCcw aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                  <span>ล้าง</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleManualSync}
                disabled={isSyncing}
                aria-label="ดึงข้อมูลล่าสุดจาก Google Sheets"
                className="flex items-center justify-center min-h-11 min-w-11 md:w-12 md:h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all border border-slate-200 dark:border-slate-700 shadow-2xs"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={`w-4 h-4 md:w-5 md:h-5 ${isSyncing ? 'animate-spin text-blue-600 dark:text-blue-400' : ''}`}
                />
              </button>

              <Link
                href="/products/"
                aria-label="คลังสินค้า"
                className="flex items-center justify-center min-h-11 min-w-11 md:w-12 md:h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all border border-slate-200 dark:border-slate-700 shadow-2xs"
              >
                <Package aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6" />
              </Link>

              <Link
                href="/settings/"
                aria-label="ตั้งค่าระบบ"
                className="flex items-center justify-center min-h-11 min-w-11 md:w-12 md:h-12 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95 transition-all border border-slate-200 dark:border-slate-700 shadow-2xs"
              >
                <Settings aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6" />
              </Link>
            </div>
          </div>

          {/* ช่องค้นหาสินค้า */}
          <div className="relative">
            <Search
              aria-hidden="true"
              className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4 md:w-5 md:h-5"
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="ค้นหาชื่อสินค้า หรือ รหัสบาร์โค้ด..."
              className="w-full pl-9 md:pl-11 pr-10 py-2.5 md:py-3 bg-slate-100 dark:bg-slate-800 border border-transparent focus:border-blue-500 rounded-xl text-base md:text-lg text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:bg-white dark:focus:bg-slate-900 outline-none transition-all"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                aria-label="ล้างคำค้นหา"
                className="absolute right-2 top-1/2 -translate-y-1/2 min-h-9 min-w-9 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X aria-hidden="true" size={16} />
              </button>
            )}
          </div>

          {/* แถบเลื่อนเลือกหมวดหมู่สินค้า */}
          <div className="flex gap-1.5 md:gap-2.5 overflow-x-auto no-scrollbar pt-2.5 md:pt-3.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('ทั้งหมด')}
              className={`shrink-0 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-base font-semibold transition-all ${
                selectedCategory === 'ทั้งหมด'
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              ทั้งหมด
            </button>
            {categories.map((cat) => (
              <button
                type="button"
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`shrink-0 px-3 md:px-4 py-1.5 md:py-2 rounded-full text-xs md:text-base font-semibold transition-all ${
                  selectedCategory === cat
                    ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* พื้นที่แสดงรายการสินค้า */}
      <main className="flex-1 overflow-y-auto p-3.5 md:p-6 pb-48 md:pb-52">
        <div className="max-w-6xl mx-auto">
          {filteredProducts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 md:py-24 text-slate-400 dark:text-slate-500">
              <Barcode aria-hidden="true" size={52} strokeWidth={1.5} className="mb-3 opacity-60" />
              <p className="text-sm md:text-xl font-semibold">ไม่พบสินค้าในรายการนี้</p>
              <p className="text-xs md:text-base mt-1 text-center">
                กดปุ่มสแกน หรือไปที่เมนู &quot;คลังสินค้า&quot; เพื่อเพิ่มสินค้า
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 md:gap-4">
              {filteredProducts.map((p) => {
                const inCartItem = cart.find((c) => c.product.barcode === p.barcode)
                return (
                  <div
                    key={p.barcode}
                    className={`flex flex-col justify-between text-left p-3 md:p-4 rounded-2xl border transition-all ${
                      inCartItem
                        ? 'bg-blue-50/90 dark:bg-blue-950/50 border-blue-400 dark:border-blue-500 shadow-xs'
                        : 'bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800 shadow-2xs'
                    }`}
                  >
                    {p.image && (
                      <div
                        onClick={() => addToCart(p)}
                        className="w-full h-24 md:h-36 mb-2 md:mb-3 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0 cursor-pointer"
                      >
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover active:scale-95 transition-transform"
                        />
                      </div>
                    )}

                    <div onClick={() => addToCart(p)} className="cursor-pointer">
                      <span className="text-[10px] md:text-xs font-mono font-medium text-slate-400 dark:text-slate-500 block truncate">
                        {p.barcode}
                      </span>
                      <h3 className="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-lg leading-snug line-clamp-2 mt-0.5">
                        {p.name}
                      </h3>
                    </div>

                    <div className="flex items-end justify-between mt-3 pt-2 border-t border-slate-100/80 dark:border-slate-800 gap-1">
                      <div onClick={() => addToCart(p)} className="cursor-pointer min-w-0">
                        <span
                          className={`text-[10px] md:text-sm block ${
                            p.stock <= 5
                              ? 'text-rose-500 dark:text-rose-400 font-semibold'
                              : 'text-slate-400 dark:text-slate-400'
                          }`}
                        >
                          คงเหลือ {p.stock}
                        </span>
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-sm md:text-xl font-black text-blue-600 dark:text-blue-400">
                            {SHOP_CONFIG.currency}
                            {inCartItem && inCartItem.discount && inCartItem.discount > 0
                              ? (p.price - inCartItem.discount).toLocaleString()
                              : p.price.toLocaleString()}
                          </span>
                          {inCartItem && inCartItem.discount && inCartItem.discount > 0 && (
                            <span className="text-[9px] md:text-xs px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 font-bold">
                              ลด ฿{inCartItem.discount}
                            </span>
                          )}
                        </div>
                      </div>

                      {inCartItem ? (
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 border border-blue-300 dark:border-blue-600 rounded-xl p-0.5 shadow-xs shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              decreaseQuantity(p.barcode)
                            }}
                            aria-label={`ลดจำนวน ${p.name}`}
                            className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-blue-100 dark:bg-blue-950 hover:bg-blue-200 dark:hover:bg-blue-900 flex items-center justify-center text-blue-800 dark:text-blue-300 active:scale-90 transition-transform"
                          >
                            <Minus aria-hidden="true" className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                          <span className="font-extrabold text-xs md:text-base text-blue-700 dark:text-blue-300 min-w-5 text-center">
                            {inCartItem.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              addToCart(p)
                            }}
                            aria-label={`เพิ่มจำนวน ${p.name}`}
                            className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white active:scale-90 transition-transform"
                          >
                            <Plus aria-hidden="true" className="w-4 h-4" strokeWidth={2.5} />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addToCart(p)}
                          aria-label={`เพิ่ม ${p.name} ลงตะกร้า`}
                          className="flex h-9 w-9 md:h-11 md:w-11 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-90 transition-transform shrink-0"
                        >
                          <Plus aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* แถบ My Order สรุปยอดขาย */}
      {cart.length > 0 && (
        <div
          className="fixed left-4 right-4 md:left-8 md:right-8 z-30"
          style={{ bottom: 'calc(78px + max(env(safe-area-inset-bottom), 14px))' }}
        >
          <div className="max-w-4xl mx-auto bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white px-4 md:px-6 py-3.5 md:py-4 rounded-2xl shadow-2xl border border-slate-700/60 flex items-center justify-between gap-3">
            <div
              onClick={() => setIsCartModalOpen(true)}
              className="flex items-center gap-3 md:gap-4 cursor-pointer flex-1 min-w-0"
            >
              <div className="relative shrink-0">
                <span className="flex h-9 w-9 md:h-12 md:w-12 items-center justify-center rounded-xl bg-blue-600 font-black text-sm md:text-lg text-white shadow-md">
                  {totalItemCount}
                </span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] md:text-xs uppercase font-bold tracking-wider text-blue-400">
                    My Order
                  </span>
                  <span className="text-[10px] md:text-xs text-slate-400">
                    ({cart.length} รายการ)
                  </span>
                </div>
                <p className="text-lg md:text-2xl font-black text-white leading-tight truncate">
                  {SHOP_CONFIG.currency}
                  {totalAmount.toLocaleString()}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 md:gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsCartModalOpen(true)}
                aria-label="ดูรายการสั่งซื้อในตะกร้า"
                className="min-h-11 min-w-11 p-2.5 md:p-3 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 active:scale-95 text-slate-200 rounded-xl transition-all border border-slate-700 dark:border-slate-600"
              >
                <ShoppingBag aria-hidden="true" className="w-5 h-5 md:w-6 md:h-6" />
              </button>

              <button
                type="button"
                onClick={() => setIsCheckoutOpen(true)}
                className="flex items-center gap-1.5 min-h-11 px-4 md:px-6 py-2.5 md:py-3 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl font-bold text-xs md:text-base shadow-lg shadow-blue-600/30 transition-all"
              >
                <span>คิดเงิน</span>
                <ArrowRight aria-hidden="true" className="w-4 h-4 md:w-5 md:h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* โมดอลดู/แก้ไขรายการในตะกร้า */}
      <ModalDialog
        isOpen={isCartModalOpen}
        onClose={() => setIsCartModalOpen(false)}
        labelledBy={cartTitleId}
        position="bottom-sheet"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag aria-hidden="true" className="text-blue-600 dark:text-blue-400" size={20} />
            <h2 id={cartTitleId} className="font-black text-slate-900 dark:text-white text-base md:text-xl">
              My Order (รายการในตะกร้า)
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 text-xs md:text-sm font-bold">
              {totalItemCount} ชิ้น
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsCartModalOpen(false)}
            aria-label="ปิดหน้าต่างตะกร้าสินค้า"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2 divide-y divide-slate-100 dark:divide-slate-800 max-h-[45dvh]">
          {cart.map((item) => (
            <div key={item.product.barcode} className="py-3 flex items-center justify-between gap-3">
              {item.product.image && (
                <img
                  src={item.product.image}
                  alt={item.product.name}
                  className="w-11 h-11 md:w-14 md:h-14 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-slate-50"
                />
              )}
              <div className="flex-1 min-w-0 pr-1">
                <p className="font-bold text-slate-800 dark:text-slate-100 text-sm md:text-base truncate">
                  {item.product.name}
                </p>
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                  {item.discount && item.discount > 0 ? (
                    <>
                      <span className="line-through text-slate-400 mr-1">
                        {SHOP_CONFIG.currency}{item.product.price}
                      </span>
                      <span className="text-slate-800 dark:text-slate-200 font-bold">
                        {SHOP_CONFIG.currency}{item.product.price - item.discount}
                      </span>
                    </>
                  ) : (
                    `${SHOP_CONFIG.currency}${item.product.price}`
                  )}{' '}
                  x {item.quantity} ={' '}
                  <span className="text-blue-600 dark:text-blue-400 font-bold">
                    {SHOP_CONFIG.currency}
                    {((item.product.price - (item.discount || 0)) * item.quantity).toLocaleString()}
                  </span>
                </p>

                <div className="mt-1.5">
                  {item.discount && item.discount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setEditingDiscountItem(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 font-bold text-[11px] md:text-xs active:scale-95 transition-all"
                    >
                      <Tag aria-hidden="true" size={11} className="text-rose-500" />
                      <span>ลด ฿{item.discount}/ชิ้น (-฿{item.discount * item.quantity})</span>
                      <span className="underline ml-0.5">แก้</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditingDiscountItem(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold text-[11px] md:text-xs border border-dashed border-slate-300 dark:border-slate-600 active:scale-95 transition-all"
                    >
                      <Tag aria-hidden="true" size={11} className="text-slate-400" />
                      <span>ลดราคา (0฿)</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => decreaseQuantity(item.product.barcode)}
                  aria-label={`ลดจำนวน ${item.product.name}`}
                  className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700"
                >
                  <Minus aria-hidden="true" size={16} />
                </button>
                <span className="font-black text-sm md:text-base w-6 text-center">
                  {item.quantity}
                </span>
                <button
                  type="button"
                  onClick={() => addToCart(item.product)}
                  aria-label={`เพิ่มจำนวน ${item.product.name}`}
                  className="h-9 w-9 md:h-11 md:w-11 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-200 active:bg-slate-200 dark:active:bg-slate-700"
                >
                  <Plus aria-hidden="true" size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => removeFromCart(item.product.barcode)}
                  aria-label={`ลบ ${item.product.name} ออกจากตะกร้า`}
                  className="ml-1 text-rose-500 min-h-10 min-w-10 flex items-center justify-center hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg active:scale-90"
                >
                  <Trash2 aria-hidden="true" size={18} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-100 dark:border-slate-800 space-y-3 safe-bottom">
          <div className="space-y-1 pb-1">
            {totalItemDiscount > 0 && (
              <div className="flex justify-between items-center text-xs md:text-base text-slate-500 dark:text-slate-400">
                <span>ยอดรวมปกติ:</span>
                <span className="line-through">
                  {SHOP_CONFIG.currency}{originalTotalAmount.toLocaleString()}
                </span>
              </div>
            )}
            {totalItemDiscount > 0 && (
              <div className="flex justify-between items-center text-xs md:text-base text-rose-600 dark:text-rose-400 font-bold">
                <span>ส่วนลดสินค้ารวม:</span>
                <span>
                  -{SHOP_CONFIG.currency}{totalItemDiscount.toLocaleString()}
                </span>
              </div>
            )}
            <div className="flex justify-between items-center pt-1 border-t border-slate-200/60 dark:border-slate-700">
              <span className="text-xs md:text-base font-bold text-slate-700 dark:text-slate-200">
                ยอดสุทธิ:
              </span>
              <span className="text-xl md:text-2xl font-black text-slate-900 dark:text-white">
                {SHOP_CONFIG.currency}
                {totalAmount.toLocaleString()}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleClearCart}
              className="flex items-center justify-center gap-1.5 min-h-11 py-3.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 dark:hover:bg-rose-900/60 active:scale-95 text-rose-600 dark:text-rose-400 rounded-xl text-xs md:text-base font-bold transition-all"
            >
              <Trash2 aria-hidden="true" size={16} />
              <span>ยกเลิกบิลทั้งหมด</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setIsCartModalOpen(false)
                setIsCheckoutOpen(true)
              }}
              className="flex items-center justify-center gap-1.5 min-h-11 py-3.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white rounded-xl text-xs md:text-base font-bold shadow-md shadow-blue-500/20 transition-all"
            >
              <span>ไปหน้าคิดเงิน</span>
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      </ModalDialog>

      {/* โมดอลชำระเงินและคิดเงินทอน */}
      <ModalDialog
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        labelledBy={checkoutTitleId}
        position="bottom-sheet"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <h2 id={checkoutTitleId} className="font-black text-slate-900 dark:text-white text-base md:text-xl">
              คิดเงิน &amp; ชำระเงิน
            </h2>
            <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs md:text-sm font-semibold">
              {totalItemCount} ชิ้น
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsCheckoutOpen(false)}
            aria-label="ปิดหน้าต่างคิดเงิน"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-950/60 space-y-3.5 flex-1 overflow-y-auto safe-bottom">
          {/* แสดงทำเลที่จะบันทึกติดกับบิลถ้ากรอกไว้ */}
          {shopLocation && (
            <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 text-xs md:text-sm text-blue-800 dark:text-blue-200 font-semibold">
              <span className="flex items-center gap-1.5">
                <MapPin aria-hidden="true" size={15} />
                ทำเลที่บันทึกในบิลนี้:
              </span>
              <span className="font-bold">{shopLocation}</span>
            </div>
          )}

          {/* รายการสินค้าในบิล พร้อมปุ่มลดราคาต่อรายการ */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-3 md:p-4 shadow-2xs">
            <div className="flex items-center justify-between pb-2 mb-1.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
                <Tag aria-hidden="true" size={14} className="text-rose-500" />
                <span className="text-xs md:text-base font-bold">
                  รายการสินค้า &amp; ส่วนลด ({cart.length} รายการ)
                </span>
              </div>
              <span className="text-[10px] md:text-xs text-slate-400 font-medium">
                แตะปุ่มเพื่อใส่ส่วนลด
              </span>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-44 overflow-y-auto pr-1">
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
                      <p className="font-bold text-slate-800 dark:text-slate-100 text-xs md:text-base truncate">
                        {item.product.name}
                      </p>
                      <p className="text-[11px] md:text-sm text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        {hasDiscount ? (
                          <>
                            <span className="line-through text-slate-400 mr-1">
                              {SHOP_CONFIG.currency}{item.product.price}
                            </span>
                            <span className="text-slate-800 dark:text-slate-200 font-bold">
                              {SHOP_CONFIG.currency}{effPrice}
                            </span>
                          </>
                        ) : (
                          `${SHOP_CONFIG.currency}${item.product.price}`
                        )}{' '}
                        x {item.quantity} ={' '}
                        <span className="text-blue-600 dark:text-blue-400 font-bold">
                          {SHOP_CONFIG.currency}{itemSubtotal.toLocaleString()}
                        </span>
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setEditingDiscountItem(item)}
                      className={`shrink-0 px-2.5 py-1.5 min-h-9 rounded-xl text-[11px] md:text-sm font-bold transition-all active:scale-95 flex items-center gap-1 border ${
                        hasDiscount
                          ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 shadow-2xs'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                      }`}
                    >
                      <Tag
                        aria-hidden="true"
                        size={12}
                        className={hasDiscount ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}
                      />
                      <span>{hasDiscount ? `ลด ฿${item.discount}` : 'ลดราคา (0฿)'}</span>
                    </button>
                  </div>
                )
              })}
            </div>

            {totalItemDiscount > 0 && (
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs md:text-base font-semibold text-rose-700 dark:text-rose-300 bg-rose-50/60 dark:bg-rose-950/50 px-2.5 py-1.5 rounded-xl">
                <span>รวมส่วนลดสินค้าทั้งหมด:</span>
                <span className="font-black">
                  -{SHOP_CONFIG.currency}{totalItemDiscount.toLocaleString()}
                </span>
              </div>
            )}
          </div>

          {/* เลือกวิธีชำระเงิน */}
          <div className={`grid ${enableThaiChueyThai ? 'grid-cols-3' : 'grid-cols-2'} gap-2`}>
            <button
              type="button"
              onClick={() => {
                setPaymentMethod('CASH')
                setCashReceived('')
              }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 min-h-12 py-2.5 px-2 rounded-xl border text-xs md:text-base font-bold transition-all ${
                paymentMethod === 'CASH'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <Banknote aria-hidden="true" size={18} />
              <span>เงินสด</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setPaymentMethod('PROMPTPAY')
                setCashReceived(totalAmount.toString())
              }}
              className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 min-h-12 py-2.5 px-2 rounded-xl border text-xs md:text-base font-bold transition-all ${
                paymentMethod === 'PROMPTPAY'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700'
              }`}
            >
              <CreditCard aria-hidden="true" size={18} />
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
                className={`flex flex-col items-center justify-center gap-0.5 min-h-12 py-2 px-1 rounded-xl border text-xs md:text-sm font-bold transition-all ${
                  paymentMethod === 'THAI_CHUEY_THAI'
                    ? 'bg-amber-500 text-white border-amber-500 shadow-sm'
                    : 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
                }`}
              >
                <div className="flex items-center gap-1">
                  <span>🇹🇭</span>
                  <span className="text-[11px] md:text-sm font-black">ไทยช่วยไทย</span>
                </div>
                <span
                  className={`text-[9px] md:text-xs px-1.5 rounded-full font-bold ${
                    paymentMethod === 'THAI_CHUEY_THAI'
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-200/70 dark:bg-amber-900/80 text-amber-900 dark:text-amber-200'
                  }`}
                >
                  ลูกค้าจ่าย 40%
                </span>
              </button>
            )}
          </div>

          {paymentMethod === 'CASH' && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs md:text-base font-semibold text-slate-600 dark:text-slate-300">
                  รับเงินมา:
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  value={cashReceived}
                  onChange={(e) => setCashReceived(e.target.value)}
                  placeholder="0.00"
                  className="w-36 md:w-44 text-right px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-base md:text-xl font-bold text-slate-900 dark:text-white outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  type="button"
                  onClick={() => setCashReceived(totalAmount.toString())}
                  className="px-3 py-2 min-h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs md:text-base font-bold text-blue-600 dark:text-blue-400 active:bg-blue-50 shrink-0"
                >
                  พอดี ({totalAmount})
                </button>
                {SHOP_CONFIG.quickCashAmounts.map((amt) => (
                  <button
                    type="button"
                    key={amt}
                    onClick={() => setCashReceived(amt.toString())}
                    className="px-3 py-2 min-h-10 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs md:text-base font-semibold text-slate-700 dark:text-slate-200 active:bg-slate-100 shrink-0"
                  >
                    {amt}
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs md:text-base font-medium text-slate-500 dark:text-slate-400">
                  เงินทอน:
                </span>
                <span
                  className={`text-base md:text-xl font-black ${
                    changeAmount >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-rose-500 dark:text-rose-400'
                  }`}
                >
                  {SHOP_CONFIG.currency}
                  {changeAmount.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {paymentMethod === 'THAI_CHUEY_THAI' && (
            <div className="p-3.5 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl space-y-2.5">
              <div className="flex items-center justify-between text-xs md:text-base">
                <span className="text-slate-600 dark:text-slate-300">ยอดรวมราคาสินค้า:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {SHOP_CONFIG.currency}{totalAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs md:text-base text-amber-700 dark:text-amber-300 font-medium">
                <span>โครงการช่วยจ่าย (60%):</span>
                <span className="font-bold">
                  -{SHOP_CONFIG.currency}{subsidyAmount.toLocaleString()}
                </span>
              </div>
              <div className="pt-2 border-t border-amber-200 dark:border-amber-800 flex items-center justify-between">
                <div>
                  <span className="text-xs md:text-base font-bold text-amber-900 dark:text-amber-200 block">
                    ยอดที่ลูกค้าชำระ (40% พอดี):
                  </span>
                  <span className="text-[10px] md:text-xs text-amber-700 dark:text-amber-400 font-medium">
                    *รับชำระยอดพอดีเท่านั้น (ไม่มีเงินทอน)
                  </span>
                </div>
                <span className="text-xl md:text-2xl font-black text-amber-700 dark:text-amber-300">
                  {SHOP_CONFIG.currency}{payableAmount.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <span className="text-[11px] md:text-sm text-slate-400 block">
                {paymentMethod === 'THAI_CHUEY_THAI' ? 'ยอดที่ลูกค้าชำระ (40%)' : 'ยอดสุทธิ'}
              </span>
              <span
                className={`text-xl md:text-2xl font-black ${
                  paymentMethod === 'THAI_CHUEY_THAI'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {SHOP_CONFIG.currency}
                {payableAmount.toLocaleString()}
              </span>
            </div>

            <button
              type="button"
              onClick={handleCompleteOrder}
              disabled={!isCashEnough || isSubmittingOrder}
              className={`min-h-12 px-6 py-3.5 rounded-xl font-bold text-sm md:text-lg shadow-md transition-all active:scale-95 flex items-center justify-center gap-2 ${
                isCashEnough && !isSubmittingOrder
                  ? paymentMethod === 'THAI_CHUEY_THAI'
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-500/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20'
                  : 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400 cursor-not-allowed'
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
      </ModalDialog>

      {/* ป็อปอัปแจ้งเตือนคิดเงินสำเร็จ */}
      <ModalDialog
        isOpen={!!lastOrderSuccess}
        onClose={() => setLastOrderSuccess(null)}
        labelledBy={successTitleId}
        position="center"
        panelClassName="w-full max-w-xs md:max-w-md bg-white dark:bg-slate-900 rounded-3xl p-5 md:p-6 text-center shadow-2xl border border-slate-200 dark:border-slate-800"
      >
        {lastOrderSuccess && (
          <div>
            <div className="mx-auto flex h-14 w-14 md:h-16 md:w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 mb-3">
              <CheckCircle2 aria-hidden="true" size={32} />
            </div>
            <h3 id={successTitleId} className="font-bold text-slate-900 dark:text-white text-base md:text-xl">
              บันทึกการขายสำเร็จ
            </h3>
            <p className="text-xs md:text-sm font-mono text-slate-400 mt-0.5">
              {lastOrderSuccess.orderNo}
            </p>
            {lastOrderSuccess.location && (
              <p className="inline-flex items-center gap-1 mt-1.5 px-2.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 text-xs font-bold">
                <MapPin aria-hidden="true" size={12} />
                <span>{lastOrderSuccess.location}</span>
              </p>
            )}

            <div className="my-3 py-2.5 bg-slate-50 dark:bg-slate-800/70 rounded-xl text-xs md:text-base space-y-1.5">
              <div className="flex justify-between px-3 text-slate-600 dark:text-slate-300">
                <span>วิธีชำระ:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  {lastOrderSuccess.paymentMethod === 'THAI_CHUEY_THAI'
                    ? 'ไทยช่วยไทย'
                    : lastOrderSuccess.paymentMethod === 'CASH'
                    ? 'เงินสด'
                    : 'PromptPay'}
                </span>
              </div>
              <div className="flex justify-between px-3 text-slate-600 dark:text-slate-300">
                <span>ยอดเงินรวมสินค้า:</span>
                <span className="font-bold">
                  {SHOP_CONFIG.currency}
                  {lastOrderSuccess.totalAmount.toLocaleString()}
                </span>
              </div>
              {lastOrderSuccess.itemDiscountTotal && lastOrderSuccess.itemDiscountTotal > 0 ? (
                <div className="flex justify-between px-3 text-rose-600 dark:text-rose-400 font-semibold">
                  <span>ส่วนลดสินค้า:</span>
                  <span>
                    -{SHOP_CONFIG.currency}
                    {lastOrderSuccess.itemDiscountTotal.toLocaleString()}
                  </span>
                </div>
              ) : null}
              {lastOrderSuccess.paymentMethod === 'THAI_CHUEY_THAI' && (
                <>
                  <div className="flex justify-between px-3 text-amber-600 dark:text-amber-400 font-semibold">
                    <span>โครงการช่วย (60%):</span>
                    <span>
                      -{SHOP_CONFIG.currency}
                      {(
                        lastOrderSuccess.discountAmount || lastOrderSuccess.totalAmount * 0.6
                      ).toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 text-amber-800 dark:text-amber-300 font-bold border-t border-slate-200/60 dark:border-slate-700 pt-1">
                    <span>ลูกค้าชำระ (40% พอดี):</span>
                    <span>
                      {SHOP_CONFIG.currency}
                      {(
                        lastOrderSuccess.customerPaid || lastOrderSuccess.totalAmount * 0.4
                      ).toLocaleString()}
                    </span>
                  </div>
                </>
              )}
              {lastOrderSuccess.paymentMethod === 'CASH' && (
                <>
                  <div className="flex justify-between px-3 text-slate-600 dark:text-slate-300">
                    <span>รับเงินมา:</span>
                    <span className="font-medium">
                      {SHOP_CONFIG.currency}
                      {lastOrderSuccess.cashReceived.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between px-3 text-emerald-700 dark:text-emerald-400 font-bold border-t border-slate-200 dark:border-slate-700 pt-1">
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
              type="button"
              onClick={() => setLastOrderSuccess(null)}
              className="w-full min-h-11 py-2.5 bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-500 text-white rounded-xl text-xs md:text-base font-bold transition-all"
            >
              ขายรายการต่อไป
            </button>
          </div>
        )}
      </ModalDialog>

      {/* โมดอลกล้องสแกนบาร์โค้ด */}
      <CameraScanner
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScanSuccess={handleScanSuccess}
      />

      {/* หน้าต่างลดราคาต่อรายการ */}
      <ItemDiscountModal
        item={editingDiscountItem}
        isOpen={!!editingDiscountItem}
        onClose={() => setEditingDiscountItem(null)}
        onSaveDiscount={updateItemDiscount}
      />
    </div>
  )
}
