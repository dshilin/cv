import type { ExperienceProfile } from '../domain/profile'
import type { ApplicationService, JobService, ProfileService, SearchService, SourceService } from './contracts'

const emptyProfile: ExperienceProfile = {
  sections: {
    basics: 'needs_input', employment: 'needs_input', projects: 'needs_input',
    skills: 'needs_input', education: 'needs_input', languages: 'needs_input', additional: 'needs_input',
  },
  facts: [], conflicts: [], questions: [], resumeFactIds: [],
}

const unavailable = () => Promise.reject(new Error('This feature is not connected to a backend service.'))

export const emptyProfileService: ProfileService = {
  async load() { return structuredClone(emptyProfile) },
  async updateFact() { return unavailable() },
  async reviewFact() { return unavailable() },
  async resolveIssue() { return unavailable() },
  async clear() { return undefined },
}

export const emptySourceService: SourceService = {
  async list() { return [] },
  async connect() { return unavailable() },
  async check() { return unavailable() },
  async disconnect() { return unavailable() },
  async revokeConsent() { return unavailable() },
  async reset() { return unavailable() },
  async requireReconnect() { return unavailable() },
  subscribe() { return () => undefined },
}

export const emptySearchService: SearchService = {
  async list() { return [] },
  async save() { return unavailable() },
  async activate() { return unavailable() },
  async deactivateAll() { return [] },
  async clear() { return undefined },
}

export const emptyJobService: JobService = {
  async list() { return [] },
  async get() { return unavailable() },
  async clear() { return undefined },
}

export const unavailableApplicationService: ApplicationService = {
  async prepare() { return unavailable() },
  async confirmContent() { return unavailable() },
  async send() { return unavailable() },
  async pendingCount() { return 0 },
  async clear() { return undefined },
}
