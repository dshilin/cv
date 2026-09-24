export type SourceStatus = 'disconnected' | 'connected' | 'reconnect_required' | 'error'
export type ConsentState = 'missing' | 'granted' | 'revoked'
export type TokenStatus = 'absent' | 'valid' | 'expired' | 'error'
export type SourceConnection = { id: string; status: SourceStatus; consent: ConsentState; tokenStatus: TokenStatus }

export type SearchScope = { regions: string[]; remote: boolean }
export type SearchMode = '' | 'recommendations' | 'prepare_after_confirmation'
export type SearchFilters = {
  requiredSkills: string[]
  desiredSkills: string[]
  seniority: string
  salaryMinimum: string
  employmentType: string
  stopWords: string[]
  schedule: string
  timezone: string
  dailyLimit: string
}
export type SearchProfile = {
  id: string
  roles: string[]
  query?: string
  sources: string[]
  scope: SearchScope
  mode: SearchMode
  active: boolean
  filters?: SearchFilters
}
export type SearchActivationBlocker = 'source' | 'query' | 'scope' | 'mode' | 'revoked_consent'
export type SearchActivationResult = {
  canActivate: boolean
  blockers: SearchActivationBlocker[]
  availableSourceIds: string[]
}

export function isSourceAvailable(source: SourceConnection | undefined): boolean {
  return source?.status === 'connected' && source.consent === 'granted' && source.tokenStatus === 'valid'
}

export function validateSearchActivation(profile: SearchProfile, connections: SourceConnection[]): SearchActivationResult {
  const selected = profile.sources.map((id) => connections.find((source) => source.id === id))
  const availableSourceIds = selected.filter((source) => isSourceAvailable(source))
    .map((source) => source!.id)
  const blockers: SearchActivationBlocker[] = []
  if (!availableSourceIds.length) blockers.push('source')
  if (!profile.roles.some((role) => role.trim()) && !profile.query?.trim()) blockers.push('query')
  if (!profile.scope.remote && !profile.scope.regions.some((region) => region.trim())) blockers.push('scope')
  if (!profile.mode) blockers.push('mode')
  if (selected.some((source) => source?.consent === 'revoked')) blockers.push('revoked_consent')
  return { canActivate: blockers.length === 0, blockers, availableSourceIds }
}
