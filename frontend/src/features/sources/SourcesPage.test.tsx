import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createFixtureSourceService } from '../../services/fixtures'
import { SourcesPage } from './SourcesPage'

afterEach(cleanup)

it('shows search consent separately from connection status and lets the user revoke it', async () => {
  const service = createFixtureSourceService()
  render(<SourcesPage service={service} />)
  const card = await screen.findByRole('region', { name: 'Example Board' })
  expect(within(card).getByText('Согласие на поиск: не предоставлено')).toBeVisible()
  expect(within(card).getByText('Подключение: не подключён')).toBeVisible()
  fireEvent.click(within(card).getByRole('button', { name: 'Подключить' }))
  expect(await within(card).findByText('Согласие на поиск: предоставлено')).toBeVisible()
  expect(within(card).getByText('Подключение: подключён')).toBeVisible()
  fireEvent.click(within(card).getByRole('button', { name: 'Отключить' }))
  expect(await within(card).findByText('Согласие на поиск: отозвано')).toBeVisible()
  expect((await service.list())[0].status).toBe('disconnected')
})
