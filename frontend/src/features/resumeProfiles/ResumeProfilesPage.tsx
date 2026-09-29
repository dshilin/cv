import { useEffect, useState } from 'react'
import { createResumeProfileApi, type CandidateBase, type ResumeProfile } from '../../services/resume-profiles'

const api = createResumeProfileApi()

export function ResumeProfilesPage() {
  const [profiles, setProfiles] = useState<ResumeProfile[]>([])
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [candidateBase, setCandidateBase] = useState<CandidateBase>({ full_name: null, contacts: [] })
  const [contactLabel, setContactLabel] = useState('')
  const [contactValue, setContactValue] = useState('')

  useEffect(() => {
    api.list().then(setProfiles).catch((reason: Error) => setError(reason.message))
    api.getCandidateBase().then(setCandidateBase).catch((reason: Error) => setError(reason.message))
  }, [])

  async function createProfile(event: React.FormEvent) {
    event.preventDefault()
    try {
      const saved = await api.create(name)
      setProfiles((current) => [...current, saved]); setName(''); setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  async function updateProfile(id: string, patch: { name?: string; headline?: string | null }) {
    try {
      const updated = await api.update(id, patch)
      setProfiles((current) => current.map((item) => item.id === id ? updated : item)); setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  async function saveCandidateName(value: string) {
    try { setCandidateBase(await api.updateCandidateBase(value.trim() || null)); setError('') }
    catch (reason) { setError((reason as Error).message) }
  }

  async function addContact(event: React.FormEvent) {
    event.preventDefault()
    try {
      const contact = await api.addContact({ label: contactLabel, value: contactValue })
      setCandidateBase((current) => ({ ...current, contacts: [...current.contacts, contact] }))
      setContactLabel(''); setContactValue(''); setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  async function updateContact(id: string, changes: { label?: string; value?: string }) {
    try {
      const contact = await api.updateContact(id, changes)
      setCandidateBase((current) => ({ ...current, contacts: current.contacts.map((item) => item.id === id ? contact : item) }))
      setError('')
    } catch (reason) { setError((reason as Error).message) }
  }

  return <section aria-labelledby="resume-profiles-title">
    <h1 id="resume-profiles-title">Профили специализации</h1>
    <p>Профиль специализации задаёт направление и настройки. Это ещё не готовый документ резюме.</p>
    <section className="profile-card personal-profile-card" aria-label="Личные данные кандидата">
      <h2>Имя пользователя</h2>
      <label htmlFor="candidate-name">Имя кандидата, которое будет показано в резюме</label>
      <input id="candidate-name" defaultValue={candidateBase.full_name ?? ''} key={candidateBase.full_name ?? 'empty-name'}
        onBlur={(event) => { if (event.target.value !== (candidateBase.full_name ?? '')) void saveCandidateName(event.target.value) }} />
      <h2>Контакты</h2>
      <p>Общие контакты кандидата используются во всех профилях специализации.</p>
      <div className="candidate-contacts">{candidateBase.contacts.map((contact) => <div className="candidate-contact" key={contact.id}>
        <label>Тип контакта<input defaultValue={contact.label} onBlur={(event) => {
          if (event.target.value !== contact.label) void updateContact(contact.id, { label: event.target.value })
        }} /></label>
        <label>Значение<input defaultValue={contact.value} onBlur={(event) => {
          if (event.target.value !== contact.value) void updateContact(contact.id, { value: event.target.value })
        }} /></label>
        <button type="button" onClick={async () => {
          try { await api.deleteContact(contact.id); setCandidateBase((current) => ({ ...current, contacts: current.contacts.filter((item) => item.id !== contact.id) })) }
          catch (reason) { setError((reason as Error).message) }
        }}>Удалить</button>
      </div>)}</div>
      <form className="add-contact-form" onSubmit={addContact}>
        <label>Тип<input value={contactLabel} onChange={(event) => setContactLabel(event.target.value)} placeholder="Например, электронная почта" required /></label>
        <label>Контакт<input value={contactValue} onChange={(event) => setContactValue(event.target.value)} required /></label>
        <button type="submit">Добавить контакт</button>
      </form>
    </section>
    <form onSubmit={createProfile}>
      <label htmlFor="profile-name">Название профиля</label>
      <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} required />
      <button type="submit">Создать профиль</button>
    </form>
    <ul className="specialization-profile-list" aria-label="Сохранённые профили специализации">
      {profiles.map((profile) => <li key={profile.id}>
        <label>Название профиля<input defaultValue={profile.name} onBlur={(event) => {
          if (event.target.value.trim() && event.target.value !== profile.name) void updateProfile(profile.id, { name: event.target.value })
        }} /></label>
        <label>Заголовок резюме<input defaultValue={profile.headline ?? ''} onBlur={(event) => {
          if (event.target.value !== (profile.headline ?? '')) void updateProfile(profile.id, { headline: event.target.value || null })
        }} /></label>
        <label>Обо мне<textarea defaultValue={profile.summary ?? ''} rows={5} onBlur={(event) => {
          if (event.target.value !== (profile.summary ?? '')) void api.update(profile.id, { summary: event.target.value || null }).then((updated) => {
            setProfiles((current) => current.map((item) => item.id === updated.id ? updated : item))
          }).catch((reason: Error) => setError(reason.message))
        }} /></label>
      </li>)}
    </ul>
    <p><a href="/resume-drafts">Открыть все черновики резюме</a></p>
    {error && <p role="alert">{error}</p>}
  </section>
}
