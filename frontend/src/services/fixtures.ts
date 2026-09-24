import type { ExperienceProfile, ProfileFact, ProfileSection } from '../domain/profile'
import { isSourceAvailable, validateSearchActivation, type SearchProfile, type SourceConnection } from '../domain/search'
import type { ProfileService, ResolveIssueInput, ReviewFactInput, SearchService, SourceService, UpdateFactInput } from './contracts'

const initialProfile: ExperienceProfile = {
  sections: {
    basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable',
    skills: 'needs_review', education: 'not_applicable', languages: 'not_applicable',
    additional: 'needs_input',
  },
  facts: [
    { id: 'example-name', section: 'basics', status: 'confirmed', value: 'Example Person', provenance: 'user:profile' },
    { id: 'example-skill', section: 'skills', status: 'needs_review', value: 'TypeScript', provenance: 'resume:example.pdf' },
  ],
  conflicts: [],
  questions: [],
  resumeFactIds: ['example-name', 'example-skill'],
}

function updateSection(profile: ExperienceProfile, section: ProfileSection): void {
  const facts = profile.facts.filter((fact) => fact.section === section && fact.status !== 'rejected')
  if (facts.length && facts.every((fact) => fact.status === 'confirmed')) {
    profile.sections[section] = 'confirmed'
  } else if (!facts.length && profile.sections[section] !== 'not_applicable') {
    profile.sections[section] = 'needs_input'
  }
}

export function createFixtureProfileService(seed: ExperienceProfile = initialProfile): ProfileService {
  let profile = structuredClone(seed)

  function changeFact(id: string, change: (fact: ProfileFact) => ProfileFact): ExperienceProfile {
    const current = profile.facts.find((fact) => fact.id === id)
    if (!current) throw new Error(`Unknown fact: ${id}`)
    const next = structuredClone(profile)
    next.facts = next.facts.map((fact) => fact.id === id ? change(fact) : fact)
    updateSection(next, current.section)
    profile = next
    return structuredClone(profile)
  }

  return {
    async load() { return structuredClone(profile) },
    async updateFact({ id, value, provenance }: UpdateFactInput) {
      const trimmed = value.trim()
      const source = provenance.trim()
      if (!trimmed) throw new Error('Fact value is required')
      if (!source) throw new Error('Fact source is required')
      return changeFact(id, (fact) => ({
        ...fact,
        value: trimmed,
        status: 'confirmed',
        provenance: trimmed !== fact.value && source === fact.provenance
          ? `user:correction of ${fact.provenance}` : source,
      }))
    },
    async reviewFact({ id, decision }: ReviewFactInput) {
      if (decision === 'restore') {
        changeFact(id, (fact) => ({ ...fact, status: 'needs_review' }))
        profile.sections[profile.facts.find((fact) => fact.id === id)!.section] = 'needs_review'
        if (!profile.resumeFactIds.includes(id)) profile.resumeFactIds.push(id)
        return structuredClone(profile)
      }
      const next = changeFact(id, (fact) => ({
        ...fact,
        status: decision === 'confirm' ? 'confirmed' : 'rejected',
      }))
      if (decision === 'reject') {
        profile.resumeFactIds = profile.resumeFactIds.filter((factId) => factId !== id)
        return structuredClone(profile)
      }
      return next
    },
    async resolveIssue({ kind, id, resolution }: ResolveIssueInput) {
      if (!resolution.trim()) throw new Error('Issue resolution is required')
      const next = structuredClone(profile)
      if (kind === 'conflict') {
        const issue = next.conflicts.find((conflict) => conflict.id === id)
        if (!issue) throw new Error(`Unknown conflict: ${id}`)
        issue.resolved = true
        issue.resolution = resolution.trim()
      } else {
        const question = next.questions.find((item) => item.id === id)
        if (!question) throw new Error(`Unknown question: ${id}`)
        question.resolved = true
        question.resolution = resolution.trim()
      }
      profile = next
      return structuredClone(profile)
    },
  }
}

export const fixtureProfileService = createFixtureProfileService()

const initialConnections: SourceConnection[] = [
  { id: 'example-board', status: 'disconnected', consent: 'missing', tokenStatus: 'absent' },
]

export function createFixtureSourceService(seed: SourceConnection[] = initialConnections): SourceService {
  let connections = structuredClone(seed)
  const listeners = new Set<(before: SourceConnection[], after: SourceConnection[]) => void>()
  const update = (id: string, change: (source: SourceConnection) => SourceConnection) => {
    if (!connections.some((source) => source.id === id)) throw new Error(`Unknown source: ${id}`)
    const before = structuredClone(connections)
    connections = connections.map((source) => source.id === id ? change(source) : source)
    for (const listener of listeners) listener(before, structuredClone(connections))
    return structuredClone(connections)
  }
  return {
    async list() { return structuredClone(connections) },
    // Local simulation only. Real source authorization requires a separate provider OAuth flow.
    async connect(id) { return update(id, (source) => ({ ...source, status: 'connected', consent: 'granted', tokenStatus: 'valid' })) },
    async check(id) { return update(id, (source) => ({ ...source })) },
    async disconnect(id) { return update(id, (source) => ({ ...source, status: 'disconnected', consent: 'revoked', tokenStatus: 'absent' })) },
    async revokeConsent(id) { return update(id, (source) => ({ ...source, consent: 'revoked' })) },
    async requireReconnect(id) { return update(id, (source) => ({ ...source, status: 'reconnect_required', tokenStatus: 'expired' })) },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}

export function createFixtureSearchService(sourceService: SourceService, seed: SearchProfile[] = []): SearchService {
  let profiles = structuredClone(seed)
  sourceService.subscribe((before, after) => {
    const lost = before.filter((previous) => {
      const current = after.find((source) => source.id === previous.id)
      return isSourceAvailable(previous) && !isSourceAvailable(current)
    }).map((source) => source.id)
    if (lost.length) profiles = profiles.map((profile) =>
      profile.active && profile.sources.some((id) => lost.includes(id)) ? { ...profile, active: false } : profile)
  })
  return {
    async list() { return structuredClone(profiles) },
    async save(profile) {
      const next = { ...structuredClone(profile), active: false }
      const index = profiles.findIndex((item) => item.id === next.id)
      if (index < 0) profiles.push(next)
      else profiles[index] = next
      return structuredClone(profiles)
    },
    async activate(id) {
      const profile = profiles.find((item) => item.id === id)
      if (!profile) throw new Error(`Unknown search profile: ${id}`)
      const connections = await sourceService.list()
      if (!validateSearchActivation(profile, connections).canActivate) throw new Error('Search activation is blocked')
      profiles = profiles.map((item) => item.id === id ? { ...item, active: true } : item)
      return structuredClone(profiles)
    },
  }
}

export const fixtureSourceService = createFixtureSourceService()
export const fixtureSearchService = createFixtureSearchService(fixtureSourceService)
