import React from 'react'
import Link from 'next/link'

interface PatientCardProps {
  id: string
  name: string
  isOnline: boolean
  isSOS: boolean
  // Per-patient telemetry (gaze accuracy, input mode, last-active). Not yet
  // instrumented end-to-end, so callers omit these and the card shows "—".
  gazeStatus?: string
  inputMode?: string
  lastActive?: string
  latestMessage?: string // Latest text message preview
  latestMessageTime?: string // '8s ago', '2m ago' etc
}

export function PatientCard({
  id,
  name,
  isOnline,
  isSOS,
  gazeStatus = '—',
  inputMode = '—',
  lastActive = '—',
  latestMessage,
  latestMessageTime,
}: PatientCardProps) {
  // Get two-letter initials
  const initials = name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  // Generate avatar gradient and color classes depending on status
  // 1. SOS: Pink to red
  // 2. Online default: Teal to green
  // 3. Offline: Grayish
  let avatarBg = 'linear-gradient(135deg, #5FC9BD, #0E9384)'
  let statusBadgeBg = 'bg-[#D9F6F0] text-[#0B6F63]'
  let statusText = 'Active'
  let cardBorder = 'border-line'
  let latestMsgBg = 'bg-surface-warm text-ink-muted'
  let gazeColor = 'text-[#0B6F63]'

  if (isSOS) {
    avatarBg = 'linear-gradient(135deg, #FB7185, #E5484D)'
    statusBadgeBg = 'bg-[#FDECEC] text-[#C62A2F]'
    statusText = 'SOS active'
    cardBorder = 'border-2 border-[#F3B7B7]'
    latestMsgBg = 'bg-[#FBF1F1] text-[#9A4444]'
    gazeColor = 'text-[#C62A2F]'
  } else if (!isOnline) {
    avatarBg = 'linear-gradient(135deg, #9A93A0, #6B6470)'
    statusBadgeBg = 'bg-line text-ink-muted'
    statusText = 'Offline'
    gazeColor = 'text-ink-muted'
  } else if (inputMode.toLowerCase().includes('scan')) {
    avatarBg = 'linear-gradient(135deg, #A98CF7, #7C5CFC)'
    statusBadgeBg = 'bg-[#FFF3E0] text-[#B5760A]'
    statusText = 'Scan mode'
    gazeColor = 'text-[#B5760A]'
  } else if (lastActive.includes('40m') || lastActive.includes('hr')) {
    avatarBg = 'linear-gradient(135deg, #EC8FDE, #C961B8)'
    statusBadgeBg = 'bg-[#F1ECE4] text-[#6B6470]'
    statusText = 'Resting'
  }

  return (
    <Link href={`/patients/${id}`}>
      <div 
        className={`bg-white rounded-[20px] p-[22px] shadow-soft hover:shadow-lift transition-all duration-180 hover:-translate-y-1 cursor-pointer border ${cardBorder}`}
      >
        {/* Header row */}
        <div className="flex items-center gap-[14px] mb-[16px]">
          <div 
            className="relative w-[56px] h-[56px] rounded-full flex items-center justify-center text-white font-bold text-[22px]"
            style={{ background: avatarBg }}
          >
            {initials}
            {isOnline && (
              <span 
                className={`absolute bottom-[-1px] right-[-1px] w-[16px] h-[16px] rounded-full border-[3px] border-white transition-colors ${
                  isSOS ? 'bg-[#E5484D] animate-[pulseDot_1s_ease-in-out_infinite]' : 'bg-[#1F9D63]'
                }`}
              />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[20px] text-ink truncate">{name}</div>
          </div>
          <div className={`rounded-full px-[14px] py-[7px] text-[13px] font-bold ${statusBadgeBg}`}>
            {statusText}
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-[20px] mb-[14px]">
          <div>
            <div className="text-[13px] text-ink-faint font-bold uppercase tracking-wider">Gaze</div>
            <div className={`font-bold text-[17px] ${gazeColor}`}>{gazeStatus}</div>
          </div>
          <div>
            <div className="text-[13px] text-ink-faint font-bold uppercase tracking-wider">Input mode</div>
            <div className="font-bold text-[17px] text-ink">{inputMode}</div>
          </div>
          <div>
            <div className="text-[13px] text-ink-faint font-bold uppercase tracking-wider">Last active</div>
            <div className="font-bold text-[17px] text-ink">{lastActive}</div>
          </div>
        </div>

        {/* Message preview row */}
        <div className={`rounded-[12px] p-[12px] px-[16px] text-[15px] font-bold ${latestMsgBg} truncate`}>
          {latestMessage ? (
            <span>
              {latestMessage}
              {latestMessageTime && <span className="font-normal opacity-70 ml-2">· {latestMessageTime}</span>}
            </span>
          ) : (
            <span className="font-normal italic">No messages yet</span>
          )}
        </div>
      </div>
    </Link>
  )
}
