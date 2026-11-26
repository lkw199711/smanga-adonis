import { test } from '@japa/runner'
import { updateChapterValidator } from '#validators/chapter'

test.group('chapter validator', () => {
  test('preserves a string chapter number with leading zeroes', async ({ assert }) => {
    const result = await updateChapterValidator.validate({ chapterNumber: '0012' })

    assert.equal(result.chapterNumber, '0012')
  })

  test('accepts a numeric chapter number and normalizes it to a string', async ({ assert }) => {
    const result = await updateChapterValidator.validate({ chapterNumber: 12 })

    assert.equal(result.chapterNumber, '12')
  })
})
