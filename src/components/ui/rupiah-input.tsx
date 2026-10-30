import * as React from "react"
import { Input } from "#/components/ui/input"
import { cn } from "#/lib/utils"

/** Digits only (integer rupiah). */
export function rupiahDigits(raw: string): string {
  return raw.replace(/\D/g, "")
}

/** "1016400" → "1.016.400" (empty stays empty). */
export function formatRupiahDigits(digits: string): string {
  if (!digits) return ""
  const n = Number(digits)
  if (!Number.isFinite(n)) return ""
  return new Intl.NumberFormat("id-ID").format(n)
}

/** How many digit characters sit before `caret` in `str`. */
function digitCountBefore(str: string, caret: number): number {
  let count = 0
  const end = Math.min(caret, str.length)
  for (let i = 0; i < end; i++) {
    if (str[i]! >= "0" && str[i]! <= "9") count++
  }
  return count
}

/** Caret index in `formatted` that sits after `digitIndex` digits. */
function caretAfterDigits(formatted: string, digitIndex: number): number {
  if (digitIndex <= 0) return 0
  let seen = 0
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i]! >= "0" && formatted[i]! <= "9") {
      seen++
      if (seen === digitIndex) return i + 1
    }
  }
  return formatted.length
}

type RupiahInputProps = Omit<
  React.ComponentProps<"input">,
  "value" | "onChange" | "type"
> & {
  /** Integer rupiah as plain digits ("" = empty). */
  value: string
  onValueChange: (digits: string) => void
  /** Classes for the wrapper (the input fills the remaining width). */
  wrapperClassName?: string
}

/** "Rp" + thousand-separated input; the value in and out is digits only. */
function RupiahInput({
  value,
  onValueChange,
  wrapperClassName,
  className,
  ...props
}: RupiahInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  /** Digits before caret from the last edit; applied after reformat. */
  const pendingDigitCaret = React.useRef<number | null>(null)

  const display = formatRupiahDigits(value)

  React.useLayoutEffect(() => {
    const el = inputRef.current
    const digitIndex = pendingDigitCaret.current
    if (!el || digitIndex === null) return
    pendingDigitCaret.current = null
    const pos = caretAfterDigits(display, digitIndex)
    el.setSelectionRange(pos, pos)
  }, [display])

  return (
    <div className={cn("flex items-center gap-1.5", wrapperClassName)}>
      <span className="text-xs text-(--muted)">Rp</span>
      <Input
        ref={inputRef}
        inputMode="numeric"
        placeholder="0"
        {...props}
        value={display}
        onChange={(e) => {
          const el = e.target
          pendingDigitCaret.current = digitCountBefore(
            el.value,
            el.selectionStart ?? el.value.length,
          )
          onValueChange(rupiahDigits(el.value))
        }}
        className={cn("min-w-0 flex-1 tabular-nums", className)}
      />
    </div>
  )
}

export { RupiahInput }
