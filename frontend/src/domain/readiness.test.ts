import { describe, expect, it } from 'vitest'
import type { ExperienceProfile } from './profile'
import { evaluateProfileReadiness } from './readiness'

const readyProfile = (): ExperienceProfile => ({
  sections: {
    basics: 'confirmed',
    employment: 'not_applicable',
    projects: 'not_applicable',
    skills: 'confirmed',
    education: 'not_applicable',
    languages: 'not_applicable',
    additional: 'needs_input',
  },
  facts: [
    { id: 'name', section: 'basics', status: 'confirmed', value: 'Example Person', provenance: 'user:name' },
    { id: 'skill', section: 'skills', status: 'confirmed', value: 'TypeScript', provenance: 'user:skill' },
  ],
  conflicts: [],
  questions: [],
  resumeFactIds: ['name', 'skill'],
})

describe('evaluateProfileReadiness', () => {
  it('blocks an empty profile', () => {
    const profile: ExperienceProfile = {
      ...readyProfile(),
      sections: {
        basics: 'needs_input', employment: 'needs_input', projects: 'needs_input',
        skills: 'needs_input', education: 'needs_input', languages: 'needs_input',
        additional: 'needs_input',
      },
      facts: [],
      resumeFactIds: [],
    }

    const result = evaluateProfileReadiness(profile)

    expect(result.ready).toBe(false)
    expect(result.blockers.filter((blocker) => blocker.code === 'required_section')).toHaveLength(6)
    expect(result.blockers).toContainEqual({ code: 'not_reproducible' })
  })

  it('accepts confirmed or not-applicable required sections', () => {
    expect(evaluateProfileReadiness(readyProfile())).toEqual({ ready: true, blockers: [] })
  })

  it('blocks a name-only profile even when the name is traceable', () => {
    const profile = readyProfile()
    profile.sections.skills = 'not_applicable'
    profile.facts = profile.facts.filter((fact) => fact.id === 'name')
    profile.resumeFactIds = ['name']

    const result = evaluateProfileReadiness(profile)

    expect(result.ready).toBe(false)
    expect(result.blockers).toContainEqual({ code: 'not_reproducible' })
  })

  it('blocks a draft that omits its confirmed résumé content', () => {
    const profile = readyProfile()
    profile.resumeFactIds = ['name']

    expect(evaluateProfileReadiness(profile).blockers).toContainEqual({ code: 'not_reproducible' })
  })

  it('blocks unresolved conflicts and mandatory questions', () => {
    const profile = readyProfile()
    profile.conflicts = [{ id: 'dates', resolved: false }]
    profile.questions = [{ id: 'employer', mandatory: true, resolved: false }]

    const result = evaluateProfileReadiness(profile)

    expect(result.ready).toBe(false)
    expect(result.blockers).toContainEqual({ code: 'conflict', id: 'dates' })
    expect(result.blockers).toContainEqual({ code: 'mandatory_question', id: 'employer' })
  })

  it('requires provenance for every saved fact', () => {
    const profile = readyProfile()
    profile.facts.push({ id: 'project', section: 'projects', status: 'needs_review', value: 'Example project', provenance: ' ' })

    expect(evaluateProfileReadiness(profile).blockers).toContainEqual({ code: 'missing_provenance', id: 'project' })
  })

  it('does not require optional additional data', () => {
    const profile = readyProfile()
    profile.sections.additional = 'needs_review'

    expect(evaluateProfileReadiness(profile)).toEqual({ ready: true, blockers: [] })
  })

  it('requires a draft traceable to confirmed facts', () => {
    const profile = readyProfile()
    profile.resumeFactIds = ['name', 'unknown']

    expect(evaluateProfileReadiness(profile).blockers).toContainEqual({ code: 'not_reproducible' })
  })

  it('cannot reproduce a draft from an empty fact', () => {
    const profile = readyProfile()
    profile.facts[1].value = '  '

    expect(evaluateProfileReadiness(profile).blockers).toContainEqual({ code: 'not_reproducible' })
  })

  it('does not mutate the profile', () => {
    const profile = readyProfile()
    const before = structuredClone(profile)

    evaluateProfileReadiness(profile)

    expect(profile).toEqual(before)
  })
})
