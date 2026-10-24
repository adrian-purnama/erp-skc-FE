import {
  formatJakartaDateLabel,
  jakartaDateKey,
} from '#/lib/jakartaDate'
import type { ProjectRabLine } from '#/lib/project'

export type PostLockAddGroup = {
  key: string
  dateKey: string
  dateLabel: string
  who: string
  reason: string
  lines: ProjectRabLine[]
}

/** Group append / post-lock labour by Jakarta calendar day + user + reason. */
export function groupPostLockAdds(lines: ProjectRabLine[]): PostLockAddGroup[] {
  const map = new Map<string, PostLockAddGroup>()
  for (const line of lines) {
    if (!line.addedAt) continue
    const dateKey = jakartaDateKey(line.addedAt)
    const who = line.addedBy?.name?.trim() || line.addedBy?.id || '—'
    const reason = line.addReason?.trim() || '—'
    const key = `${dateKey}::${line.addedBy?.id ?? who}::${reason}`
    let group = map.get(key)
    if (!group) {
      group = {
        key,
        dateKey,
        dateLabel: formatJakartaDateLabel(line.addedAt),
        who,
        reason,
        lines: [],
      }
      map.set(key, group)
    }
    group.lines.push(line)
  }
  return [...map.values()].sort((a, b) => {
    const byDate = b.dateKey.localeCompare(a.dateKey)
    if (byDate !== 0) return byDate
    return a.who.localeCompare(b.who)
  })
}
