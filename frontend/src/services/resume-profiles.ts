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
  state: string
  blocks: { id: string; kind: string; heading: string | null; text: string; ordinal: number }[]
}

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
    importText: (text: string) => request<ResumeDraft>('/resume-drafts/text', { method: 'POST', body: JSON.stringify({ text }) }),
    importFile: (file: File) => {
      const data = new FormData()
      data.append('file', file)
      return request<ResumeDraft>('/resume-drafts/file', { method: 'POST', body: data })
    },
    editBlock: (draftId: string, blockId: string, text: string) => request<ResumeDraft>(
      `/resume-drafts/${draftId}/blocks/${blockId}`, { method: 'PATCH', body: JSON.stringify({ text }) },
    ),
  }
}
