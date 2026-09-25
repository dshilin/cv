import { expect, it } from 'vitest'
import type { SearchProfile, SourceConnection } from '../domain/search'
import { createFixtureSearchService, createFixtureSourceService } from './fixtures'

const connected: SourceConnection = { id: 'example-board', status: 'connected', consent: 'granted', tokenStatus: 'valid' }
const saved = (): SearchProfile => ({
  id: 'search-1', roles: ['Developer'], sources: ['example-board'],
  scope: { regions: [], remote: true }, mode: 'recommendations', active: false,
})

it('reads live source state inside the search service and ignores fabricated caller state', async () => {
  const sources = createFixtureSourceService([connected])
  const searches = createFixtureSearchService(sources, [saved()])
  await sources.disconnect('example-board')

  await expect(Reflect.apply(searches.activate, searches, ['search-1', [connected]])).rejects.toThrow('Search activation is blocked')
  expect((await searches.list())[0].active).toBe(false)
})

it('does not let save mark a profile active without activation', async () => {
  const sources = createFixtureSourceService([connected])
  const searches = createFixtureSearchService(sources)
  await searches.save({ ...saved(), active: true })
  expect((await searches.list())[0].active).toBe(false)
})

it('deactivates on lost connection and requires an explicit launch after reconnect', async () => {
  const sources = createFixtureSourceService([connected])
  const searches = createFixtureSearchService(sources, [saved()])
  await searches.activate('search-1')
  expect((await searches.list())[0].active).toBe(true)

  await sources.disconnect('example-board')
  expect((await searches.list())[0]).toMatchObject({ active: false, sources: ['example-board'] })
  await sources.connect('example-board')
  expect((await searches.list())[0].active).toBe(false)
  await searches.activate('search-1')
  expect((await searches.list())[0].active).toBe(true)
})

it('deactivates on lost consent even when connection stays connected', async () => {
  const sources = createFixtureSourceService([connected])
  const searches = createFixtureSearchService(sources, [saved()])
  await searches.activate('search-1')
  await sources.revokeConsent('example-board')
  expect((await searches.list())[0].active).toBe(false)
  await expect(searches.activate('search-1')).rejects.toThrow('Search activation is blocked')
})

it('deactivates on connection loss while consent remains granted', async () => {
  const sources = createFixtureSourceService([connected])
  const searches = createFixtureSearchService(sources, [saved()])
  await searches.activate('search-1')
  await sources.requireReconnect('example-board')
  expect((await sources.list())[0]).toMatchObject({ status: 'reconnect_required', consent: 'granted' })
  expect((await searches.list())[0].active).toBe(false)
})
