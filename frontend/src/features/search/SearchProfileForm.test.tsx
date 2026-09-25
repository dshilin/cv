import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { SearchProfileForm } from './SearchProfileForm'

it('retains natural comma-separated typing and parses lists only on save', async () => {
  const onSave = vi.fn().mockResolvedValue(true)
  render(<SearchProfileForm connections={[]} existingIds={[]} onSave={onSave} />)
  fireEvent.change(screen.getByRole('textbox', { name: 'Должности и синонимы' }), { target: { value: 'Designer, Developer, ' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Регионы' }), { target: { value: 'Москва, Казань, ' } })
  fireEvent.click(screen.getByText('Расширенные фильтры'))
  for (const [label, value] of [
    ['Обязательные навыки', 'React, TypeScript, '],
    ['Желательные навыки', 'CSS, Figma, '],
    ['Стоп-слова', 'junior, trainee, '],
  ]) {
    const input = screen.getByRole('textbox', { name: label })
    fireEvent.change(input, { target: { value } })
    expect(input).toHaveValue(value)
  }
  fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
    roles: ['Designer', 'Developer'],
    scope: { regions: ['Москва', 'Казань'], remote: false },
    filters: expect.objectContaining({
      requiredSkills: ['React', 'TypeScript'], desiredSkills: ['CSS', 'Figma'],
      stopWords: ['junior', 'trainee'],
    }),
  }))
})
