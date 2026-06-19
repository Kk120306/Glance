import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Glance',
  description: 'Glance patient communication screen',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="h-full w-full bg-patient-bg text-patient-text antialiased">
        {children}
      </body>
    </html>
  )
}
