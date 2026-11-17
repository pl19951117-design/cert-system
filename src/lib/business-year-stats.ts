export function businessYear(date: string | null | undefined): string {
  return date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 4) : ''
}
export function matchesBusinessYear(date: string | null | undefined, year: string): boolean {
  return !year || (year === 'undated' ? !businessYear(date) : businessYear(date) === year)
}
export type AnnualBusinessStats = { year: string; projects: number; prosecutions: number; defenses: number; unclassified: number }
export function computeBusinessYearStats(
  inspections: { projectName: string; inspectionDate: string | null }[],
  cases: { businessCategory: string | null; hearingDate: string | null }[],
  currentYear: string,
) {
  const rows = new Map<string, AnnualBusinessStats>()
  const projects = new Map<string, Set<string>>()
  const row = (year: string) => {
    if (!rows.has(year)) rows.set(year, { year, projects: 0, prosecutions: 0, defenses: 0, unclassified: 0 })
    return rows.get(year)!
  }
  row(currentYear)
  let undatedInspections = 0, undatedCases = 0
  for (const inspection of inspections) {
    const year = businessYear(inspection.inspectionDate)
    if (!year) { undatedInspections++; continue }
    row(year)
    if (!projects.has(year)) projects.set(year, new Set())
    if (inspection.projectName.trim()) projects.get(year)!.add(inspection.projectName.trim())
  }
  for (const item of cases) {
    const year = businessYear(item.hearingDate)
    if (!year) { undatedCases++; continue }
    const stats = row(year)
    if (item.businessCategory === '起诉') stats.prosecutions++
    else if (item.businessCategory === '应诉') stats.defenses++
    else stats.unclassified++
  }
  for (const [year, names] of projects) row(year).projects = names.size
  return { years: [...rows.values()].sort((a, b) => b.year.localeCompare(a.year)), undatedInspections, undatedCases }
}
