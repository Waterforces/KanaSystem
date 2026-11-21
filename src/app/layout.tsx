import type { Metadata, Viewport } from 'next'
import './globals.css'
import { PosProvider } from '../components/PosProvider'

export const metadata: Metadata = {
  title: 'Kana POS - ระบบขายหน้าร้าน',
  description: 'ระบบขายหน้าร้าน POS สำหรับ iPhone และ iPad พร้อมซิงก์ Google Sheets',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Kana POS',
  },
  formatDetection: {
    telephone: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

const FOUC_THEME_SCRIPT = `(function(){try{var k='kana_color_scheme';var m=localStorage.getItem(k);var meta=document.querySelector('meta[name="color-scheme"]');var c=(m==='light'||m==='dark')?m:'light dark';if(meta)meta.setAttribute('content',c);var dark=m==='dark'||(m!=='light'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',!!dark);document.documentElement.dataset.theme=dark?'dark':'light';var tc=document.querySelector('meta[name="theme-color"]');if(tc)tc.setAttribute('content',dark?'#0f172a':'#ffffff');}catch(e){}})();`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="th" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <meta name="theme-color" content="#ffffff" />
        <link
          rel="icon"
          type="image/svg+xml"
          href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🛒</text></svg>"
        />
        <script dangerouslySetInnerHTML={{ __html: FOUC_THEME_SCRIPT }} />
      </head>
      <body className="select-none antialiased">
        <PosProvider>{children}</PosProvider>
      </body>
    </html>
  )
}
