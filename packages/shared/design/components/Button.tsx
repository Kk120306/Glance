import React from 'react'
import { colors } from '../tokens'

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'default' | 'lg' | 'patient'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-brand-primary text-white shadow-violet hover:opacity-90 focus-visible:ring-brand-primary',
  ghost:   'bg-white text-ink-muted border border-line-warm hover:bg-surface-warm focus-visible:ring-ink-faint',
  danger:  'bg-error text-white hover:opacity-90 focus-visible:ring-error',
}

const sizeStyles: Record<Size, { minHeight: string; className: string }> = {
  default: { minHeight: '44px', className: 'px-5 text-sm' },
  lg:      { minHeight: '52px', className: 'px-7 text-base' },
  patient: { minHeight: '80px', className: 'px-8 text-xl' },
}

export function Button({ variant = 'primary', size = 'default', className = '', style, ...props }: ButtonProps) {
  const { minHeight, className: sizeClass } = sizeStyles[size]
  return (
    <button
      className={`inline-flex items-center justify-center rounded-[14px] font-bold transition-all duration-[180ms] ease-out hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 ${sizeClass} ${variantStyles[variant]} ${className}`}
      style={{ minHeight, ...style }}
      {...props}
    />
  )
}
