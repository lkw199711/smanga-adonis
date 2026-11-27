import { test } from '@japa/runner'
import { idParamTaskValidator, batchIdsParamTaskValidator } from '../../app/validators/task.js'

test.group('SQL queue task IDs', () => {
  test('accepts a numeric route parameter after request middleware normalization', async ({
    assert,
  }) => {
    assert.deepEqual(await idParamTaskValidator.validate({ taskId: 42 }), { taskId: 42 })
  })

  test('deduplicates batch IDs and filters non-integer values', async ({ assert }) => {
    assert.deepEqual(await batchIdsParamTaskValidator.validate({ taskIds: '42,43,42,2.5,-1' }), {
      taskIds: [42, 43],
    })
  })
})
