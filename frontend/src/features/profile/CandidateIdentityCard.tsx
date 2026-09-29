import { useEffect, useState } from 'react'
import { createResumeProfileApi, type CandidateBase } from '../../services/resume-profiles'

const api = createResumeProfileApi()

export function CandidateIdentityCard() {
  const [candidate, setCandidate] = useState<CandidateBase>({ full_name: null, contacts: [] })
  const [contactLabel, setContactLabel] = useState('')
  const [contactValue, setContactValue] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    api.getCandidateBase().then((value) => { if (current) setCandidate(value) })
      .catch(() => { if (current) setError('Не удалось загрузить имя и контакты кандидата') })
    return () => { current = false }
  }, [])

  async function saveName(value: string) {
    try { setCandidate(await api.updateCandidateBase(value.trim() || null)); setError('') }
    catch { setError('Не удалось сохранить имя кандидата') }
  }

  async function addContact(event: React.FormEvent) {
    event.preventDefault()
    try {
      const contact = await api.addContact({ label: contactLabel, value: contactValue })
      setCandidate((current) => ({ ...current, contacts: [...current.contacts, contact] }))
      setContactLabel(''); setContactValue(''); setError('')
    } catch { setError('Не удалось добавить контакт') }
  }

  async function updateContact(id: string, label: string, value: string) {
    const contact = candidate.contacts.find((item) => item.id === id)
    if (!contact || (label === contact.label && value === contact.value)) return
    try {
      const updated = await api.updateContact(id, { label, value })
      setCandidate((current) => ({ ...current, contacts: current.contacts.map((item) => item.id === id ? updated : item) }))
      setError('')
    } catch { setError('Не удалось сохранить контакт') }
  }

  async function deleteContact(id: string) {
    try {
      await api.deleteContact(id)
      setCandidate((current) => ({ ...current, contacts: current.contacts.filter((item) => item.id !== id) }))
      setError('')
    } catch { setError('Не удалось удалить контакт') }
  }

  return <section className="profile-card personal-profile-card" aria-label="Личные данные кандидата">
    <h2>Имя пользователя</h2>
    <label htmlFor="candidate-name">Имя кандидата, которое будет показано в резюме</label>
    <input id="candidate-name" defaultValue={candidate.full_name ?? ''} key={candidate.full_name ?? 'empty-name'}
      onBlur={(event) => { if (event.target.value !== (candidate.full_name ?? '')) void saveName(event.target.value) }} />
    <h2>Контакты</h2>
    <p>Общие контакты кандидата используются во всех профилях специализации.</p>
    <div className="candidate-contacts">{candidate.contacts.map((contact) => <div className="candidate-contact" key={contact.id}>
      <label>Тип контакта<input defaultValue={contact.label} onBlur={(event) => {
        void updateContact(contact.id, event.target.value, (event.currentTarget.parentElement?.nextElementSibling?.querySelector('input') as HTMLInputElement | null)?.value ?? contact.value)
      }} /></label>
      <label>Значение<input defaultValue={contact.value} onBlur={(event) => {
        void updateContact(contact.id, (event.currentTarget.parentElement?.previousElementSibling?.querySelector('input') as HTMLInputElement | null)?.value ?? contact.label, event.target.value)
      }} /></label>
      <button type="button" onClick={() => { void deleteContact(contact.id) }}>Удалить</button>
    </div>)}</div>
    <form className="add-contact-form" onSubmit={(event) => { void addContact(event) }}>
      <label>Тип<input value={contactLabel} onChange={(event) => setContactLabel(event.target.value)} placeholder="Например, электронная почта" required /></label>
      <label>Контакт<input value={contactValue} onChange={(event) => setContactValue(event.target.value)} required /></label>
      <button type="submit">Добавить контакт</button>
    </form>
    {error && <p role="status">{error}</p>}
  </section>
}
