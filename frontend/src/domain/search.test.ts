import { describe, expect, it } from 'vitest'
import { validateSearchActivation, type SearchProfile, type SourceConnection } from './search'

const connected: SourceConnection = { id: 'board-a', status: 'connected', consent: 'granted' }
const valid = (): SearchProfile => ({
  id: 'search-a', roles: ['Backend Developer'], sources: ['board-a'],
  scope: { regions: [], remote: true }, mode: 'recommendations', active: false,
})

describe('validateSearchActivation', () => {
  it('requires a source, role or query, search scope, and processing mode', () => {
    const profile: SearchProfile = { ...valid(), roles: [], query: '', sources: [], scope: { regions: [], remote: false }, mode: '' }
    expect(validateSearchActivation(profile, [])).toEqual({
      canActivate: false,
      blockers: ['source', 'query', 'scope', 'mode'],
      availableSourceIds: [],
    })
  })

  it('accepts a keyword query without a role', () => {
    expect(validateSearchActivation({ ...valid(), roles: [], query: 'TypeScript' }, [connected]).canActivate).toBe(true)
  })

  it('keeps a saved search profile when one source is disconnected', () => {
    const profile = { ...valid(), sources: ['board-a', 'board-b'] }
    const result = validateSearchActivation(profile, [connected, { id: 'board-b', status: 'reconnect_required', consent: 'granted' }])
    expect(result).toEqual({ canActivate: true, blockers: [], availableSourceIds: ['board-a'] })
    expect(profile.sources).toEqual(['board-a', 'board-b'])
  })

  it('does not activate a profile with a revoked consent', () => {
    const result = validateSearchActivation(valid(), [{ ...connected, consent: 'revoked' }])
    expect(result.canActivate).toBe(false)
    expect(result.blockers).toContain('revoked_consent')
  })

  it('does not count a connected source without search consent', () => {
    const result = validateSearchActivation(valid(), [{ ...connected, consent: 'missing' }])
    expect(result.canActivate).toBe(false)
    expect(result.availableSourceIds).toEqual([])
  })
})
