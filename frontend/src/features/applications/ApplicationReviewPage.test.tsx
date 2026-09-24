import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/router'
import { createFixtureApplicationService, createFixtureJobService, createFixtureProfileService } from '../../services/fixtures'

const jobs = createFixtureJobService([{
  id: 'job-1', title: 'Frontend Developer', company: 'Example Studio', source: 'Example Board',
  publishedAt: '2026-09-24', score: 80, status: 'suitable', description: 'TypeScript and accessibility',
  requiredSkills: ['TypeScript', 'Accessibility'], confirmedMatches: [], gaps: ['Accessibility is unconfirmed'],
}])

afterEach(cleanup)

function renderReview(factStatus: 'confirmed' | 'needs_review' = 'confirmed') {
  const profile = createFixtureProfileService({
    sections: { basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable', skills: factStatus, education: 'not_applicable', languages: 'not_applicable', additional: 'not_applicable' },
    facts: [{ id: 'skill', section: 'skills', status: factStatus, value: 'TypeScript', provenance: 'resume:example.pdf' }],
    conflicts: [], questions: [], resumeFactIds: ['skill'],
  })
  const applications = createFixtureApplicationService(profile, jobs)
  render(<MemoryRouter initialEntries={['/applications?jobId=job-1']}><AppRoutes profileService={profile} jobService={jobs} applicationService={applications} /></MemoryRouter>)
  return { profile, applications }
}

describe('application review', () => {
  it('shows selected job, documents, diff, warnings, and fact provenance', async () => {
    renderReview()
    expect(await screen.findByRole('heading', { name: /Frontend Developer/ })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Адаптированное резюме' })).toHaveTextContent('TypeScript')
    expect(screen.getByRole('region', { name: 'Сопроводительное письмо' })).toHaveTextContent('Example Studio')
    expect(screen.getByRole('region', { name: 'Объяснение соответствия' })).toHaveTextContent('TypeScript')
    expect(screen.getByRole('region', { name: 'Различия резюме' })).toHaveTextContent('TypeScript')
    expect(screen.getByRole('region', { name: 'Предупреждения' })).toHaveTextContent('Accessibility is unconfirmed')
    const facts = screen.getByRole('region', { name: 'Использованные факты' })
    expect(within(facts).getByText('TypeScript')).toBeVisible()
    expect(within(facts).getByText(/resume:example.pdf/)).toBeVisible()
  })

  it('requires content confirmation before send confirmation', async () => {
    renderReview()
    expect(await screen.findByRole('button', { name: 'Подтвердить содержание' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Подтвердить и отправить' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить содержание' }))
    expect(await screen.findByRole('button', { name: 'Подтвердить и отправить' })).toBeEnabled()
    expect(screen.queryByText(/отправлен в демонстрационном режиме/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить и отправить' }))
    expect(await screen.findByText(/отправлен в демонстрационном режиме/i)).toBeVisible()
  })

  it('keeps send blocked when a selected fact is unconfirmed', async () => {
    renderReview('needs_review')
    expect(await screen.findByRole('button', { name: 'Подтвердить содержание' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить содержание' }))
    expect(screen.getByRole('button', { name: 'Подтвердить и отправить' })).toBeDisabled()
    expect(screen.getByRole('region', { name: 'Блокеры отправки' })).toHaveTextContent('TypeScript')
  })

  it('does not prepare without a selected job', () => {
    render(<MemoryRouter initialEntries={['/applications']}><AppRoutes /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Выберите вакансию' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Подтвердить и отправить' })).not.toBeInTheDocument()
  })
})
