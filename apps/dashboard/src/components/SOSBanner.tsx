import React from 'react'

interface SOSBannerProps {
  patientName: string
  onRespond?: () => void
}

export function SOSBanner({ patientName, onRespond }: SOSBannerProps) {
  return (
    <div 
      className="flex items-center gap-[18px] border-2 border-[#F3B7B7] rounded-[18px] p-[18px] px-[24px] mb-6 animate-[sosBlink_1.6s_ease-in-out_infinite]"
    >
      <div className="w-[48px] h-[48px] rounded-full bg-[#E5484D] flex items-center justify-center text-[24px] text-white shrink-0">
        🆘
      </div>
      <div className="flex-1">
        <div className="font-bold text-[19px] text-[#C62A2F]">
          {patientName} raised an SOS
        </div>
        <div className="text-[15px] text-[#9A4444]">
          Care team notified
        </div>
      </div>
      {onRespond && (
        <button
          type="button"
          onClick={onRespond}
          className="bg-[#E5484D] hover:bg-[#c93b40] active:bg-[#b03034] text-white rounded-[12px] p-[13px] px-[24px] font-bold text-[16px] transition-colors"
        >
          Respond now
        </button>
      )}
    </div>
  )
}
