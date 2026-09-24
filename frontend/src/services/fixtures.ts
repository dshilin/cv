import type { ExperienceProfile, ProfileFact, ProfileSection } from '../domain/profile'
import type { ProfileService, ReviewFactInput, UpdateFactInput } from './contracts'

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
  }
}

export const fixtureProfileService = createFixtureProfileService()
