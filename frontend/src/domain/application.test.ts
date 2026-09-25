import { describe, expect, it } from 'vitest'
import { canSendApplication, type ApplicationPackage } from './application'
import { createFixtureApplicationService, createFixtureJobService, createFixtureProfileService } from '../services/fixtures'

const confirmed = { id: 'skill', section: 'skills' as const, status: 'confirmed' as const, value: 'TypeScript', provenance: 'user:profile' }
const pending = { ...confirmed, status: 'needs_review' as const }
const packageReady: ApplicationPackage = {
  id: 'application-job-1', jobId: 'job-1',
  documents: [
    { kind: 'resume', title: 'Резюме', content: 'TypeScript', baseContent: 'Base resume', usedFactIds: ['skill'] },
    { kind: 'letter', title: 'Письмо', content: 'TypeScript', usedFactIds: ['skill'] },
    { kind: 'explanation', title: 'Объяснение', content: 'TypeScript', usedFactIds: ['skill'] },
  ],
  selectedFactIds: ['skill'], usedFacts: [confirmed], warnings: [], blockers: [], sendState: 'content_confirmed',
}

describe('application send gate', () => {
  it('blocks sending when any used fact is unconfirmed', () => {
    expect(canSendApplication({ ...packageReady, usedFacts: [pending] })).toBe(false)
    expect(canSendApplication(packageReady)).toBe(true)
  })

  it('requires content confirmation and a complete package', () => {
    expect(canSendApplication({ ...packageReady, sendState: 'draft' })).toBe(false)
    expect(canSendApplication({ ...packageReady, documents: packageReady.documents.slice(0, 2) })).toBe(false)
    expect(canSendApplication({ ...packageReady, blockers: [{ kind: 'fact', factId: 'skill', message: 'Review fact' }] })).toBe(false)
    expect(canSendApplication({ ...packageReady, usedFacts: [], documents: packageReady.documents.map((document) => ({ ...document, usedFactIds: [] })) })).toBe(false)
  })

  it('returns the same result for repeated send calls with one idempotency key', async () => {
    const profile = createFixtureProfileService({
      sections: { basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable', skills: 'confirmed', education: 'not_applicable', languages: 'not_applicable', additional: 'not_applicable' },
      facts: [confirmed], conflicts: [], questions: [], resumeFactIds: ['skill'],
    })
    const jobs = createFixtureJobService([{
      id: 'job-1', title: 'Developer', company: 'Example', source: 'Example Board', publishedAt: '2026-09-24',
      score: 80, status: 'suitable', description: 'TypeScript', requiredSkills: ['TypeScript'],
      confirmedMatches: [], gaps: [],
    }])
    const service = createFixtureApplicationService(profile, jobs)
    const prepared = await service.prepare('job-1')
    await expect(service.send(prepared.id, 'send-once')).rejects.toThrow()
    await service.confirmContent(prepared.id)
    const first = await service.send(prepared.id, 'send-once')
    await profile.reviewFact({ id: 'skill', decision: 'reject' })
    const repeated = await service.send(prepared.id, 'send-once')
    expect(repeated).toEqual(first)
    expect(first.status).toBe('sent')
    await expect(service.send(prepared.id, 'new-key')).rejects.toThrow()
  })

  it('rechecks fact status after content confirmation', async () => {
    const profile = createFixtureProfileService({
      sections: { basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable', skills: 'confirmed', education: 'not_applicable', languages: 'not_applicable', additional: 'not_applicable' },
      facts: [confirmed], conflicts: [], questions: [], resumeFactIds: ['skill'],
    })
    const jobs = createFixtureJobService([{
      id: 'job-1', title: 'Developer', company: 'Example', source: 'Example Board', publishedAt: '2026-09-24',
      score: 80, status: 'suitable', description: 'TypeScript', requiredSkills: ['TypeScript'], confirmedMatches: [], gaps: [],
    }])
    const service = createFixtureApplicationService(profile, jobs)
    const prepared = await service.prepare('job-1')
    await service.confirmContent(prepared.id)
    await profile.reviewFact({ id: 'skill', decision: 'reject' })
    await expect(service.send(prepared.id, 'late-send')).rejects.toThrow()
  })

  it('blocks a confirmed package when restoring an unconfirmed selected fact until reprepare and reconfirm', async () => {
    const restoredFact = { ...confirmed, id: 'restored-skill', value: 'Accessibility', status: 'rejected' as const }
    const profile = createFixtureProfileService({
      sections: { basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable', skills: 'confirmed', education: 'not_applicable', languages: 'not_applicable', additional: 'not_applicable' },
      facts: [confirmed, restoredFact], conflicts: [], questions: [], resumeFactIds: ['skill'],
    })
    const jobs = createFixtureJobService([{
      id: 'job-1', title: 'Developer', company: 'Example', source: 'Example Board', publishedAt: '2026-09-24',
      score: 80, status: 'suitable', description: 'TypeScript', requiredSkills: ['TypeScript'], confirmedMatches: [], gaps: [],
    }])
    const service = createFixtureApplicationService(profile, jobs)
    const prepared = await service.prepare('job-1')
    await service.confirmContent(prepared.id)
    await profile.reviewFact({ id: 'restored-skill', decision: 'restore' })

    await expect(service.send(prepared.id, 'restored-send')).rejects.toThrow('Application send is blocked')
    const refreshed = await service.prepare('job-1')
    expect(refreshed.sendState).toBe('draft')
    expect(refreshed.blockers).toEqual([expect.objectContaining({ factId: 'restored-skill' })])
    await profile.reviewFact({ id: 'restored-skill', decision: 'confirm' })
    const ready = await service.prepare('job-1')
    expect(ready.sendState).toBe('draft')
    expect(ready.usedFacts.map((fact) => fact.id)).toEqual(['skill', 'restored-skill'])
    await expect(service.send(ready.id, 'restored-send')).rejects.toThrow('Application send is blocked')
    await service.confirmContent(ready.id)
    const first = await service.send(ready.id, 'restored-send')
    expect(await service.send(ready.id, 'restored-send')).toEqual(first)
  })

  it('rebuilds a blocked draft after the selected fact is confirmed', async () => {
    const profile = createFixtureProfileService({
      sections: { basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable', skills: 'needs_review', education: 'not_applicable', languages: 'not_applicable', additional: 'not_applicable' },
      facts: [pending], conflicts: [], questions: [], resumeFactIds: ['skill'],
    })
    const jobs = createFixtureJobService([{
      id: 'job-1', title: 'Developer', company: 'Example', source: 'Example Board', publishedAt: '2026-09-24',
      score: 80, status: 'suitable', description: 'TypeScript', requiredSkills: ['TypeScript'], confirmedMatches: [], gaps: [],
    }])
    const service = createFixtureApplicationService(profile, jobs)
    const first = await service.prepare('job-1')
    expect(first.blockers).toHaveLength(1)
    await service.confirmContent(first.id)
    await profile.reviewFact({ id: 'skill', decision: 'confirm' })
    const refreshed = await service.prepare('job-1')
    expect(refreshed.blockers).toHaveLength(0)
    expect(refreshed.sendState).toBe('draft')
    expect(refreshed.documents[0].content).toContain('TypeScript')
  })
})
