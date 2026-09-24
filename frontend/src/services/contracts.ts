import type { ExperienceProfile } from '../domain/profile'

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
