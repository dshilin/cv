import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExperienceProfile } from '../../domain/profile'
import { createFixtureProfileService } from '../../services/fixtures'
import { ProfilePage } from './ProfilePage'

const blockedProfile = (): ExperienceProfile => ({
  sections: {
    basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable',
    skills: 'needs_review', education: 'not_applicable', languages: 'not_applicable',
    additional: 'needs_input',
  },
  facts: [
    { id: 'name', section: 'basics', status: 'confirmed', value: 'Example Person', provenance: 'user:profile' },
    { id: 'skill', section: 'skills', status: 'needs_review', value: 'TypeScript', provenance: 'resume:example.pdf' },
  ],
  conflicts: [],
  questions: [],
  resumeFactIds: ['name', 'skill'],
})

function renderProfile(profile = blockedProfile()) {
  const service = createFixtureProfileService(profile)
  render(<MemoryRouter><ProfilePage service={service} /></MemoryRouter>)
  return service
}

afterEach(cleanup)

describe('ProfilePage', () => {
  it('shows section statuses and the readiness blocker list', async () => {
    renderProfile()

    expect(await screen.findByRole('heading', { name: 'Профиль' })).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Навыки и технологии' })).getByText('Ожидает проверки')).toBeVisible()
    expect(within(screen.getByRole('region', { name: 'Проекты' })).getByText('Не применимо')).toBeVisible()
    expect(screen.getByRole('heading', { name: 'Что нужно сделать' })).toBeVisible()
    expect(screen.getByRole('link', { name: /Проверить раздел «Навыки и технологии»/ })).toHaveAttribute('href', '#section-skills')
  })

  it('links conflict and mandatory-question blockers to visible details', async () => {
    const profile = blockedProfile()
    profile.conflicts = [{ id: 'dates', resolved: false }]
    profile.questions = [{ id: 'employer', mandatory: true, resolved: false }]
    renderProfile(profile)

    await screen.findByRole('heading', { name: 'Что нужно сделать' })
    const conflictLink = screen.getByRole('link', { name: 'Разрешить противоречие' })
    const questionLink = screen.getByRole('link', { name: 'Ответить на обязательный вопрос employer' })
    expect(document.querySelector(conflictLink.getAttribute('href')!)).toBeVisible()
    expect(document.querySelector(questionLink.getAttribute('href')!)).toBeVisible()
  })

  it('lets the user answer mandatory questions and resolve conflicts from blocker details', async () => {
    const profile = blockedProfile()
    profile.sections.skills = 'confirmed'
    profile.facts[1].status = 'confirmed'
    profile.conflicts = [{ id: 'dates', resolved: false }]
    profile.questions = [{ id: 'employer', mandatory: true, resolved: false }]
    const service = renderProfile(profile)

    const question = await screen.findByRole('listitem', { name: 'Обязательный вопрос: employer' })
    const conflict = screen.getByRole('listitem', { name: 'Противоречие: dates' })
    fireEvent.change(within(question).getByRole('textbox', { name: 'Ответ на вопрос' }), { target: { value: 'Компания подтверждена' } })
    fireEvent.click(within(question).getByRole('button', { name: 'Сохранить ответ' }))
    fireEvent.change(within(conflict).getByRole('textbox', { name: 'Решение противоречия' }), { target: { value: 'Использовать даты из договора' } })
    fireEvent.click(within(conflict).getByRole('button', { name: 'Сохранить решение' }))

    const updated = await service.load()
    expect(updated.questions[0]).toMatchObject({ resolved: true, resolution: 'Компания подтверждена' })
    expect(updated.conflicts[0]).toMatchObject({ resolved: true, resolution: 'Использовать даты из договора' })
    expect(await screen.findByRole('link', { name: 'Настроить поиск' })).toBeVisible()
    expect(screen.getByText('Ответ: Компания подтверждена')).toBeVisible()
    expect(screen.getByText('Решение: Использовать даты из договора')).toBeVisible()
  })

  it('offers confirm, edit, and reject actions for an extracted fact', async () => {
    renderProfile()

    const fact = await screen.findByRole('listitem', { name: 'TypeScript' })
    expect(within(fact).getByText('Источник: Загружено из резюме')).toBeVisible()
    expect(within(fact).getByRole('button', { name: 'Подтвердить' })).toBeVisible()
    expect(within(fact).getByRole('button', { name: 'Исправить' })).toBeVisible()
    expect(within(fact).getByRole('button', { name: 'Отклонить' })).toBeVisible()

    fireEvent.click(within(fact).getByRole('button', { name: 'Подтвердить' }))

    expect(await within(fact).findByText('Статус: Подтверждено')).toBeVisible()
    expect(within(fact).getByText('TypeScript')).toBeVisible()
    expect(within(fact).getByText('Источник: Загружено из резюме')).toBeVisible()
  })

  it('edits a fact only after the user saves the new value', async () => {
    const service = renderProfile()
    const fact = await screen.findByRole('listitem', { name: 'TypeScript' })

    fireEvent.click(within(fact).getByRole('button', { name: 'Исправить' }))
    fireEvent.change(within(fact).getByRole('textbox', { name: 'Факт для резюме' }), { target: { value: 'React' } })
    expect((await service.load()).facts.find(({ id }) => id === 'skill')?.value).toBe('TypeScript')

    fireEvent.click(within(fact).getByRole('button', { name: 'Сохранить исправление' }))
    expect(await within(fact).findByText('React')).toBeVisible()
    expect((await service.load()).facts.find(({ id }) => id === 'skill')?.value).toBe('React')
  })

  it('explains fact provenance and does not offer the technical source for editing', async () => {
    const service = renderProfile()

    const fact = await screen.findByRole('listitem', { name: 'TypeScript' })
    fireEvent.click(within(fact).getByRole('button', { name: 'Исправить' }))
    expect(within(fact).getByRole('textbox', { name: 'Факт для резюме' })).toBeVisible()
    expect(within(fact).queryByRole('textbox', { name: 'Источник факта' })).not.toBeInTheDocument()
    fireEvent.click(within(fact).getByRole('button', { name: 'Сохранить исправление' }))

    expect(await within(fact).findByText('Источник: Загружено из резюме')).toBeVisible()
    expect((await service.load()).facts.find(({ id }) => id === 'skill')?.provenance).toBe('resume:example.pdf')
  })

  it('keeps the correction form open when saving fails', async () => {
    const service = createFixtureProfileService(blockedProfile())
    render(<MemoryRouter><ProfilePage service={{
      ...service,
      async updateFact() { throw new Error('save unavailable') },
    }} /></MemoryRouter>)
    const fact = await screen.findByRole('listitem', { name: 'TypeScript' })
    fireEvent.click(within(fact).getByRole('button', { name: 'Исправить' }))
    fireEvent.click(within(fact).getByRole('button', { name: 'Сохранить исправление' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось сохранить изменение')
    expect(within(fact).getByRole('textbox', { name: 'Факт для резюме' })).toBeVisible()
  })

  it('rejects an extracted fact without treating it as confirmed', async () => {
    const service = renderProfile()
    const fact = await screen.findByRole('listitem', { name: 'TypeScript' })

    fireEvent.click(within(fact).getByRole('button', { name: 'Отклонить' }))

    expect(await within(fact).findByText('Статус: Отклонено')).toBeVisible()
    expect((await service.load()).facts.find(({ id }) => id === 'skill')?.status).toBe('rejected')
    expect(screen.queryByRole('link', { name: 'Настроить поиск' })).not.toBeInTheDocument()
  })

  it('offers recovery after rejecting the only skill fact', async () => {
    const service = renderProfile()
    const fact = await screen.findByRole('listitem', { name: 'TypeScript' })

    fireEvent.click(within(fact).getByRole('button', { name: 'Отклонить' }))
    expect(await within(fact).findByRole('button', { name: 'Восстановить' })).toBeVisible()

    fireEvent.click(within(fact).getByRole('button', { name: 'Восстановить' }))

    expect(await within(fact).findByText('Статус: Ожидает проверки')).toBeVisible()
    expect(within(fact).getByRole('button', { name: 'Подтвердить' })).toBeVisible()
    expect((await service.load()).resumeFactIds).toContain('skill')
    expect((await service.load()).sections.skills).toBe('needs_review')
  })

  it('does not show the search CTA while the profile is blocked', async () => {
    renderProfile()

    expect(await screen.findByRole('heading', { name: 'Что нужно сделать' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Настроить поиск' })).not.toBeInTheDocument()
  })

  it('shows the search CTA only when readiness is true', async () => {
    const profile = blockedProfile()
    profile.sections.skills = 'confirmed'
    profile.facts[1].status = 'confirmed'
    renderProfile(profile)

    expect(await screen.findByRole('link', { name: 'Настроить поиск' })).toHaveAttribute('href', '/search')
    expect(screen.queryByRole('heading', { name: 'Что нужно сделать' })).not.toBeInTheDocument()
  })
})
