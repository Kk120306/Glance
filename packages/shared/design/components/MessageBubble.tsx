import React from 'react'

interface MessageBubbleProps {
  senderName: string
  content: string
  timestamp: Date | string
  isYesNo?: boolean
  reply?: string | null
  repliedAt?: Date | string | null
  className?: string
}

export function MessageBubble({
  senderName,
  content,
  timestamp,
  isYesNo,
  reply,
  repliedAt,
  className = '',
}: MessageBubbleProps) {
  const ts = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const formatted = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-neutral-700">{senderName}</span>
          {isYesNo && (
            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              Yes/No
            </span>
          )}
        </div>
        <time className="text-xs text-neutral-500" dateTime={ts.toISOString()}>
          {formatted}
        </time>
      </div>
      <p className="text-base text-neutral-900">{content}</p>
      {reply && (
        <div className="mt-1 flex items-center gap-2">
          <span
            className="rounded px-2 py-0.5 text-sm font-semibold"
            style={{
              backgroundColor: reply === 'yes' ? '#dcfce7' : '#fee2e2',
              color: reply === 'yes' ? '#15803d' : '#b91c1c',
            }}
          >
            Patient replied: {reply.toUpperCase()}
          </span>
          {repliedAt && (
            <span className="text-xs text-neutral-400">
              {(typeof repliedAt === 'string' ? new Date(repliedAt) : repliedAt).toLocaleTimeString(
                [],
                { hour: '2-digit', minute: '2-digit' },
              )}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
