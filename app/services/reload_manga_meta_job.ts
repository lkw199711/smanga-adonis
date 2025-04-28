import prisma from "#start/prisma";
import fs from "fs";
import path from "path";
import { error_log } from "#utils/log";
import { is_img, get_config, path_poster } from "#utils/index";
import { addTask } from "./queue_service.js";
import { TaskPriority } from "#type/index";


export default class ReloadMangaMetaJob {
    private mangaId: number;
    private mangaRecord: any;
    constructor({ mangaId }: { mangaId: number }) {
        this.mangaId = mangaId;
    }

    async run() {
        this.mangaRecord = await prisma.manga.findUnique({ where: { mangaId: this.mangaId } }).catch(async (error) => {
            await error_log('[manga scan]', `扫描元数据任务失败,漫画信息不存在 ${this.mangaId} ${error}`);
            return null;
        });

        if (!this.mangaRecord) {
            return;
        }

        await this.meta_scan(true);

        await this.manga_poster();

        return true;
    }

    /**
   * 
   * @param recasn 是否重新扫描元数据
   * @returns 
   */
    async meta_scan(recasn: boolean = false) {
        const dirOutExt = this.mangaRecord.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
        const dirMeta = dirOutExt + '-smanga-info'

        // 没有元数据文件
        if (!fs.existsSync(dirMeta)) return false

        // 重扫元数据的时候删除原有元数据
        if (recasn) {
            await prisma.meta.deleteMany({
                where: {
                    mangaId: this.mangaRecord.mangaId,
                },
            })
        }

        // banner,thumbnail,character
        const metaFiles = fs.readdirSync(dirMeta)
        const cahracterPics: string[] = []
        for (let index = 0; index < metaFiles.length; index++) {
            const file = metaFiles[index];
            const filePath = path.join(dirMeta, file)
            if (!is_img(file)) continue;
            if (/banner/i.test(file)) {
                await prisma.meta.create({
                    data: {
                        manga: {
                            connect: {
                                mangaId: this.mangaRecord.mangaId,
                            },
                        },
                        metaName: 'banner',
                        metaFile: filePath,
                    },
                })
            } else if (/thumbnail/i.test(file)) {
                await prisma.meta.create({
                    data: {
                        manga: {
                            connect: {
                                mangaId: this.mangaRecord.mangaId,
                            },
                        },
                        metaName: 'thumbnail',
                        metaFile: filePath,
                    },
                })
            } else if (/cover/i.test(file)) {
                await prisma.meta.create({
                    data: {
                        manga: {
                            connect: {
                                mangaId: this.mangaRecord.mangaId,
                            },
                        },
                        metaName: 'cover',
                        metaFile: filePath,
                    },
                })
            } else {
                cahracterPics.push(filePath)
            }
        }

        const infoFile = path.join(dirMeta, 'info.json')
        const metaFile = path.join(dirMeta, 'meta.json')
        // 为兼容老的元数据文件 允许文件名为info
        let targetMetaFile = '';
        if (fs.existsSync(infoFile)) {
            targetMetaFile = infoFile
        } else if (fs.existsSync(metaFile)) {
            targetMetaFile = metaFile
        }

        if (fs.existsSync(targetMetaFile)) {
            const rawData = fs.readFileSync(targetMetaFile, 'utf-8')
            const info = JSON.parse(rawData)

            // 一般性元数据
            const keys = Object.keys(info)
            for (let index = 0; index < keys.length; index++) {
                const key = keys[index];
                const value = info[key]
                if (['title', 'author', 'star', 'describe', 'publishDate', 'classify', 'finished', 'updateDate'].includes(key)) {
                    try {
                        await prisma.meta.create({
                            data: {
                                manga: {
                                    connect: {
                                        mangaId: this.mangaRecord.mangaId,
                                    },
                                },
                                metaName: key,
                                metaContent: String(value),
                            },
                        })
                    } catch (e) {
                        console.log(e);
                    }
                }
            }

            // 插入标签
            const tagColor = '#a0d911'
            const tags: string[] = info?.tags || []

            for (let index = 0; index < tags.length; index++) {
                const tag: any = tags[index];
                // 系统标签保持唯一性,用户标签不做唯一性限制
                // 扫描时确认没有同名系统标签,没有则创建
                const tagName = typeof tag === 'object' ? tag.name : tag
                let tagRecord = await prisma.tag.findFirst({
                    where: { tagName: tagName, userId: 0 },
                })
                if (!tagRecord) {
                    tagRecord = await prisma.tag.create({
                        data: {
                            tagName: tagName,
                            tagColor,
                            userId: 0,
                        },
                    })
                }

                const mangaTagRecord = await prisma.mangaTag.findFirst({
                    where: {
                        mangaId: this.mangaRecord.mangaId,
                        tagId: tagRecord.tagId,
                    },
                })

                if (!mangaTagRecord) {
                    await prisma.mangaTag
                        .create({
                            data: {
                                mangaId: this.mangaRecord.mangaId,
                                tagId: tagRecord.tagId,
                            },
                        })
                        .catch((e) => {
                            console.log('标签插入失败', e)
                        })
                }
            }

            // 插入角色
            const characters = info?.character || []
            for (let index = 0; index < characters.length; index++) {
                const char = characters[index];
                // 同漫画内角色名唯一
                let charRecord = await prisma.meta.findFirst({
                    where: { metaContent: char.name, mangaId: this.mangaRecord.mangaId },
                })
                if (!charRecord) {
                    // 头像图片
                    const header = cahracterPics.find((pic) => pic.includes(char.name))
                    charRecord = await prisma.meta.create({
                        data: {
                            manga: {
                                connect: {
                                    mangaId: this.mangaRecord.mangaId,
                                },
                            },
                            metaName: 'character',
                            metaContent: char.name,
                            description: char.description,
                            metaFile: header,
                        },
                    })
                }
            }
        }
    }

    async manga_poster() {
        const dir = this.mangaRecord.mangaPath
        const posterPath = path_poster()
        // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
        const posterName = `${posterPath}/smanga_manga_${this.mangaRecord.mangaId}.jpg`
        // 压缩目标图片大小
        const maxSizeKB = get_config()?.compress?.poster || 100
        // 源封面
        let sourcePoster = ''
        // 检索平级目录封面图片
        const dirOutExt = dir.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
        const extensions = ['.png', '.PNG', '.jpg', '.jpeg', '.JPG', '.webp', '.WEBP']
        extensions.some((ext) => {
            const picPath = dirOutExt + ext
            if (fs.existsSync(picPath)) {
                sourcePoster = picPath
                return true
            }
        })

        // 检索元数据目录封面图片
        const dirMeta = dirOutExt + '-smanga-info'
        if (!sourcePoster && fs.existsSync(dirMeta)) {
            extensions.some((ext) => {
                const picPath = dirMeta + '/cover' + ext
                if (fs.existsSync(picPath)) {
                    sourcePoster = picPath
                    return true
                }
            })
        }

        if (sourcePoster) {
            // 复制封面到poster目录 使用单独任务队列
            const args = {
                inputPath: sourcePoster,
                outputPath: posterName,
                maxSizeKB,
                mangaRecord: this.mangaRecord
            }

            await addTask({
                taskName: `reload_manga_meta_${this.mangaId}`,
                command: 'copyPoster',
                args,
                priority: TaskPriority.copyPoster,
                timeout: 1000 * 6,
            })

            await prisma.manga.update({
                where: { mangaId: this.mangaRecord.mangaId },
                data: { mangaCover: posterName },
            })
            this.mangaRecord.mangaCover = posterName

            return posterName
        } else {
            return ''
        }
    }
}