import type { ExperienceProfile, FactStatus, ProfileSection } from './profile'

export type ReadinessBlocker =
  | { code: 'required_section'; section: ProfileSection }
  | { code: 'missing_provenance' | 'conflict' | 'mandatory_question' | 'invalid_status'; id: string }
  | { code: 'not_reproducible' }

export type ProfileReadiness = { ready: boolean; blockers: ReadinessBlocker[] }

const requiredSections: ProfileSection[] = [
  'basics', 'employment', 'projects', 'skills', 'education', 'languages',
]

const validStatuses: FactStatus[] = [
  'needs_input', 'needs_review', 'confirmed', 'conflict', 'not_applicable', 'rejected',
]

export function evaluateProfileReadiness(profile: ExperienceProfile): ProfileReadiness {
  const blockers: ReadinessBlocker[] = []

  for (const section of requiredSections) {
    if (profile.sections[section] !== 'confirmed' && profile.sections[section] !== 'not_applicable') {
      blockers.push({ code: 'required_section', section })
    }
  }

  for (const fact of profile.facts) {
    if (!validStatuses.includes(fact.status)) blockers.push({ code: 'invalid_status', id: fact.id })
    if (!fact.provenance.trim()) blockers.push({ code: 'missing_provenance', id: fact.id })
    if (fact.status === 'conflict') blockers.push({ code: 'conflict', id: fact.id })
  }

  for (const conflict of profile.conflicts) {
    if (!conflict.resolved) blockers.push({ code: 'conflict', id: conflict.id })
  }

  for (const question of profile.questions) {
    if (question.mandatory && !question.resolved) {
      blockers.push({ code: 'mandatory_question', id: question.id })
    }
  }

  const reproducible = profile.resumeFactIds.length > 0 && profile.resumeFactIds.every((id) =>
    profile.facts.some((fact) =>
      fact.id === id && fact.status === 'confirmed' && fact.value.trim() && fact.provenance.trim(),
    ),
  )
  if (!reproducible) blockers.push({ code: 'not_reproducible' })

  return { ready: blockers.length === 0, blockers }
}
