import { screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { renderApp } from '../test/render'

it('offers a keyboard shortcut to labelled main content', () => {
  renderApp('/profile')
  expect(screen.getByRole('navigation', { name: 'Основная навигация' })).toBeVisible()
  expect(screen.getByRole('link', { name: 'Перейти к содержимому' })).toHaveAttribute('href', '#content')
  expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1')
  expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('aria-current', 'page')
})
