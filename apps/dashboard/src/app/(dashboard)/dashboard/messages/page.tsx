'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface FeedItem {
  id: string
  content: string
  createdAt: string
  isYesNo: boolean
  reply: 'yes' | 'no' | null
  patientId: string
  patientName: string
  fromPatient: boolean
  senderName: string
}

/** Compact relative time, e.g. "8s", "4m", "2h", "3d". */
function timeAgo(iso: string): string {
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000))
  if (secs < 60) return `${secs}s ago`
  const mins = Math.floor(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default function MessagesPage() {
  const [feed, setFeed] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/messages/recent')
        if (res.ok && !cancelled) setFeed((await res.json()) as FeedItem[])
      } catch {
        // best-effort
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="flex-1 bg-[#F4EEE6] p-[30px] px-[34px] min-h-screen overflow-y-auto">
      <header className="mb-6">
        <h1 className="font-serif text-[34px] font-semibold tracking-tight text-ink">Messages</h1>
        <p className="text-[16px] text-ink-muted mt-0.5">Recent activity across everyone in your care.</p>
      </header>

      {loading ? (
        <p className="text-sm text-ink-faint">Loading…</p>
      ) : feed.length === 0 ? (
        <div className="bg-white border border-line rounded-[20px] p-12 text-center shadow-soft max-w-2xl">
          <span className="text-[48px] block mb-4">💬</span>
          <h3 className="font-serif text-2xl font-bold text-ink mb-2">No messages yet</h3>
          <p className="text-ink-muted">Messages to and from your patients will appear here.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3 max-w-2xl">
          {feed.map((m) => (
            <li key={m.id}>
              <Link
                href={`/patients/${m.patientId}`}
                className="flex items-start gap-4 rounded-[18px] border border-line bg-white p-4 shadow-soft transition-all hover:shadow-lift hover:-translate-y-0.5"
              >
                <div
                  className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{
                    background: m.fromPatient
                      ? 'linear-gradient(135deg, #5FC9BD, #0E9384)'
                      : 'linear-gradient(135deg, #A98CF7, #7C5CFC)',
                  }}
                >
                  {m.patientName.slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[15px] font-bold text-ink">{m.patientName}</span>
                    <span className="text-[13px] text-ink-faint">· {timeAgo(m.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[15px] text-ink-muted">
                    <span className="font-bold text-ink-faint">{m.fromPatient ? `${m.patientName}: ` : `${m.senderName}: `}</span>
                    {m.content}
                  </p>
                  {m.isYesNo && (
                    <span className="mt-1 inline-block rounded-full bg-surface-warm px-2.5 py-0.5 text-[12px] font-bold text-ink-muted">
                      Yes/No{m.reply ? ` · answered "${m.reply}"` : ' · awaiting reply'}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
