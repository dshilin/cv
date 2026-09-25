import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createFixtureApplicationService, createFixtureJobService, createFixtureProfileService, createFixtureSearchService, createFixtureSettingsService, createFixtureSourceService } from '../../services/fixtures'
import { SettingsPage } from './SettingsPage'

it('revokes source consent and stops a running fixture search from settings', async () => {
  const sources = createFixtureSourceService([{ id: 'example-board', status: 'connected', consent: 'granted', tokenStatus: 'valid' }])
  const searches = createFixtureSearchService(sources, [{
    id: 'search-1', roles: ['Developer'], sources: ['example-board'],
    scope: { regions: ['Москва'], remote: false }, mode: 'recommendations', active: true,
  }])
  const profile = createFixtureProfileService()
  const jobs = createFixtureJobService()
  const applications = createFixtureApplicationService(profile, jobs)
  const settings = createFixtureSettingsService(profile, sources, searches, jobs, applications)
  render(<SettingsPage service={settings} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Отключить автоматизацию' }))
  await waitFor(async () => expect((await searches.list())[0].active).toBe(false))
  expect(await sources.list()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Отозвать согласие' }))
  await waitFor(async () => expect((await sources.list())[0].consent).toBe('revoked'))
  expect(screen.getByRole('status')).toHaveTextContent('Согласие отозвано')
})

it('deletes all local fixture data after explicit confirmation', async () => {
  const profile = createFixtureProfileService()
  const sources = createFixtureSourceService([{ id: 'example-board', status: 'connected', consent: 'granted', tokenStatus: 'valid' }])
  const searches = createFixtureSearchService(sources, [{
    id: 'search-1', roles: ['Developer'], sources: ['example-board'],
    scope: { regions: ['Москва'], remote: false }, mode: 'recommendations', active: true,
  }])
  const jobs = createFixtureJobService()
  const applications = createFixtureApplicationService(profile, jobs)
  await applications.prepare('example-job-1')
  const settings = createFixtureSettingsService(profile, sources, searches, jobs, applications)
  render(<SettingsPage service={settings} />)

  fireEvent.click(await screen.findByRole('button', { name: 'Удалить данные' }))
  expect(await searches.list()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
  await waitFor(async () => expect(await jobs.list()).toHaveLength(0))
  expect(await searches.list()).toHaveLength(0)
  expect(await applications.pendingCount()).toBe(0)
  expect((await profile.load()).facts).toHaveLength(0)
  expect((await sources.list())[0].consent).toBe('missing')
  expect(screen.getByRole('status')).toHaveTextContent('Локальные данные удалены')
})
