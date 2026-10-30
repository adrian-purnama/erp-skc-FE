/**
 * Same rule as the server RAB (projectRabUomPlan / roundRabQty), for previews:
 * a line lands in the base UOM when its UOM is base or related, else in its
 * own UOM; the step comes from the item UOM row that sets decimals in that
 * group (converted to base units), else the target UOM's own decimals.
 */

export type RoundingUom = {
  id: string
  isBase: boolean
  conversionFactor: string | null
  decimals: number | null
  rounding: 'up' | 'nearest' | 'down'
  symbol: string
  uomDecimals: number
}

export type LinePurchase = {
  /** Exact need in the target UOM. */
  need: number
  /** Need rounded by the item rule. */
  buy: number
  symbol: string
  step: number
  mode: RoundingUom['rounding']
}

/** Drops float noise (0.1 + 0.2) without losing the 8 dp the server keeps. */
export function cleanNumber(n: number): number {
  return Number(n.toFixed(8))
}

function isRelated(u: RoundingUom): boolean {
  return !u.isBase && u.conversionFactor != null && u.conversionFactor !== ''
}

function factorOf(u: RoundingUom): number {
  return isRelated(u) ? Number(u.conversionFactor) : 1
}

export function roundToStep(
  qty: number,
  step: number,
  mode: RoundingUom['rounding'],
): number {
  // Strip noise first so 2.00000001 does not round up to 3.
  const steps = Number((qty / step).toFixed(6))
  const whole =
    mode === 'up'
      ? Math.ceil(steps)
      : mode === 'down'
        ? Math.floor(steps)
        : Math.round(steps)
  return cleanNumber(whole * step)
}

/** Need and purchase qty for `qty` of `lineUomId`, or null if unknown. */
export function linePurchase(
  uoms: RoundingUom[],
  lineUomId: string,
  qty: number,
): LinePurchase | null {
  const line = uoms.find((u) => u.id === lineUomId)
  if (!line || !Number.isFinite(qty)) return null
  const base = uoms.find((u) => u.isBase)
  const toBase = base !== undefined && (line.isBase || isRelated(line))
  const target = toBase ? base : line
  const need = cleanNumber(qty * (toBase ? factorOf(line) : 1))

  const group = target.isBase
    ? uoms.filter((u) => u.isBase || isRelated(u))
    : [target]
  const ruleRow = group.find((u) => u.decimals != null)
  const step = ruleRow
    ? cleanNumber(10 ** -(ruleRow.decimals ?? 0) * factorOf(ruleRow))
    : 10 ** -target.uomDecimals
  const mode = (ruleRow ?? target).rounding
  return {
    need,
    buy: roundToStep(need, step, mode),
    symbol: target.symbol,
    step,
    mode,
  }
}
