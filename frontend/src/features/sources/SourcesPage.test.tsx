import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { createFixtureSourceService } from '../../services/fixtures'
import { SourcesPage } from './SourcesPage'

afterEach(cleanup)

it('shows search consent separately from connection status and lets the user revoke it', async () => {
  const service = createFixtureSourceService()
  render(<SourcesPage service={service} />)
  const card = await screen.findByRole('region', { name: 'example-board' })
  expect(within(card).getByText('Согласие на поиск: не предоставлено')).toBeVisible()
  expect(within(card).getByText('Подключение: не подключён')).toBeVisible()
  expect(within(card).getByText('Токен площадки: отсутствует')).toBeVisible()
  fireEvent.click(within(card).getByRole('button', { name: 'Подключить' }))
  expect(await within(card).findByText('Согласие на поиск: предоставлено')).toBeVisible()
  expect(within(card).getByText('Подключение: подключён')).toBeVisible()
  expect(within(card).getByText('Токен площадки: действителен')).toBeVisible()
  fireEvent.click(within(card).getByRole('button', { name: 'Отключить' }))
  expect(await within(card).findByText('Согласие на поиск: отозвано')).toBeVisible()
  expect((await service.list())[0].status).toBe('disconnected')
})

it('shows an expired token independently of connected status and granted consent', async () => {
  const service = createFixtureSourceService([{
    id: 'example-board', status: 'connected', consent: 'granted', tokenStatus: 'expired',
  }])
  render(<SourcesPage service={service} />)
  const card = await screen.findByRole('region', { name: 'example-board' })
  expect(within(card).getByText('Согласие на поиск: предоставлено')).toBeVisible()
  expect(within(card).getByText('Подключение: подключён')).toBeVisible()
  expect(within(card).getByText('Токен площадки: истёк')).toBeVisible()
  expect(within(card).getByRole('button', { name: 'Подключить' })).toBeEnabled()
})
