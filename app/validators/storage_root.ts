import vine from '@vinejs/vine'
import { paginationFields } from './shared.js'

const rootKeyField = vine
  .string()
  .trim()
  .minLength(2)
  .maxLength(64)
  .regex(/^[a-z0-9][a-z0-9_-]*$/)
  .optional()

const providerKeyField = vine.string().trim().minLength(1).maxLength(64)
const iconKeyField = vine.string().trim().minLength(1).maxLength(64)

export const listStorageRootValidator = vine.compile(
  vine.object({
    ...paginationFields,
    keyWord: vine.string().trim().maxLength(100).optional(),
    providerKey: vine.string().trim().maxLength(64).optional(),
  })
)

export const idParamStorageRootValidator = vine.compile(
  vine.object({
    storageRootId: vine.number().positive(),
  })
)

export const createStorageRootValidator = vine.compile(
  vine.object({
    rootKey: rootKeyField,
    rootName: vine.string().trim().minLength(1).maxLength(100),
    providerKey: providerKeyField,
    iconKey: iconKeyField,
    rootPath: vine.string().trim().minLength(1).maxLength(4096),
    enabled: vine.number().min(0).max(1).optional(),
    description: vine.string().trim().maxLength(4096).nullable().optional(),
  })
)

export const updateStorageRootValidator = vine.compile(
  vine.object({
    rootName: vine.string().trim().minLength(1).maxLength(100).optional(),
    providerKey: providerKeyField.optional(),
    iconKey: iconKeyField.optional(),
    rootPath: vine.string().trim().minLength(1).maxLength(4096).optional(),
    enabled: vine.number().min(0).max(1).optional(),
    description: vine.string().trim().maxLength(4096).nullable().optional(),
  })
)

export const checkStorageRootPathValidator = vine.compile(
  vine.object({
    rootPath: vine.string().trim().minLength(1).maxLength(4096),
  })
)
