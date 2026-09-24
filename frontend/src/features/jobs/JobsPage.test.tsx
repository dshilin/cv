import { cleanup, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/router'
import { createFixtureJobService } from '../../services/fixtures'
import type { JobDetails } from '../../services/contracts'

const jobs: JobDetails[] = [
  {
    id: 'job-1', title: 'Frontend Developer', company: 'Example Studio',
    source: 'Example Board', publishedAt: '2026-09-23', score: 82, status: 'needs_review',
    description: 'Build accessible interfaces. <script>alert("vacancy")</script>',
    requiredSkills: ['TypeScript', 'Accessibility'],
    confirmedMatches: [{ requirement: 'TypeScript', fact: 'Used TypeScript on an example project', factId: 'fact-ts' }],
    gaps: ['Accessibility experience is not confirmed'],
  },
  {
    id: 'job-2', title: 'Product Designer', company: 'Sample Company',
    source: 'Sample Feed', publishedAt: '2026-09-22', score: 54, status: 'new',
    description: 'Design product flows.', requiredSkills: ['Research'],
    confirmedMatches: [], gaps: ['Research experience is not confirmed'],
  },
]

function renderJobs(path: string) {
  render(<MemoryRouter initialEntries={[path]}><AppRoutes jobService={createFixtureJobService(jobs)} /></MemoryRouter>)
}

afterEach(cleanup)

describe('JobsPage', () => {
  it('renders status, source, date, score, and explanation for each vacancy', async () => {
    renderJobs('/jobs')
    const first = await screen.findByRole('article', { name: 'Frontend Developer' })
    expect(within(first).getByText(/Нужно проверить/)).toBeVisible()
    expect(within(first).getByText(/Example Board/)).toBeVisible()
    expect(within(first).getByText(/23\.09\.2026/)).toBeVisible()
    expect(within(first).getByText(/82/)).toBeVisible()
    expect(within(first).getByText(/TypeScript/)).toBeVisible()
    expect(within(first).getByText(/Accessibility experience is not confirmed/)).toBeVisible()
    const second = screen.getByRole('article', { name: 'Product Designer' })
    expect(within(second).getByText(/Новая/)).toBeVisible()
    expect(within(second).getByText(/Sample Feed/)).toBeVisible()
  })

  it('shows required skills, confirmed matches, gaps, and separate vacancy text on the detail page', async () => {
    renderJobs('/jobs/job-1')
    expect(await screen.findByRole('heading', { name: 'Frontend Developer' })).toBeVisible()
    expect(screen.getByRole('region', { name: 'Описание вакансии — текст источника' })).toHaveTextContent('<script>alert("vacancy")</script>')
    expect(screen.queryByText('alert("vacancy")', { selector: 'script' })).not.toBeInTheDocument()
    const match = screen.getByRole('region', { name: 'Сопоставление с профилем' })
    expect(within(match).getByText('Accessibility')).toBeVisible()
    expect(within(match).getByText(/Used TypeScript on an example project/)).toBeVisible()
    expect(within(match).getByText(/Accessibility experience is not confirmed/)).toBeVisible()
  })

  it('offers prepare-application only for a selected vacancy', async () => {
    renderJobs('/jobs')
    await screen.findByRole('article', { name: 'Frontend Developer' })
    expect(screen.queryByRole('link', { name: 'Подготовить отклик' })).not.toBeInTheDocument()
    cleanup()
    renderJobs('/jobs/job-1')
    expect(await screen.findByRole('link', { name: 'Подготовить отклик' })).toHaveAttribute('href', '/applications?jobId=job-1')
  })

  it('shows an explicit missing-vacancy state for an unknown id', async () => {
    renderJobs('/jobs/absent')
    expect(await screen.findByRole('heading', { name: 'Вакансия не найдена' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Подготовить отклик' })).not.toBeInTheDocument()
  })
})
