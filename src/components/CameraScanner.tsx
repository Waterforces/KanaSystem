'use client'

/**
 * ========================================================
 * 📷 components/CameraScanner.tsx - ระบบสแกนบาร์โค้ดผ่านกล้องมือถือ / iPad
 * ========================================================
 * ใช้ไลบรารี html5-qrcode สแกนบาร์โค้ดแท่งมาตรฐานค้าปลีก (CODE128, EAN13, UPC)
 */

import React, { useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { X, Flashlight, AlertCircle, ScanBarcode } from 'lucide-react'
import { sound } from '../utils/audio'

interface CameraScannerProps {
  isOpen: boolean
  onClose: () => void
  onScanSuccess: (decodedText: string) => void
  title?: string
}

export const CameraScanner: React.FC<CameraScannerProps> = ({
  isOpen,
  onClose,
  onScanSuccess,
  title = 'สแกนบาร์โค้ดสินค้า',
}) => {
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const lastScannedTimeRef = useRef<number>(0)
  const onScanSuccessRef = useRef(onScanSuccess)
  const containerId = 'barcode-reader-container'

  useEffect(() => {
    onScanSuccessRef.current = onScanSuccess
  }, [onScanSuccess])

  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return

    setErrorMessage(null)
    setTorchOn(false)

    const formatsToSupport = [
      Html5QrcodeSupportedFormats.CODE_128,
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_39,
    ]

    const scanner = new Html5Qrcode(containerId, {
      formatsToSupport,
      verbose: false,
    })
    scannerRef.current = scanner

    scanner
      .start(
        { facingMode: 'environment' },
        {
          fps: 15,
          qrbox: (viewfinderWidth, viewfinderHeight) => {
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight)
            return {
              width: Math.floor(minEdge * 0.92),
              height: Math.floor(minEdge * 0.52),
            }
          },
          aspectRatio: 1.0,
        },
        (decodedText) => {
          const now = Date.now()
          if (now - lastScannedTimeRef.current > 1200) {
            lastScannedTimeRef.current = now
            sound.playScanBeep()
            onScanSuccessRef.current(decodedText)
          }
        },
        () => {}
      )
      .then(() => {
        try {
          const track = scanner.getRunningTrackCapabilities()
          if (track && 'torch' in track) {
            setHasTorch(true)
          }
        } catch {
          setHasTorch(false)
        }
      })
      .catch((err) => {
        console.error('Camera start error:', err)
        setErrorMessage(
          'ไม่สามารถเปิดกล้องได้ กรุณากดอนุญาตการเข้าถึงกล้องใน Safari หรือตรวจสอบว่าเว็บใช้ HTTPS'
        )
      })

    return () => {
      if (scanner.isScanning) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch((e) => console.log('Cleanup camera error', e))
      }
    }
  }, [isOpen])

  const toggleTorch = async () => {
    if (!scannerRef.current) return
    try {
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: !torchOn } as unknown as MediaTrackConstraintSet],
      })
      setTorchOn(!torchOn)
    } catch {
      // อุปกรณ์อาจไม่รองรับ
    }
  }

  if (!isOpen) return null

  return (
    <div
      role="region"
      aria-label={title}
      className="fixed inset-0 z-50 flex flex-col bg-black text-white safe-top safe-bottom"
    >
      {/* ส่วนหัวของหน้าสแกน */}
      <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 bg-black/70 backdrop-blur-md">
        <div className="flex items-center gap-2.5">
          <ScanBarcode aria-hidden="true" className="text-emerald-400 w-6 h-6 md:w-7 md:h-7" />
          <h2 className="font-semibold text-base md:text-xl">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {hasTorch && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label={torchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย'}
              className={`min-h-11 min-w-11 flex items-center justify-center rounded-full transition-colors ${
                torchOn ? 'bg-amber-400 text-black' : 'bg-neutral-800 text-white'
              }`}
            >
              <Flashlight aria-hidden="true" size={20} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดกล้องสแกน"
            className="min-h-11 min-w-11 flex items-center justify-center rounded-full bg-neutral-800 hover:bg-neutral-700 active:scale-90 text-white transition-all"
          >
            <X aria-hidden="true" size={22} />
          </button>
        </div>
      </div>

      {/* พื้นที่แสดงภาพกล้อง */}
      <div className="relative flex-1 flex flex-col items-center justify-center overflow-hidden bg-black">
        <div id={containerId} className="w-full max-w-sm md:max-w-md overflow-hidden" />

        {/* เส้นเลเซอร์เล็งบาร์โค้ดแท่ง */}
        <div className="pointer-events-none absolute inset-x-4 top-1/2 -translate-y-1/2 flex flex-col items-center">
          <div className="w-full max-w-[320px] md:max-w-[400px] h-36 md:h-44 border-2 border-emerald-400/80 rounded-2xl relative shadow-[0_0_20px_rgba(52,211,153,0.3)] bg-emerald-500/5">
            <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-[2.5px] bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)] animate-pulse" />
          </div>
          <p className="mt-4 text-xs md:text-base font-semibold text-slate-200 bg-black/75 px-4 py-1.5 rounded-full shadow border border-white/10">
            วางแถบบาร์โค้ดให้อยู่ในเส้นเลเซอร์สีแดง
          </p>
        </div>

        {/* กล่องแจ้งเตือนเมื่อเกิดข้อผิดพลาด */}
        {errorMessage && (
          <div className="absolute inset-x-4 top-16 max-w-md mx-auto bg-rose-950/90 border border-rose-500 rounded-xl p-4 text-rose-200 text-sm md:text-base flex items-start gap-3 shadow-lg">
            <AlertCircle aria-hidden="true" className="shrink-0 text-rose-400" size={20} />
            <div>
              <p className="font-medium text-white">เกิดข้อผิดพลาด</p>
              <p className="text-xs md:text-sm text-rose-200 mt-0.5">{errorMessage}</p>
            </div>
          </div>
        )}
      </div>

      {/* แถบล่าง */}
      <div className="p-4 md:p-5 bg-black/70 text-center">
        <button
          type="button"
          onClick={onClose}
          className="w-full max-w-md mx-auto py-3.5 md:py-4 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 rounded-xl font-semibold text-sm md:text-lg transition-all"
        >
          ปิดกล้อง
        </button>
      </div>
    </div>
  )
}
