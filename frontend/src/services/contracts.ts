import type { ExperienceProfile } from '../domain/profile'
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
}

export interface SourceService {
  list(): Promise<SourceConnection[]>
  connect(id: string): Promise<SourceConnection[]>
  check(id: string): Promise<SourceConnection[]>
  disconnect(id: string): Promise<SourceConnection[]>
}

export interface SearchService {
  list(): Promise<SearchProfile[]>
  save(profile: SearchProfile): Promise<SearchProfile[]>
  activate(id: string, connections: SourceConnection[]): Promise<SearchProfile[]>
}
