import { Eye, EyeOff } from 'lucide-react'
import { useState } from 'react'
import { inputClassNameCompact } from '#/lib/ui-classes'
import { cn } from '#/lib/utils'

interface PasswordInputProps {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete?: string
  className?: string
  placeholder?: string
}

export default function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  className,
  placeholder,
}: PasswordInputProps) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative w-full">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          inputClassNameCompact,
          'pr-10',
          className,
        )}
      />
      <button
        type="button"
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((current) => !current)}
        className="absolute top-1/2 right-3 -translate-y-1/2 text-[var(--muted)] transition hover:text-[var(--ink)]"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}
