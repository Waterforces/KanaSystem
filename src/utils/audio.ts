/**
 * ========================================================
 * 🔊 utils/audio.ts - เสียงแจ้งเตือนและการสั่นบน iPhone
 * ========================================================
 * สังเคราะห์เสียงด้วย Web Audio API โดยไม่ต้องดาวน์โหลดไฟล์เสียงภายนอก
 */

class SoundEffects {
  private ctx: AudioContext | null = null

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx) {
        this.ctx = new AudioCtx()
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume()
    }
    return this.ctx
  }

  /**
   * เสียงติ๊ดเมื่อสแกนบาร์โค้ดสำเร็จ (Beep)
   */
  playScanBeep() {
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(1760, ctx.currentTime) // เสียงสูง 1760Hz (A6)
      
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start()
      osc.stop(ctx.currentTime + 0.12)

      // สั่นเตือนสั้นๆ บนมือถือ
      if (navigator.vibrate) {
        navigator.vibrate(60)
      }
    } catch {
      // ละเว้นหากอุปกรณ์ไม่รองรับ
    }
  }

  /**
   * เสียงยินดีเมื่อคิดเงินสำเร็จ (Payment Success)
   */
  playSuccessChime() {
    try {
      const ctx = this.getContext()
      if (!ctx) return
      
      const playTone = (freq: number, start: number, duration: number) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(freq, ctx.currentTime + start)
        gain.gain.setValueAtTime(0.25, ctx.currentTime + start)
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + duration)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(ctx.currentTime + start)
        osc.stop(ctx.currentTime + start + duration)
      }

      // เล่น 3 คอร์ดร่าเริง C5 -> E5 -> G5
      playTone(523.25, 0.0, 0.15)
      playTone(659.25, 0.1, 0.15)
      playTone(783.99, 0.2, 0.3)

      if (navigator.vibrate) {
        navigator.vibrate([80, 50, 120])
      }
    } catch {
      // ละเว้น
    }
  }

  /**
   * เสียงเตือนเมื่อไม่พบสินค้าหรือรหัสซ้ำ (Error)
   */
  playErrorTone() {
    try {
      const ctx = this.getContext()
      if (!ctx) return
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(220, ctx.currentTime)
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.25)

      if (navigator.vibrate) {
        navigator.vibrate([150, 50, 150])
      }
    } catch {
      // ละเว้น
    }
  }
}

export const sound = new SoundEffects()
