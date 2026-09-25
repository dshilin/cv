import { useEffect, useState } from 'react'
import { createResumeProfileApi, type ResumeDraft, type ResumeProfile } from '../../services/resume-profiles'

const api = createResumeProfileApi()

export function ResumeProfilesPage() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([])
  const [name, setName] = useState('')
  const [resumeText, setResumeText] = useState('')
  const [draft, setDraft] = useState<ResumeDraft | null>(null)
  const [error, setError] = useState('')

  useEffect(() => { api.list().then(setProfiles).catch((reason: Error) => setError(reason.message)) }, [])

  async function createProfile(event: React.FormEvent) {
    event.preventDefault()
    try {
      const saved = await api.create(name)
      setProfiles((current) => [...current, saved])
      setName('')
      setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  async function importResume(event: React.FormEvent) {
    event.preventDefault()
    try { setDraft(await api.importText(resumeText)); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }

  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try { setDraft(await api.importFile(file)); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }

  async function editBlock(blockId: string, text: string) {
    if (!draft) return
    try { setDraft(await api.editBlock(draft.draft_id, blockId, text)); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }

  async function updateProfile(id: string, patch: { name?: string; headline?: string | null }) {
    try {
      const updated = await api.update(id, patch)
      setProfiles((current) => current.map((item) => item.id === id ? updated : item))
      setError('')
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
        <label>Название профиля
          <input defaultValue={profile.name} onBlur={(event) => {
            if (event.target.value.trim() && event.target.value !== profile.name) void updateProfile(profile.id, { name: event.target.value })
          }} />
        </label>
        <label>Заголовок резюме
          <input defaultValue={profile.headline ?? ''} onBlur={(event) => {
            if (event.target.value !== (profile.headline ?? '')) void updateProfile(profile.id, { headline: event.target.value || null })
          }} />
        </label>
      </li>)}
    </ul>
    <form onSubmit={importResume}>
      <label htmlFor="resume-source-text">Текст резюме</label>
      <textarea id="resume-source-text" value={resumeText} onChange={(event) => setResumeText(event.target.value)} rows={8} />
      <button type="submit" disabled={!resumeText.trim()}>Разобрать в черновик</button>
    </form>
    <label htmlFor="resume-file">Или загрузите PDF/DOCX</label>
    <input id="resume-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void importFile(event)} />
    {draft && <section aria-label="Редактируемые блоки черновика">
      <h2>Черновик — изменения сохраняются отдельно от базы</h2>
      {draft.blocks.map((block) => <label key={block.id}>
        {block.heading ?? block.kind}
        <textarea aria-label={block.heading ?? block.kind} defaultValue={block.text} rows={5}
          onBlur={(event) => { if (event.target.value !== block.text) void editBlock(block.id, event.target.value) }} />
      </label>)}
    </section>}
    {error && <p role="alert">{error}</p>}
  </section>
}
