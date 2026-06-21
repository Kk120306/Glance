import React from 'react'

interface StatCardProps {
  label: string
  value: string | number
  valueColor?: string
}

export function StatCard({ label, value, valueColor }: StatCardProps) {
  return (
    <div className="rounded-[18px] bg-white p-[20px] px-[22px] shadow-soft border border-line">
      <div className="text-[14px] font-bold text-ink-faint mb-2 uppercase tracking-wider">{label}</div>
      <div 
        className="font-serif text-[36px] font-semibold leading-none"
        style={{ color: valueColor ?? 'inherit' }}
      >
        {value}
      </div>
    </div>
  )
}
