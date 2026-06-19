import React from 'react'
import { colors } from '../tokens'

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'default' | 'patient'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const variantStyles: Record<Variant, string> = {
  primary: 'bg-brand-primary text-white hover:opacity-90 focus-visible:ring-brand-primary',
  ghost:   'bg-transparent text-neutral-700 border border-neutral-200 hover:bg-neutral-100 focus-visible:ring-neutral-400',
  danger:  'bg-error text-white hover:opacity-90 focus-visible:ring-error',
}

export function Button({ variant = 'primary', size = 'default', className = '', style, ...props }: ButtonProps) {
  const minHeight = size === 'patient' ? '80px' : '44px'
  return (
    <button
      className={`inline-flex items-center justify-center rounded-md font-medium transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none px-4 ${variantStyles[variant]} ${className}`}
      style={{ minHeight, ...style }}
      {...props}
    />
  )
}
