import { describe, expect, it } from 'vitest'
import { formatJakartaDateLabel, jakartaDateKey } from './jakartaDate'
import type { ProjectRabLine } from './project'
import { groupPostLockAdds } from './rabPostLockGroups'

describe('jakartaDateKey', () => {
  it('uses Asia/Jakarta calendar day', () => {
    expect(jakartaDateKey('2026-10-22T17:00:00.000Z')).toBe('2026-10-23')
    expect(jakartaDateKey('2026-10-22T16:59:00.000Z')).toBe('2026-10-22')
  })
})

describe('groupPostLockAdds', () => {
  it('groups by Jakarta date, who, and reason', () => {
    const lines: ProjectRabLine[] = [
      {
        key: 'a:u',
        materialItemId: 'a',
        materialCode: 'A',
        materialName: 'Alpha',
        itemUomId: 'u',
        uomSymbol: 'pcs',
        uomName: 'pcs',
        totalQty: '1',
        exactQty: null,
        wasteQty: null,
        rounding: null,
        unitPrice: null,
        tarifId: null,
        lineTotal: null,
        hasTarif: false,
        origin: 'append',
        addedAt: '2026-10-22T17:30:00.000Z',
        addedBy: { id: 'u1', name: 'Alice' },
        addReason: 'extra bracket',
        priceEditable: true,
      },
      {
        key: 'b:u',
        materialItemId: 'b',
        materialCode: 'B',
        materialName: 'Beta',
        itemUomId: 'u',
        uomSymbol: 'pcs',
        uomName: 'pcs',
        totalQty: '2',
        exactQty: null,
        wasteQty: null,
        rounding: null,
        unitPrice: null,
        tarifId: null,
        lineTotal: null,
        hasTarif: false,
        origin: 'append',
        addedAt: '2026-10-22T18:00:00.000Z',
        addedBy: { id: 'u1', name: 'Alice' },
        addReason: 'extra bracket',
        priceEditable: true,
      },
    ]
    const groups = groupPostLockAdds(lines)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.dateKey).toBe('2026-10-23')
    expect(groups[0]!.who).toBe('Alice')
    expect(groups[0]!.reason).toBe('extra bracket')
    expect(groups[0]!.lines).toHaveLength(2)
    expect(formatJakartaDateLabel(lines[0]!.addedAt!)).toMatch(/Oct 2026/)
  })
})
