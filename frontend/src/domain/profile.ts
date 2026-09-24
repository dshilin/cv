export type FactStatus =
  | 'needs_input'
  | 'needs_review'
  | 'confirmed'
  | 'conflict'
  | 'not_applicable'
  | 'rejected'

export type ProfileSection =
  | 'basics'
  | 'employment'
  | 'projects'
  | 'skills'
  | 'education'
  | 'languages'
  | 'additional'

export type ProfileFact = {
  id: string
  section: ProfileSection
  status: FactStatus
  value: string
  provenance: string
}

export type ProfileIssue = { id: string; resolved: boolean }
export type ProfileQuestion = ProfileIssue & { mandatory: boolean }

export type ExperienceProfile = {
  sections: Record<ProfileSection, FactStatus>
  facts: ProfileFact[]
  conflicts: ProfileIssue[]
  questions: ProfileQuestion[]
  /** Fact IDs used to assemble a checkable draft without new claims. */
  resumeFactIds: string[]
}
