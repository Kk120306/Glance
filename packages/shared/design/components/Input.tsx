import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-bold text-ink-muted">
        {label}
      </label>
      <input
        id={inputId}
        className={`rounded-[14px] border bg-white px-4 py-3 text-base text-ink transition-all duration-[180ms] placeholder:text-ink-faint focus:bg-surface-warm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent ${error ? 'border-error' : 'border-line-warm'} ${className}`}
        aria-describedby={error ? `${inputId}-error` : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && (
        <span id={`${inputId}-error`} role="alert" className="text-sm font-bold text-error">
          {error}
        </span>
      )}
    </div>
  )
}
