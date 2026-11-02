/**
 * ========================================================
 * 🖼️ utils/imageHelper.ts - จัดการและย่อขนาดรูปภาพสินค้า
 * ========================================================
 * รองรับไฟล์รูปภาพเท่านั้น (.jpg, .png, .webp, .gif)
 * ย่อขนาดอัตโนมัติให้พอดีกับมือถือ (กว้าง/สูงไม่เกิน 400px) เพื่อประหยัดพื้นที่
 */

/**
 * แปลงและย่อขนาดไฟล์รูปภาพเป็น Base64 Data URL
 */
export async function processProductImageFile(
  file: File,
  maxDimension: number = 300,
  quality: number = 0.75
): Promise<{ success: boolean; dataUrl?: string; error?: string }> {
  // ตรวจสอบว่าต้องเป็นไฟล์รูปภาพเท่านั้น
  if (!file.type.startsWith('image/')) {
    return { success: false, error: 'กรุณาเลือกไฟล์รูปภาพเท่านั้น (.jpg, .png, .webp)' }
  }

  return new Promise((resolve) => {
    const reader = new FileReader()

    reader.onload = (readerEvent) => {
      const img = new Image()
      img.onload = () => {
        // คำนวณสัดส่วนรูปภาพให้ไม่เกิน maxDimension
        let width = img.width
        let height = img.height

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        // วาดลง Canvas เพื่อย่อขนาดและแปลงเป็น JPEG
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve({ success: false, error: 'ไม่สามารถประมวลผลรูปภาพได้' })
          return
        }

        // พื้นหลังขาวเผื่อกรณีรูป PNG โปร่งใส
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, width, height)
        ctx.drawImage(img, 0, 0, width, height)

        try {
          let currentQuality = quality
          let resizedDataUrl = canvas.toDataURL('image/jpeg', currentQuality)

          // 🛡️ ป้องกัน Base64 เกินขีดจำกัด 50,000 ตัวอักษรต่อเซลล์ของ Google Sheets
          while (resizedDataUrl.length > 45000 && currentQuality > 0.3) {
            currentQuality -= 0.15
            resizedDataUrl = canvas.toDataURL('image/jpeg', Math.max(0.2, currentQuality))
          }

          // หากยังเกิน 45,000 อีก ให้ย่อสเกล Canvas ลงครึ่งหนึ่ง
          if (resizedDataUrl.length > 45000) {
            const smallCanvas = document.createElement('canvas')
            smallCanvas.width = Math.round(width * 0.7)
            smallCanvas.height = Math.round(height * 0.7)
            const sCtx = smallCanvas.getContext('2d')
            if (sCtx) {
              sCtx.fillStyle = '#ffffff'
              sCtx.fillRect(0, 0, smallCanvas.width, smallCanvas.height)
              sCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height)
              resizedDataUrl = smallCanvas.toDataURL('image/jpeg', 0.6)
            }
          }

          resolve({ success: true, dataUrl: resizedDataUrl })
        } catch (err) {
          console.error('Error generating image dataURL:', err)
          resolve({ success: false, error: 'เกิดข้อผิดพลาดในการบันทึกรูปภาพ' })
        }
      }

      img.onerror = () => {
        resolve({ success: false, error: 'ไฟล์รูปภาพไม่ถูกต้องหรือเสียหาย' })
      }

      img.src = readerEvent.target?.result as string
    }

    reader.onerror = () => {
      resolve({ success: false, error: 'ไม่สามารถอ่านไฟล์รูปภาพได้' })
    }

    reader.readAsDataURL(file)
  })
}
