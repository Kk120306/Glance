import React from 'react'

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
}

export function Input({ label, error, id, className = '', ...props }: InputProps) {
  const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={inputId} className="text-sm font-medium text-neutral-700">
        {label}
      </label>
      <input
        id={inputId}
        className={`rounded-md border px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent ${error ? 'border-error' : 'border-neutral-300'} ${className}`}
        aria-describedby={error ? `${inputId}-error` : undefined}
        aria-invalid={error ? true : undefined}
        {...props}
      />
      {error && (
        <span id={`${inputId}-error`} role="alert" className="text-sm text-error">
          {error}
        </span>
      )}
    </div>
  )
}
