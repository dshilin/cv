import { useEffect, useState } from 'react'
import { createResumeProfileApi, type ResumeDraft, type ResumeDraftSummary } from '../../services/resume-profiles'
import { findContactSuggestions, type ContactSuggestion } from './contact-suggestions'

const api = createResumeProfileApi()
const blockTitles: Record<string, string> = {
  basics: 'Контактная информация', preferences: 'Пожелания к работе', projects: 'Проекты',
  skills: 'Навыки', tools: 'Инструменты', education: 'Образование',
  certifications: 'Сертификаты', languages: 'Языки', additional: 'Дополнительная информация',
  unparsed: 'Нераспознанный текст',
}
const stateTitles: Record<string, string> = { needs_user_review: 'Нужно проверить', reviewed: 'Проверено' }
const progressTitles: Record<string, string> = { none: 'Данные не перенесены', partial: 'Часть данных перенесена', complete: 'Данные перенесены' }

function date(value: string) {
  return new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function importError(reason: unknown) {
  const message = reason instanceof Error ? reason.message : ''
  if (/\((413|415|422)\)/.test(message)) return 'Файл не удалось прочитать. Загрузите PDF с текстом или DOCX.'
  return message || 'Не удалось выполнить запрос к серверу.'
}

export function ResumeDraftsPage() {
  const [drafts, setDrafts] = useState<ResumeDraftSummary[]>([])
  const [draft, setDraft] = useState<ResumeDraft | null>(null)
  const [title, setTitle] = useState('')
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [experienceText, setExperienceText] = useState('')
  const [filter, setFilter] = useState<'all' | 'needs_user_review' | 'reviewed'>('all')
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [savedContactKeys, setSavedContactKeys] = useState<Set<string>>(new Set())
  const [savingContactKey, setSavingContactKey] = useState<string | null>(null)
  const [error, setError] = useState('')

  async function refreshList() {
    const rows = await api.listDrafts()
    setDrafts(rows)
  }
  useEffect(() => { void refreshList().catch((reason: Error) => setError(reason.message)) }, [])
  useEffect(() => {
    if (saveState === 'saved') return
    const routeHandler = (event: Event) => {
      const navigation = event as CustomEvent<{ allow: boolean }>
      if (!window.confirm('Есть несохранённые изменения. Если уйти сейчас, они будут потеряны. Остаться на странице?')) {
        navigation.detail.allow = true
      } else {
        navigation.detail.allow = false
      }
    }
    const handler = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('cv:before-route-change', routeHandler)
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('cv:before-route-change', routeHandler)
      window.removeEventListener('beforeunload', handler)
    }
  }, [saveState])

  function openDraft(value: ResumeDraft) {
    setDraft(value); setTitle(value.title); setTexts(Object.fromEntries(value.blocks.map((block) => [block.id, block.text])))
    setSaveState('saved'); setSavedContactKeys(new Set()); setError('')
  }
  async function selectDraft(id: string) {
    if (saveState !== 'saved' && !window.confirm('Есть несохранённые изменения. Перейти без сохранения?')) return
    try { openDraft(await api.getDraft(id)) } catch (reason) { setError((reason as Error).message) }
  }
  async function createDraft() {
    try { const value = await api.createDraft(); await refreshList(); openDraft(value) }
    catch (reason) { setError((reason as Error).message) }
  }
  async function importFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    try { const value = await api.importFile(file); await refreshList(); openDraft(value) }
    catch (reason) { setError(importError(reason)) }
    finally { event.target.value = '' }
  }
  async function addExperience(event: React.FormEvent) {
    event.preventDefault()
    if (!draft || !experienceText.trim()) return
    if (saveState !== 'saved') { setError('Сначала сохраните текущие изменения.'); return }
    try { const value = await api.addExperienceBlock(draft.draft_id, experienceText); openDraft(value); await refreshList(); setExperienceText('') }
    catch (reason) { setError((reason as Error).message) }
  }
  async function saveDraft() {
    if (!draft) return
    setSaveState('saving'); setError('')
    try {
      const changedTitle = title.trim() !== draft.title ? title.trim() : undefined
      const changedBlocks = draft.blocks
        .filter((block) => (texts[block.id] ?? block.text) !== block.text)
        .map((block) => ({ id: block.id, text: texts[block.id] ?? block.text }))
      if (changedTitle === undefined && changedBlocks.length === 0) {
        setSaveState('saved')
        return
      }
      const updated = await api.saveDraft(draft.draft_id, {
        ...(changedTitle === undefined ? {} : { title: changedTitle }),
        ...(changedBlocks.length === 0 ? {} : { blocks: changedBlocks }),
      })
      openDraft(updated)
      await refreshList()
      setSaveState('saved')
    } catch (reason) { setSaveState('error'); setError(`Не удалось сохранить. Ваш текст остался в форме. ${(reason as Error).message}`) }
  }
  async function saveContact(blockId: string, contact: ContactSuggestion) {
    const key = `${blockId}:${contact.label}:${contact.value.toLocaleLowerCase()}`
    setSavingContactKey(key); setError('')
    try {
      await api.addContact(contact)
      setSavedContactKeys((current) => new Set(current).add(key))
    } catch (reason) {
      setError(`Не удалось сохранить контакт. ${(reason as Error).message}`)
    } finally { setSavingContactKey(null) }
  }
  async function markReviewed() {
    if (!draft || saveState !== 'saved') return
    try { const value = await api.reviewDraft(draft.draft_id); openDraft(value); await refreshList() }
    catch (reason) { setError((reason as Error).message) }
  }

  const visible = drafts.filter((item) => filter === 'all' || item.state === filter)
  return <section className="resume-drafts-page" aria-labelledby="resume-drafts-title">
    <h1 id="resume-drafts-title">Черновики резюме</h1>
    <p>Черновик хранится отдельно от общей базы кандидата. Проверка не переносит данные в базу.</p>
    <div className="draft-actions">
      <button type="button" onClick={() => void createDraft()}>Создать черновик</button>
      <label htmlFor="resume-file">Импортировать PDF/DOCX</label>
      <input id="resume-file" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => void importFile(event)} />
    </div>
    <div className="draft-filter" role="group" aria-label="Фильтр черновиков">
      <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')}>Все</button>
      <button type="button" aria-pressed={filter === 'needs_user_review'} onClick={() => setFilter('needs_user_review')}>Нужно проверить</button>
      <button type="button" aria-pressed={filter === 'reviewed'} onClick={() => setFilter('reviewed')}>Проверено</button>
    </div>
    <ul className="resume-draft-list" aria-label="Сохранённые черновики">
      {visible.map((item) => <li key={item.draft_id}>
        <button type="button" onClick={() => void selectDraft(item.draft_id)}>
          <strong>{item.title}</strong><span>{stateTitles[item.state] ?? 'Нужно проверить'}</span>
          <span>Создан: {date(item.created_at)}</span><span>Изменён: {date(item.updated_at)}</span>
          <span>{progressTitles[item.application_progress]}</span>
        </button>
      </li>)}
      {visible.length === 0 && <li>Черновиков в этом разделе пока нет.</li>}
    </ul>
    {draft && <section className="resume-draft-editor" aria-label="Редактор черновика">
      <div className="draft-editor-heading">
        <div><h2>Редактирование черновика</h2><p>Все поля хранятся отдельно от базы кандидата.</p></div>
        <span className={`save-state save-state-${saveState}`} role="status">{{ saved: 'Сохранено', dirty: 'Есть изменения', saving: 'Сохраняю…', error: 'Не удалось сохранить' }[saveState]}</span>
      </div>
      <label className="draft-title-field">Название черновика<input value={title} maxLength={160} onChange={(event) => { setTitle(event.target.value); setSaveState('dirty') }} /></label>
      <p>Проверка: <strong>{stateTitles[draft.state] ?? 'Нужно проверить'}</strong>. Перенос в базу: {progressTitles[draft.application_progress]} ({draft.applied_blocks}/{draft.total_blocks} блоков).</p>
      <div className="resume-draft-blocks">
        {draft.blocks.map((block) => {
          const experienceNumber = block.kind === 'experience' ? draft.blocks.filter((item) => item.kind === 'experience' && item.ordinal <= block.ordinal).length : 0
          const heading = block.kind === 'experience' ? `Опыт работы ${experienceNumber}` : block.heading ?? blockTitles[block.kind] ?? block.kind
          const contacts = block.kind === 'unparsed' ? findContactSuggestions(texts[block.id] ?? block.text) : []
          return <article className="resume-draft-block" key={block.id}>
            <h3>{heading}</h3><label htmlFor={`draft-${block.id}`}>Текст раздела</label>
            <textarea id={`draft-${block.id}`} value={texts[block.id] ?? block.text} rows={7} onChange={(event) => {
              setTexts((current) => ({ ...current, [block.id]: event.target.value })); setSaveState('dirty')
            }} />
            {contacts.length > 0 && <section className="draft-contact-suggestions" aria-label="Контакты в нераспознанном тексте">
              <h4>Найдены возможные контакты</h4>
              <p>Выберите, какие значения добавить в общую базу кандидата. Текст черновика останется без изменений.</p>
              <ul>{contacts.map((contact) => {
                const key = `${block.id}:${contact.label}:${contact.value.toLocaleLowerCase()}`
                const saved = savedContactKeys.has(key)
                return <li key={key}>
                  <span>{contact.label}: {contact.value}</span>
                  <button type="button" disabled={saved || savingContactKey === key} onClick={() => { void saveContact(block.id, contact) }}>
                    {saved ? 'Добавлено в общие контакты' : savingContactKey === key ? 'Сохраняю…' : 'Добавить в общие контакты'}
                  </button>
                </li>
              })}</ul>
            </section>}
          </article>
        })}
      </div>
      <form className="resume-draft-block resume-experience-form" onSubmit={(event) => void addExperience(event)}>
        <h3>Добавить место работы</h3><p>Каждое добавление создаёт отдельный блок. Мест работы может быть несколько.</p>
        <label htmlFor="experience-text">Описание места работы</label>
        <textarea id="experience-text" value={experienceText} onChange={(event) => setExperienceText(event.target.value)} rows={7} />
        <button type="submit" disabled={!experienceText.trim() || saveState !== 'saved'}>Добавить блок опыта</button>
      </form>
      <div className="draft-editor-actions">
        <button type="button" onClick={() => void saveDraft()} disabled={saveState === 'saving' || saveState === 'saved'}>Сохранить черновик</button>
        <button type="button" onClick={() => void markReviewed()} disabled={saveState !== 'saved' || draft.state === 'reviewed'}>Отметить проверенным</button>
      </div>
    </section>}
    {error && <p role="alert">{error}</p>}
  </section>
}
