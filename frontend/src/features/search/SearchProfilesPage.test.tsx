import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import type { ExperienceProfile } from '../../domain/profile'
import { AppRoutes } from '../../app/router'
import { createFixtureProfileService, createFixtureSearchService, createFixtureSourceService } from '../../services/fixtures'
import { SearchProfilesPage } from './SearchProfilesPage'

const readyProfile: ExperienceProfile = {
  sections: {
    basics: 'confirmed', employment: 'not_applicable', projects: 'not_applicable',
    skills: 'confirmed', education: 'not_applicable', languages: 'not_applicable', additional: 'needs_input',
  },
  facts: [
    { id: 'name', section: 'basics', status: 'confirmed', value: 'Example Person', provenance: 'user:profile' },
    { id: 'skill', section: 'skills', status: 'confirmed', value: 'TypeScript', provenance: 'user:skills' },
  ],
  conflicts: [], questions: [], resumeFactIds: ['name', 'skill'],
}

function renderSearch() {
  const sources = createFixtureSourceService([{ id: 'example-board', status: 'connected', consent: 'granted' }])
  const searches = createFixtureSearchService()
  render(<MemoryRouter><SearchProfilesPage sourceService={sources} searchService={searches} /></MemoryRouter>)
  return { sources, searches }
}

afterEach(cleanup)

describe('SearchProfilesPage', () => {
  it('adds another profile without replacing a previously saved one', async () => {
    const sources = createFixtureSourceService([{ id: 'example-board', status: 'connected', consent: 'granted' }])
    const searches = createFixtureSearchService([{
      id: 'search-1', roles: ['Designer'], sources: ['example-board'],
      scope: { regions: ['Москва'], remote: false }, mode: 'recommendations', active: false,
    }])
    render(<MemoryRouter><SearchProfilesPage sourceService={sources} searchService={searches} /></MemoryRouter>)
    await screen.findByRole('region', { name: 'Designer' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Должности и синонимы' }), { target: { value: 'Developer' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('region', { name: 'Developer' })).toBeVisible()
    expect((await searches.list()).map(({ id }) => id)).toEqual(['search-1', 'search-2'])
  })

  it('shows a human-readable launch summary before activation and keeps advanced filters collapsed', async () => {
    const { searches } = renderSearch()
    await screen.findByRole('heading', { name: 'Поисковые профили' })
    expect(screen.getByText('Расширенные фильтры').closest('details')).not.toHaveAttribute('open')
    fireEvent.change(screen.getByRole('textbox', { name: 'Должности и синонимы' }), { target: { value: 'Backend Developer' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Example Board' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Удалённая работа' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Режим обработки' }), { target: { value: 'recommendations' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))

    expect(await screen.findByText(/Ищем Backend Developer.*удалён/)).toBeVisible()
    expect((await searches.list())[0].active).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Запустить поиск' }))
    expect(await screen.findByText('Состояние: поиск активен')).toBeVisible()
    expect((await searches.list())[0].active).toBe(true)
  })

  it('keeps a saved profile when a source disconnects and blocks launch without another connected source', async () => {
    const { sources, searches } = renderSearch()
    await screen.findByRole('heading', { name: 'Поисковые профили' })
    fireEvent.change(screen.getByRole('textbox', { name: 'Должности и синонимы' }), { target: { value: 'Developer' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Example Board' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Удалённая работа' }))
    fireEvent.change(screen.getByRole('combobox', { name: 'Режим обработки' }), { target: { value: 'recommendations' } })
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    const saved = await screen.findByRole('region', { name: 'Developer' })
    await sources.disconnect('example-board')
    fireEvent.click(within(saved).getByRole('button', { name: 'Обновить состояния' }))
    expect(await within(saved).findByText(/Источник.*недоступен/)).toBeVisible()
    expect(within(saved).getByRole('button', { name: 'Запустить поиск' })).toBeDisabled()
    expect((await searches.list())[0].sources).toEqual(['example-board'])
  })

  it('blocks the search route until the profile readiness evaluator approves it', async () => {
    render(<MemoryRouter initialEntries={['/search']}><AppRoutes profileService={createFixtureProfileService()} /></MemoryRouter>)
    expect(await screen.findByText(/Сначала завершите профиль/)).toBeVisible()
    expect(screen.queryByRole('heading', { name: 'Поисковые профили' })).not.toBeInTheDocument()
  })

  it('allows the search route with a ready profile', async () => {
    render(<MemoryRouter initialEntries={['/search']}><AppRoutes profileService={createFixtureProfileService(readyProfile)} /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Поисковые профили' })).toBeVisible()
  })
})
