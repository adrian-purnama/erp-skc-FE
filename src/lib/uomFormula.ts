/** Client-side UOM formula helpers for form UX. Server remains source of truth. */

export type UomVar = 'v1' | 'v2' | 'v3'

type Token =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: UomVar }
  | { kind: 'op'; op: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' }

const TOKEN_RE =
  /\s*(?:(\d+(?:\.\d+)?)|(v[123])|([+\-*/()])|(\S))/gy

function tokenize(expr: string): Token[] | null {
  const tokens: Token[] = []
  TOKEN_RE.lastIndex = 0
  while (TOKEN_RE.lastIndex < expr.length) {
    const m = TOKEN_RE.exec(expr)
    if (!m) break
    if (m[4]) return null
    if (m[1] !== undefined) {
      tokens.push({ kind: 'num', value: Number(m[1]) })
      continue
    }
    if (m[2] !== undefined) {
      tokens.push({ kind: 'var', name: m[2] as UomVar })
      continue
    }
    const ch = m[3]
    if (ch === '(') tokens.push({ kind: 'lparen' })
    else if (ch === ')') tokens.push({ kind: 'rparen' })
    else tokens.push({ kind: 'op', op: ch as '+' | '-' | '*' | '/' })
  }
  return tokens
}

function collectVars(tokens: Token[]): UomVar[] {
  const set = new Set<UomVar>()
  for (const t of tokens) {
    if (t.kind === 'var') set.add(t.name)
  }
  const ordered: UomVar[] = []
  for (const name of ['v1', 'v2', 'v3'] as const) {
    if (set.has(name)) ordered.push(name)
  }
  return ordered
}

export function formulaVariableCount(expr: string): number {
  const tokens = tokenize(expr.trim())
  if (!tokens) return 0
  const vars = collectVars(tokens)
  if (vars.length === 0) return 0
  for (let n = 0; n < vars.length; n += 1) {
    if (vars[n] !== (`v${n + 1}` as UomVar)) return 0
  }
  return vars.length
}

export function isValidUomFormulaShape(expr: string): boolean {
  const trimmed = expr.trim()
  if (!trimmed) return false
  const count = formulaVariableCount(trimmed)
  if (count === 0) return false
  const values: Partial<Record<UomVar, number>> = {}
  for (let n = 1; n <= count; n += 1) {
    values[`v${n}` as UomVar] = 1
  }
  return previewUomFormula(trimmed, values) !== null
}

function evalTokens(
  tokens: Token[],
  values: Partial<Record<UomVar, number>>,
): number | null {
  let i = 0

  function peek(): Token | undefined {
    return tokens[i]
  }
  function take(): Token | undefined {
    return tokens[i++]
  }

  function parseExpr(): number | null {
    let left = parseTerm()
    if (left === null) return null
    while (true) {
      const t = peek()
      if (t?.kind !== 'op' || (t.op !== '+' && t.op !== '-')) break
      take()
      const right = parseTerm()
      if (right === null) return null
      left = t.op === '+' ? left + right : left - right
    }
    return left
  }

  function parseTerm(): number | null {
    let left = parseFactor()
    if (left === null) return null
    while (true) {
      const t = peek()
      if (t?.kind !== 'op' || (t.op !== '*' && t.op !== '/')) break
      take()
      const right = parseFactor()
      if (right === null) return null
      if (t.op === '/') {
        if (right === 0) return null
        left = left / right
      } else {
        left = left * right
      }
    }
    return left
  }

  function parseFactor(): number | null {
    const t = peek()
    if (!t) return null
    if (t.kind === 'op' && t.op === '-') {
      take()
      const inner = parseFactor()
      return inner === null ? null : -inner
    }
    if (t.kind === 'op' && t.op === '+') {
      take()
      return parseFactor()
    }
    if (t.kind === 'lparen') {
      take()
      const inner = parseExpr()
      if (take()?.kind !== 'rparen') return null
      return inner
    }
    if (t.kind === 'num') {
      take()
      return t.value
    }
    if (t.kind === 'var') {
      take()
      const v = values[t.name]
      return v === undefined || Number.isNaN(v) ? null : v
    }
    return null
  }

  const result = parseExpr()
  if (result === null || i < tokens.length) return null
  return Number.isFinite(result) ? result : null
}

export function previewUomFormula(
  expr: string,
  values: Partial<Record<UomVar, number>>,
): number | null {
  const tokens = tokenize(expr.trim())
  if (!tokens) return null
  const count = formulaVariableCount(expr)
  if (count === 0) return null
  for (let n = 1; n <= count; n += 1) {
    const key = `v${n}` as UomVar
    if (values[key] === undefined || Number.isNaN(values[key]!)) return null
  }
  return evalTokens(tokens, values)
}

export function summarizeFormulas(formulas: string[]): string {
  if (!formulas.length) return 'v1'
  return formulas
    .map((f) => f.replaceAll(' * ', '×').replaceAll('*', '×'))
    .join(' · ')
}

export const FORMULA_PRESETS = [
  { label: 'Direct', expression: 'v1' },
  { label: 'Area', expression: 'v1 * v2' },
  { label: 'Volume', expression: 'v1 * v2 * v3' },
] as const
