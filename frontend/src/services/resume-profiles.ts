export type ResumeProfile = {
  id: string
  name: string
  target_roles: string[]
  search_preferences: Record<string, unknown>
  headline: string | null
  summary: string | null
  section_order: string[]
  text_overrides: Record<string, string>
  candidate_item_ids: string[]
  skill_ids: string[]
  tool_ids: string[]
}

export type ResumeDraft = {
  draft_id: string
  title: string
  created_at: string
  updated_at: string
  state: string
  application_progress: 'none' | 'partial' | 'complete'
  applied_blocks: number
  total_blocks: number
  blocks: { id: string; kind: string; heading: string | null; text: string; ordinal: number }[]
}

export type ResumeDraftSummary = Pick<ResumeDraft, 'draft_id' | 'title' | 'created_at' | 'updated_at' | 'state' | 'application_progress' | 'applied_blocks' | 'total_blocks'>
export type CandidateContact = { id: string; kind: 'contact'; label: string; value: string; status: string }
export type CandidateBase = { full_name: string | null; contacts: CandidateContact[] }

export function createResumeProfileApi(baseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1') {
  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const isForm = init?.body instanceof FormData
    const headers = new Headers(init?.headers)
    if (!isForm && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
    const response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    })
    if (!response.ok) throw new Error(`Backend request failed (${response.status})`)
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }
  return {
    list: () => request<ResumeProfile[]>('/profiles'),
    create: (name: string) => request<ResumeProfile>('/profiles', { method: 'POST', body: JSON.stringify({ name }) }),
    update: (id: string, patch: Partial<Pick<ResumeProfile, 'name' | 'headline' | 'summary' | 'target_roles' | 'search_preferences' | 'section_order'>>) =>
      request<ResumeProfile>(`/profiles/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    listDrafts: () => request<ResumeDraftSummary[]>('/resume-drafts'),
    saveDraft: (draftId: string, changes: { title?: string; blocks?: { id: string; text: string }[] }) => request<ResumeDraft>(
      `/resume-drafts/${draftId}`, { method: 'PATCH', body: JSON.stringify(changes) },
    ),
    reviewDraft: (draftId: string) => request<ResumeDraft>(`/resume-drafts/${draftId}/review`, { method: 'POST' }),
    createDraft: () => request<ResumeDraft>('/resume-drafts', { method: 'POST' }),
    importFile: (file: File) => {
      const data = new FormData()
      data.append('file', file)
      return request<ResumeDraft>('/resume-drafts/file', { method: 'POST', body: data })
    },
    editBlock: (draftId: string, blockId: string, text: string) => request<ResumeDraft>(
      `/resume-drafts/${draftId}/blocks/${blockId}`, { method: 'PATCH', body: JSON.stringify({ text }) },
    ),
    addExperienceBlock: (draftId: string, text: string) => request<ResumeDraft>(
      `/resume-drafts/${draftId}/experience-blocks`, { method: 'POST', body: JSON.stringify({ text }) },
    ),
    getDraft: (draftId: string) => request<ResumeDraft>(`/resume-drafts/${draftId}`),
    getCandidateBase: () => request<CandidateBase>('/candidate-base'),
    updateCandidateBase: (full_name: string | null) => request<CandidateBase>('/candidate-base', {
      method: 'PATCH', body: JSON.stringify({ full_name }),
    }),
    addContact: (contact: Pick<CandidateContact, 'label' | 'value'>) => request<CandidateContact>('/candidate-base/contacts', {
      method: 'POST', body: JSON.stringify({ kind: 'contact', ...contact }),
    }),
    updateContact: (id: string, changes: Partial<Pick<CandidateContact, 'label' | 'value'>>) => request<CandidateContact>(
      `/candidate-base/contacts/${id}`, { method: 'PATCH', body: JSON.stringify(changes) },
    ),
    deleteContact: (id: string) => request<void>(`/candidate-base/contacts/${id}`, { method: 'DELETE' }),
  }
}
