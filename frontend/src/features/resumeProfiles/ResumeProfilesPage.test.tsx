import { cleanup, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { renderApp } from '../../test/render'
import { fixtureProfileService, fixtureSearchService } from '../../services/fixtures'

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

it('uses backend profile API without invoking legacy fixture services', async () => {
  const legacyProfile = vi.spyOn(fixtureProfileService, 'load')
  const legacySearch = vi.spyOn(fixtureSearchService, 'list')
  const fetchMock = vi.fn().mockResolvedValue(new Response('[]', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  renderApp('/resume-profiles')
  expect(screen.getByRole('heading', { name: 'Профили резюме' })).toBeVisible()
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/v1/profiles', expect.anything()))
  expect(legacyProfile).not.toHaveBeenCalled()
  expect(legacySearch).not.toHaveBeenCalled()
})
