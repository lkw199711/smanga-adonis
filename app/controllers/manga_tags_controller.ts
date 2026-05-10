import type { HttpContext } from '@adonisjs/core/http'
import prisma from '#start/prisma'
import {
  idParamMangaTagValidator,
  createMangaTagValidator,
  updateMangaTagValidator,
} from '#validators/manga_tag'

export default class MangaTagsController {
  private async checkAdmin(request: any, response: any): Promise<boolean> {
    const user = (request as any).user
    if (!user || user.role !== 'admin') {
      response.status(403).json({ code: 403, message: '无权限', status: 'no permission' })
      return false
    }
    return true
  }

  public async index({ response }: HttpContext) {
    const list = await prisma.mangaTag.findMany()
    return response.json({ code: 200, message: '', list, count: list.length })
  }

  public async show({ params, response }: HttpContext) {
    const { mangaTagId } = await idParamMangaTagValidator.validate(params)
    const mangaTag = await prisma.mangaTag.findUnique({ where: { mangaTagId } })
    return response.json({ code: 200, message: '', data: mangaTag })
  }

  public async create({ request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const insertData = await createMangaTagValidator.validate(request.all())
    const mangaTag = await prisma.mangaTag.create({
      data: insertData,
    })
    return response.json({ code: 200, message: '新增成功', data: mangaTag })
  }

  public async update({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mangaTagId } = await idParamMangaTagValidator.validate(params)
    const modifyData = await updateMangaTagValidator.validate(request.all())
    const mangaTag = await prisma.mangaTag.update({
      where: { mangaTagId },
      data: modifyData,
    })
    return response.json({ code: 200, message: '更新成功', data: mangaTag })
  }

  public async destroy({ params, request, response }: HttpContext) {
    if (!(await this.checkAdmin(request, response))) return

    const { mangaTagId } = await idParamMangaTagValidator.validate(params)
    const mangaTag = await prisma.mangaTag.delete({ where: { mangaTagId } })
    return response.json({ code: 200, message: '删除成功', data: mangaTag })
  }
}
