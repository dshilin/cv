import type { ExperienceProfile } from '../domain/profile'
import type { ApplicationPackage, SendResult } from '../domain/application'
import type { SearchProfile, SourceConnection } from '../domain/search'

export type UpdateFactInput = { id: string; value: string; provenance: string }
export type ReviewFactInput = { id: string; decision: 'confirm' | 'reject' | 'restore' }
export type ResolveIssueInput = {
  kind: 'conflict' | 'question'
  id: string
  resolution: string
}

export interface ProfileService {
  load(): Promise<ExperienceProfile>
  updateFact(input: UpdateFactInput): Promise<ExperienceProfile>
  reviewFact(input: ReviewFactInput): Promise<ExperienceProfile>
  resolveIssue(input: ResolveIssueInput): Promise<ExperienceProfile>
  clear(): Promise<void>
}

export interface SourceService {
  list(): Promise<SourceConnection[]>
  connect(id: string): Promise<SourceConnection[]>
  check(id: string): Promise<SourceConnection[]>
  disconnect(id: string): Promise<SourceConnection[]>
  revokeConsent(id: string): Promise<SourceConnection[]>
  reset(id: string): Promise<SourceConnection[]>
  requireReconnect(id: string): Promise<SourceConnection[]>
  subscribe(listener: (before: SourceConnection[], after: SourceConnection[]) => void): () => void
}

export interface SearchService {
  list(): Promise<SearchProfile[]>
  save(profile: SearchProfile): Promise<SearchProfile[]>
  activate(id: string): Promise<SearchProfile[]>
  deactivateAll(): Promise<SearchProfile[]>
  clear(): Promise<void>
}

export type JobStatus = 'new' | 'suitable' | 'needs_review' | 'saved' | 'rejected' | 'preparing' | 'sent'

export interface JobSummary {
  id: string
  title: string
  company: string
  source: string
  publishedAt: string
  score: number
  status: JobStatus
  confirmedMatches: ConfirmedMatch[]
  gaps: string[]
}

export interface ConfirmedMatch {
  requirement: string
  fact: string
  factId: string
}

export interface JobDetails extends JobSummary {
  description: string
  requiredSkills: string[]
}

export interface JobService {
  list(): Promise<JobSummary[]>
  get(id: string): Promise<JobDetails>
  clear(): Promise<void>
}

export interface ApplicationService {
  prepare(jobId: string): Promise<ApplicationPackage>
  confirmContent(id: string): Promise<ApplicationPackage>
  send(id: string, idempotencyKey: string): Promise<SendResult>
  pendingCount(): Promise<number>
  clear(): Promise<void>
}

export interface SettingsService {
  listSources(): Promise<SourceConnection[]>
  revokeConsent(): Promise<SourceConnection[]>
  disableAutomation(): Promise<void>
  deleteData(): Promise<void>
}
