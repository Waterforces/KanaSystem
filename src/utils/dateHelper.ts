/**
 * แปลงวันที่เป็น YYYY-MM-DD ตามเวลาท้องถิ่นของเครื่อง (ไม่เพี้ยนตาม UTC)
 */
export function getLocalIsoDate(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

const THAI_MONTHS_SHORT = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
]

const THAI_MONTHS_LONG = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
]

/**
 * แปลง YYYY-MM-DD เป็นข้อความวันที่ไทยแบบอ่านง่าย เช่น "21 พ.ย. 2569"
 */
export function formatThaiDate(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return dateStr
  const year = parseInt(match[1], 10) + 543
  const monthIdx = parseInt(match[2], 10) - 1
  const day = parseInt(match[3], 10)
  const monthName = THAI_MONTHS_SHORT[monthIdx] || match[2]
  return `${day} ${monthName} ${year}`
}

/**
 * แปลง YYYY-MM-DD เป็นรูปแบบสั้น DD/MM เช่น "20/11"
 */
export function formatShortDayMonth(dateStr: string): string {
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return dateStr || '-'
  return `${match[3]}/${match[2]}`
}

/**
 * แปลง YYYY-MM เป็นชื่อเดือนไทย เช่น "พฤศจิกายน 2569"
 */
export function formatThaiMonth(monthStr: string): string {
  const match = monthStr.match(/^(\d{4})-(\d{2})$/)
  if (!match) return monthStr
  const year = parseInt(match[1], 10) + 543
  const monthIdx = parseInt(match[2], 10) - 1
  const monthName = THAI_MONTHS_LONG[monthIdx] || match[2]
  return `${monthName} ${year}`
}
