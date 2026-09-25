import { useEffect, useState } from 'react'
import { createResumeProfileApi, type ResumeDraft, type ResumeDraftSummary, type ResumeProfile } from '../../services/resume-profiles'

const api = createResumeProfileApi()

function importError(reason: unknown): string {
  const message = reason instanceof Error ? reason.message : ''
  if (/\((413|415|422)\)/.test(message)) return 'Не удалось получить или распознать данные файла. Попробуйте другой PDF/DOCX или создайте черновик вручную.'
  return message || 'Не удалось выполнить запрос к серверу.'
}

export function ResumeProfilesPage() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([])
  const [drafts, setDrafts] = useState<ResumeDraftSummary[]>([])
  const [name, setName] = useState('')
  const [experienceText, setExperienceText] = useState('')
  const [draft, setDraft] = useState<ResumeDraft | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.list().then(setProfiles).catch((reason: Error) => setError(reason.message))
    api.listDrafts().then(setDrafts).catch((reason: Error) => setError(reason.message))
  }, [])

  async function createProfile(event: React.FormEvent) {
    event.preventDefault()
    try {
      const saved = await api.create(name)
      setProfiles((current) => [...current, saved]); setName(''); setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  async function createDraft() {
    try {
      const created = await api.createDraft()
      setDraft(created); setDrafts((current) => [...current, { draft_id: created.draft_id, state: created.state }]); setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  async function selectDraft(draftId: string) {
    try { setDraft(await api.getDraft(draftId)); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const imported = await api.importFile(file)
      setDraft(imported); setDrafts((current) => [...current, { draft_id: imported.draft_id, state: imported.state }]); setError('')
    } catch (reason) { setError(importError(reason)) }
  }

  async function addExperience(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || !experienceText.trim()) return
    try {
      setDraft(await api.addExperienceBlock(draft.draft_id, experienceText)); setExperienceText(''); setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  async function editBlock(blockId: string, text: string) {
    if (!draft) return
    try { setDraft(await api.editBlock(draft.draft_id, blockId, text)); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }

  async function updateProfile(id: string, patch: { name?: string; headline?: string | null }) {
    try {
      const updated = await api.update(id, patch)
      setProfiles((current) => current.map((item) => item.id === id ? updated : item)); setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  return <section aria-labelledby="resume-profiles-title">
    <h1 id="resume-profiles-title">Профили резюме</h1>
    <p>Создавайте отдельные специализации на общей базе кандидата.</p>
    <form onSubmit={createProfile}>
      <label htmlFor="profile-name">Название профиля</label>
      <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} required />
      <button type="submit">Создать профиль</button>
    </form>
    <ul aria-label="Сохранённые профили">
      {profiles.map((profile) => <li key={profile.id}>
        <label>Название профиля<input defaultValue={profile.name} onBlur={(event) => {
          if (event.target.value.trim() && event.target.value !== profile.name) void updateProfile(profile.id, { name: event.target.value })
        }} /></label>
        <label>Заголовок резюме<input defaultValue={profile.headline ?? ''} onBlur={(event) => {
          if (event.target.value !== (profile.headline ?? '')) void updateProfile(profile.id, { headline: event.target.value || null })
        }} /></label>
      </li>)}
    </ul>
    <section aria-label="Черновики резюме">
      <h2>Черновики</h2>
      <button type="button" onClick={() => void createDraft()}>Создать черновик</button>
      <ul>{drafts.map((item) => <li key={item.draft_id}>
        <button type="button" onClick={() => void selectDraft(item.draft_id)}>Черновик {item.draft_id.slice(0, 8)} ({item.state})</button>
      </li>)}</ul>
      <label htmlFor="resume-file">Импортировать PDF/DOCX в новый черновик</label>
      <input id="resume-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void importFile(event)} />
    </section>
    {draft && <section aria-label="Редактируемые блоки черновика">
      <h2>Черновик — изменения сохраняются отдельно от базы</h2>
      {draft.blocks.map((block) => <label key={block.id}>{block.heading ?? block.kind}
        <textarea aria-label={block.heading ?? block.kind} defaultValue={block.text} rows={5}
          onBlur={(event) => { if (event.target.value !== block.text) void editBlock(block.id, event.target.value) }} />
      </label>)}
      <form onSubmit={addExperience}>
        <label htmlFor="experience-text">Текст блока опыта</label>
        <textarea id="experience-text" value={experienceText} onChange={(event) => setExperienceText(event.target.value)} rows={5} />
        <button type="submit" disabled={!experienceText.trim()}>Добавить блок опыта</button>
      </form>
    </section>}
    {error && <p role="alert">{error}</p>}
  </section>
}
