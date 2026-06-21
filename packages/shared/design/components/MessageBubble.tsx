import React from 'react'

interface MessageBubbleProps {
  senderName: string
  content: string
  timestamp: Date | string
  isYesNo?: boolean
  reply?: string | null
  repliedAt?: Date | string | null
  /** Marks a patient-initiated message (e.g. a fixed-phrase request). */
  fromPatient?: boolean
  className?: string
}

/** Return a two-character initial from a name like "Maya" → "MA" or "You" → "YO". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

export function MessageBubble({
  senderName,
  content,
  timestamp,
  isYesNo,
  reply,
  repliedAt,
  fromPatient,
  className = '',
}: MessageBubbleProps) {
  const ts = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const formatted = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div
      className={`card-hover flex gap-4 rounded-[20px] border p-5 ${
        fromPatient ? 'border-brand-soft bg-brand-soft/40' : 'border-line bg-surface-warm'
      } ${className}`}
    >
      {/* Avatar */}
      <div
        className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-serif text-lg font-bold text-white"
        style={{
          background: fromPatient
            ? 'linear-gradient(135deg, #A98CF7, #EC8FDE)'
            : 'linear-gradient(135deg, #5FC9BD, #0E9384)',
        }}
      >
        {initials(senderName)}
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-ink-muted">{senderName}</span>
            {fromPatient && (
              <span className="rounded-full bg-brand-soft px-2 py-0.5 text-xs font-bold text-brand-deep">
                Patient
              </span>
            )}
            {isYesNo && (
              <span
                className="rounded-full px-2 py-0.5 text-xs font-bold"
                style={{ background: '#D9F6F0', color: '#0B6F63' }}
              >
                Yes/No
              </span>
            )}
          </div>
          <time className="text-xs font-bold text-ink-faint" dateTime={ts.toISOString()}>
            {formatted}
          </time>
        </div>
        <p className="font-serif text-lg leading-snug text-ink">{content}</p>
        {reply && (
          <div className="mt-1 flex items-center gap-2">
            <span
              className="rounded-full px-2.5 py-0.5 text-sm font-bold"
              style={{
                backgroundColor: reply === 'yes' ? '#D9F6F0' : '#FDECEC',
                color: reply === 'yes' ? '#0B6F63' : '#C62A2F',
              }}
            >
              Patient replied: {reply.toUpperCase()}
            </span>
            {repliedAt && (
              <span className="text-xs text-ink-faint">
                {(typeof repliedAt === 'string' ? new Date(repliedAt) : repliedAt).toLocaleTimeString(
                  [],
                  { hour: '2-digit', minute: '2-digit' },
                )}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
