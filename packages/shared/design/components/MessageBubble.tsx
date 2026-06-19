import React from 'react'

interface MessageBubbleProps {
  senderName: string
  content: string
  timestamp: Date | string
  className?: string
}

export function MessageBubble({ senderName, content, timestamp, className = '' }: MessageBubbleProps) {
  const ts = typeof timestamp === 'string' ? new Date(timestamp) : timestamp
  const formatted = ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  return (
    <div className={`flex flex-col gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-4 shadow-sm ${className}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-neutral-700">{senderName}</span>
        <time className="text-xs text-neutral-500" dateTime={ts.toISOString()}>
          {formatted}
        </time>
      </div>
      <p className="text-base text-neutral-900">{content}</p>
    </div>
  )
}
