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
  return (
    <div className={cn("flex items-center gap-1.5", wrapperClassName)}>
      <span className="text-xs text-(--muted)">Rp</span>
      <Input
        inputMode="numeric"
        placeholder="0"
        {...props}
        value={formatRupiahDigits(value)}
        onChange={(e) => onValueChange(rupiahDigits(e.target.value))}
        className={cn("min-w-0 flex-1 tabular-nums", className)}
      />
    </div>
  )
}

export { RupiahInput }
