import { Profiler } from 'react'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { Link, MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../../app/router'
import { createFixtureJobService } from '../../services/fixtures'
import type { JobDetails, JobService } from '../../services/contracts'

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

type CommitSnapshot = { path: string; text: string; prepareHref: string | null }

function CommitRecorder({ jobService, record }: { jobService: JobService; record: (snapshot: CommitSnapshot) => void }) {
  const location = useLocation()
  return <Profiler id="job-route" onRender={() => record({
    path: location.pathname,
    text: document.querySelector('#content')?.textContent ?? '',
    prepareHref: document.querySelector('#content a[href^="/applications?"]')?.getAttribute('href') ?? null,
  })}><AppRoutes jobService={jobService} /></Profiler>
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

  it('clears the previous vacancy and prepare link while another vacancy loads', async () => {
    const fixture = createFixtureJobService(jobs)
    let completeSecond!: (job: JobDetails) => void
    const second = new Promise<JobDetails>((resolve) => { completeSecond = resolve })
    const service: JobService = { ...fixture, get: (id) => id === 'job-2' ? second : fixture.get(id) }
    render(<MemoryRouter initialEntries={['/jobs/job-1']}>
      <AppRoutes jobService={service} />
      <Link to="/jobs/job-2">Следующая вакансия</Link>
    </MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Frontend Developer' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Следующая вакансия' }))
    expect(screen.queryByRole('heading', { name: 'Frontend Developer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Подготовить отклик' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем вакансию')
    completeSecond(jobs[1])
    expect(await screen.findByRole('heading', { name: 'Product Designer' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Подготовить отклик' })).toHaveAttribute('href', '/applications?jobId=job-2')
  })

  it('clears a missing-vacancy error when a valid vacancy starts loading', async () => {
    const fixture = createFixtureJobService(jobs)
    let completeValid!: (job: JobDetails) => void
    const valid = new Promise<JobDetails>((resolve) => { completeValid = resolve })
    const service: JobService = { ...fixture, get: (id) => id === 'job-1' ? valid : fixture.get(id) }
    render(<MemoryRouter initialEntries={['/jobs/absent']}>
      <AppRoutes jobService={service} />
      <Link to="/jobs/job-1">Открыть существующую</Link>
    </MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Вакансия не найдена' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Открыть существующую' }))
    expect(screen.queryByRole('heading', { name: 'Вакансия не найдена' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Загружаем вакансию')
    completeValid(jobs[0])
    expect(await screen.findByRole('heading', { name: 'Frontend Developer' })).toBeVisible()
  })

  it('never commits a previous vacancy or prepare link for a new route id', async () => {
    const fixture = createFixtureJobService(jobs)
    const pending = new Promise<JobDetails>(() => {})
    const service: JobService = { ...fixture, get: (id) => id === 'job-2' ? pending : fixture.get(id) }
    const commits: CommitSnapshot[] = []
    render(<MemoryRouter initialEntries={['/jobs/job-1']}>
      <CommitRecorder jobService={service} record={(snapshot) => commits.push(snapshot)} />
      <Link to="/jobs/job-2">Следующая вакансия</Link>
    </MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Frontend Developer' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Следующая вакансия' }))
    const firstNewRouteCommit = commits.find(({ path }) => path === '/jobs/job-2')
    expect(firstNewRouteCommit?.text).not.toContain('Frontend Developer')
    expect(firstNewRouteCommit?.prepareHref).toBeNull()
  })

  it('never commits the previous missing-vacancy error for a valid route id', async () => {
    const fixture = createFixtureJobService(jobs)
    const pending = new Promise<JobDetails>(() => {})
    const service: JobService = { ...fixture, get: (id) => id === 'job-1' ? pending : fixture.get(id) }
    const commits: CommitSnapshot[] = []
    render(<MemoryRouter initialEntries={['/jobs/absent']}>
      <CommitRecorder jobService={service} record={(snapshot) => commits.push(snapshot)} />
      <Link to="/jobs/job-1">Открыть существующую</Link>
    </MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Вакансия не найдена' })).toBeVisible()
    fireEvent.click(screen.getByRole('link', { name: 'Открыть существующую' }))
    const firstNewRouteCommit = commits.find(({ path }) => path === '/jobs/job-1')
    expect(firstNewRouteCommit?.text).not.toContain('Вакансия не найдена')
    expect(firstNewRouteCommit?.text).toContain('Загружаем вакансию')
  })
})
