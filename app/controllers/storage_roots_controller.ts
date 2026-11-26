import { randomUUID } from 'node:crypto'
import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  checkStorageRootPath,
  InvalidStorageRootPathError,
  normalizeStorageRootPath,
  storageRootKeyBase,
  storageRootPathComparisonKey,
} from '#services/storage_root_service'
import {
  checkStorageRootPathValidator,
  createStorageRootValidator,
  idParamStorageRootValidator,
  listStorageRootValidator,
  updateStorageRootValidator,
} from '#validators/storage_root'

export default class StorageRootsController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || (user.role !== 'admin' && user.mediaPermit !== 'all')) {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  private async uniqueRootKey(preferred: string): Promise<string> {
    let candidate = preferred.slice(0, 64)
    for (let attempt = 0; attempt < 10; attempt++) {
      const exists = await prisma.storageRoot.findUnique({ where: { rootKey: candidate } })
      if (!exists) return candidate
      const suffix = randomUUID().replace(/-/g, '').slice(0, 8)
      candidate = `${preferred.slice(0, 55)}-${suffix}`
    }
    return `storage-root-${randomUUID().replace(/-/g, '').slice(0, 12)}`
  }

  private async duplicatePath(rootPath: string, excludeId?: number) {
    const roots = await prisma.storageRoot.findMany({
      where: {
        deleteFlag: 0,
        ...(excludeId ? { storageRootId: { not: excludeId } } : {}),
      },
      select: { storageRootId: true, rootName: true, rootPath: true },
    })
    const target = storageRootPathComparisonKey(rootPath)
    return roots.find((root) => {
      try {
        return storageRootPathComparisonKey(root.rootPath) === target
      } catch {
        return false
      }
    })
  }

  async index({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { page, pageSize, keyWord, providerKey } = await listStorageRootValidator.validate(
      request.qs()
    )
    const where = {
      deleteFlag: 0,
      ...(providerKey && { providerKey }),
      ...(keyWord && {
        OR: [
          { rootName: { contains: keyWord } },
          { rootKey: { contains: keyWord } },
          { rootPath: { contains: keyWord } },
        ],
      }),
    }

    const [list, count] = await Promise.all([
      prisma.storageRoot.findMany({
        where,
        ...(page && pageSize && { skip: (page - 1) * pageSize, take: pageSize }),
        orderBy: { storageRootId: 'desc' },
        include: {
          _count: {
            select: { paths: { where: { deleteFlag: 0 } } },
          },
        },
      }),
      prisma.storageRoot.count({ where }),
    ])

    return response.json({
      code: 200,
      message: '',
      list: list.map((root) => ({ ...root, pathCount: root._count.paths })),
      count,
    })
  }

  async show({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { storageRootId } = await idParamStorageRootValidator.validate(params)
    const root = await prisma.storageRoot.findFirst({
      where: { storageRootId, deleteFlag: 0 },
      include: { _count: { select: { paths: { where: { deleteFlag: 0 } } } } },
    })
    if (!root) return response.status(404).json({ code: 404, message: '存储根不存在' })
    return response.json({
      code: 200,
      message: '',
      data: { ...root, pathCount: root._count.paths },
    })
  }

  async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const data = await createStorageRootValidator.validate(request.all())
    let rootPath: string
    try {
      rootPath = normalizeStorageRootPath(data.rootPath)
    } catch (error) {
      const message =
        error instanceof InvalidStorageRootPathError ? error.message : '存储根路径无效'
      return response.status(422).json({ code: 422, message })
    }

    const duplicate = await this.duplicatePath(rootPath)
    if (duplicate) {
      return response.status(409).json({
        code: 409,
        message: `该目录已被存储根「${duplicate.rootName}」使用`,
      })
    }

    const preferredKey = data.rootKey || storageRootKeyBase(data.rootName, data.providerKey)
    const rootKey = data.rootKey ? data.rootKey : await this.uniqueRootKey(preferredKey)
    if (data.rootKey) {
      const exists = await prisma.storageRoot.findUnique({ where: { rootKey } })
      if (exists) return response.status(409).json({ code: 409, message: '存储根标识已存在' })
    }

    const check = await checkStorageRootPath(rootPath)
    const root = await prisma.storageRoot.create({
      data: {
        rootKey,
        rootName: data.rootName,
        providerKey: data.providerKey,
        iconKey: data.iconKey,
        rootPath,
        enabled: data.enabled ?? 1,
        description: data.description || null,
        lastCheckStatus: check.status,
        lastCheckTime: check.checkedAt,
        lastCheckMessage: check.message,
      },
    })

    return response.json({
      code: 200,
      message: check.available ? '新增成功，目录可访问' : '新增成功，但目录当前不可访问',
      data: { ...root, check },
    })
  }

  async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { storageRootId } = await idParamStorageRootValidator.validate(params)
    const existing = await prisma.storageRoot.findFirst({
      where: { storageRootId, deleteFlag: 0 },
    })
    if (!existing) return response.status(404).json({ code: 404, message: '存储根不存在' })

    const data = await updateStorageRootValidator.validate(request.all())
    let rootPath = existing.rootPath
    if (data.rootPath !== undefined) {
      try {
        rootPath = normalizeStorageRootPath(data.rootPath)
      } catch (error) {
        const message =
          error instanceof InvalidStorageRootPathError ? error.message : '存储根路径无效'
        return response.status(422).json({ code: 422, message })
      }

      const duplicate = await this.duplicatePath(rootPath, storageRootId)
      if (duplicate) {
        return response.status(409).json({
          code: 409,
          message: `该目录已被存储根「${duplicate.rootName}」使用`,
        })
      }
    }

    const check = await checkStorageRootPath(rootPath)
    const root = await prisma.storageRoot.update({
      where: { storageRootId },
      data: {
        ...(data.rootName !== undefined && { rootName: data.rootName }),
        ...(data.providerKey !== undefined && { providerKey: data.providerKey }),
        ...(data.iconKey !== undefined && { iconKey: data.iconKey }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.description !== undefined && { description: data.description || null }),
        rootPath,
        lastCheckStatus: check.status,
        lastCheckTime: check.checkedAt,
        lastCheckMessage: check.message,
      },
    })

    return response.json({
      code: 200,
      message: check.available ? '更新成功，目录可访问' : '更新成功，但目录当前不可访问',
      data: { ...root, check },
    })
  }

  async checkPath({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { rootPath } = await checkStorageRootPathValidator.validate(request.all())
    const check = await checkStorageRootPath(rootPath)
    return response.status(check.available ? 200 : 400).json({
      code: check.available ? 200 : 400,
      message: check.message,
      data: check,
    })
  }

  async check({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { storageRootId } = await idParamStorageRootValidator.validate(params)
    const root = await prisma.storageRoot.findFirst({
      where: { storageRootId, deleteFlag: 0 },
    })
    if (!root) return response.status(404).json({ code: 404, message: '存储根不存在' })

    const check = await checkStorageRootPath(root.rootPath)
    await prisma.storageRoot.update({
      where: { storageRootId },
      data: {
        lastCheckStatus: check.status,
        lastCheckTime: check.checkedAt,
        lastCheckMessage: check.message,
      },
    })

    return response.status(check.available ? 200 : 400).json({
      code: check.available ? 200 : 400,
      message: check.message,
      data: check,
    })
  }

  async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { storageRootId } = await idParamStorageRootValidator.validate(params)
    const root = await prisma.storageRoot.findFirst({
      where: { storageRootId, deleteFlag: 0 },
    })
    if (!root) return response.status(404).json({ code: 404, message: '存储根不存在' })

    const pathCount = await prisma.path.count({ where: { storageRootId, deleteFlag: 0 } })
    if (pathCount > 0) {
      return response.status(409).json({
        code: 409,
        message: `该存储根仍绑定 ${pathCount} 条路径，无法删除`,
      })
    }

    const deleted = await prisma.storageRoot.update({
      where: { storageRootId },
      data: { deleteFlag: 1, enabled: 0 },
    })
    return response.json({ code: 200, message: '删除成功', data: deleted })
  }
}
