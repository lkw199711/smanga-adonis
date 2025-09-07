import prisma from "#start/prisma";
import fs from "fs";
import path from "path";
import { error_log } from "#utils/log";
import { is_img, get_config, path_poster, path_cache, first_image, is_directory } from "#utils/index";
import { addTask } from "./queue_service.js";
import { TaskPriority } from "#type/index";
import { extractFirstImageSyncOrder } from '#utils/unzip'
import { Unrar } from '#utils/unrar'
import { Un7z } from '#utils/un7z'
import { metaType } from "../type/index.js";


export default class ReloadMangaMetaJob {
    private mangaId: number;
    private mangaRecord: any;
    private chapterRecord: any;
    private meta: any;
    private tagColor = '#a0d911' // 默认标签颜色
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

        await this.meta_scan();
        await this.meta_scan_series()

        await this.manga_poster();

        // 更新章节封面
        const sqlChapters = await prisma.chapter.findMany({
            where: { mangaId: this.mangaId },
        })

        sqlChapters.forEach(async (chapter) => {
            this.chapterRecord = chapter
            await this.chapter_poster(this.chapterRecord.chapterPath);
        });

        return true;
    }

    /**
   * 
   * @param recasn 是否重新扫描元数据
   * @returns 
   */
    async meta_scan() {
        const dirOutExt = this.mangaRecord.mangaPath.replace(/(.cbr|.cbz|.zip|.7z|.epub|.rar|.pdf)$/i, '')
        const dirMeta = dirOutExt + '-smanga-info'

        // 没有元数据文件
        if (!fs.existsSync(dirMeta)) return false

        // 删除原有的元数据
        await prisma.meta.deleteMany({
            where: {
                mangaId: this.mangaRecord.mangaId,
            },
        })

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

            // 更新章节顺序
            const chapters = info?.chapters || []
            for (let index = 0; index < chapters.length; index++) {
                const chapter: any = chapters[index];
                const title = chapter.title || chapter.name;
                await prisma.chapter.updateMany({
                    where: {
                        mangaId: this.mangaRecord.mangaId,
                        chapterName: title,
                    },
                    data: {
                        chapterNumber: index.toString().padStart(5, '0'),
                    },
                })
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

        // 检索漫画文件夹内的封面图片
        if (!sourcePoster && fs.existsSync(dir) && fs.statSync(dir).isDirectory()) {
            extensions.some((ext) => {
                const picPath = path.join(dir, 'cover' + ext)
                if (fs.existsSync(picPath)) {
                    sourcePoster = picPath
                    return true
                }
            })
        }

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

    async chapter_poster(dir: string) {
        const cachePath = path_cache()
        const posterPath = path_poster()
        // 为防止rar包内默认的文件名与chapterId重名,加入特定前缀
        const posterName = `${posterPath}/smanga_chapter_${this.chapterRecord.chapterId}.jpg`
        // 压缩目标图片大小
        const maxSizeKB = get_config()?.compress?.poster || 100
        // 不复制封面,直接使用源文件
        const doNotCopyCover = get_config()?.scan?.doNotCopyCover ?? 1
        // 是否在压缩包内找到封面
        let hasPosterInZip = false
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
        if (fs.existsSync(dirMeta)) {
            extensions.some((ext) => {
                const picPath = dirMeta + '/cover' + ext
                if (fs.existsSync(picPath)) {
                    sourcePoster = picPath
                    return true
                }
            })
        }

        // 都没有找到返回空
        if (!sourcePoster && this.chapterRecord.chapterType === 'img') {
            sourcePoster = first_image(dir)
        }

        if (!sourcePoster && ['zip', 'rar', '7z'].includes(this.chapterRecord.chapterType)) {
            // 解压缩获取封面
            const cachePoster = `${cachePath}/smanga_cache_${this.chapterRecord.chapterId}.jpg`

            if (this.chapterRecord.chapterType === 'zip') {
                hasPosterInZip = await extractFirstImageSyncOrder(dir, cachePoster)
                if (hasPosterInZip) {
                    sourcePoster = cachePoster
                }
            } else if (this.chapterRecord.chapterType === 'rar') {
                const unrar = new Unrar(dir, cachePoster)
                hasPosterInZip = await unrar.extract_first_image_order(dir, cachePoster)
                if (hasPosterInZip) {
                    sourcePoster = cachePoster
                }
            } else if (this.chapterRecord.chapterType === '7z') {
                const un7z = new Un7z(dir, cachePoster)
                const image = await un7z.first_image_7z(dir, cachePath)
                if (image) {
                    sourcePoster = `${cachePath}/${image}`
                }
                // 7z
            }
        }

        // 不复制封面,直接使用源文件
        if (!hasPosterInZip && sourcePoster && doNotCopyCover && fs.statSync(sourcePoster).size <= maxSizeKB * 1024) {
            await prisma.chapter.update({
                where: { chapterId: this.chapterRecord.chapterId },
                data: { chapterCover: sourcePoster },
            })

            this.chapterRecord.chapterCover = sourcePoster

            if (!this.mangaRecord.mangaCover) {
                // 直接使用update的返回值会丢失id 才用补充赋值的形式补全数据
                await prisma.manga.update({
                    where: { mangaId: this.mangaRecord.mangaId },
                    data: { mangaCover: sourcePoster },
                })

                this.mangaRecord.mangaCover = sourcePoster
            }

            return sourcePoster
        }

        if (sourcePoster) {
            // 写入漫画与章节封面
            await prisma.chapter.update({
                where: { chapterId: this.chapterRecord.chapterId },
                data: { chapterCover: posterName },
            })
            this.chapterRecord.chapterCover = posterName

            if (!this.mangaRecord.mangaCover) {
                // 直接使用update的返回值会丢失id 才用补充赋值的形式补全数据
                await prisma.manga.update({
                    where: { mangaId: this.mangaRecord.mangaId },
                    data: { mangaCover: posterName },
                })
                this.mangaRecord.mangaCover = posterName
            }

            // 压缩图片
            // await compressImageToSize(sourcePoster, posterName, maxSizeKB)

            // 复制封面到poster目录 使用单独任务队列
            const args = {
                inputPath: sourcePoster,
                outputPath: posterName,
                maxSizeKB,
                chapterRecord: this.chapterRecord
            }

            await addTask({
                taskName: `reload_meta_${this.mangaId}`,
                command: 'copyPoster',
                args,
                priority: TaskPriority.copyPoster,
                timeout: 1000 * 6,
            })

            return posterName
        } else {
            return ''
        }
    }

    /**
     * 扫描 series.json 元数据
     * @returns 
     */
    async meta_scan_series() {
        const mangaPath = this.mangaRecord.mangaPath
        if (!is_directory(mangaPath)) return;

        const fils = fs.readdirSync(mangaPath);
        const series = fils.find(file => file === 'series.json');
        if (!series) return;

        // 删除原有的元数据
        await prisma.meta.deleteMany({
            where: {
                mangaId: this.mangaRecord.mangaId,
            },
        })

        const seriesFile = path.join(mangaPath, series);
        const rawData = fs.readFileSync(seriesFile, 'utf-8')
        const jsonParse = JSON.parse(rawData)
        this.meta = jsonParse?.metadata ? jsonParse.metadata : jsonParse

        if (this.meta?.tags) {
            const tags: string[] = typeof this.meta.tags === 'string' ? this.meta.tags.split(',') : this.meta.tags
            await this.tag_insert(tags)
        }

        if (this.meta?.authors) {
            await this.prisma_meta_insert('author', this.meta.authors);
        }

        if (this.meta?.name) {
            await this.prisma_meta_insert('title', this.meta.name);
        }

        if (this.meta?.alias) {
            await this.prisma_meta_insert('subTitle', this.meta.alias);
        }

        if (this.meta?.description_text) {
            await this.prisma_meta_insert('describe', this.meta.description_text);
        }

        if (this.meta?.year) {
            await this.prisma_meta_insert(metaType.publishDate, String(this.meta.year));
        }

        if (this.meta?.publisher) {
            await this.prisma_meta_insert(metaType.publisher, this.meta.publisher);
        }

        if (this.meta?.status) {
            await this.prisma_meta_insert(metaType.status, this.meta.status);
        }
    }

    /**
     * 向数据库中插入元数据
     * @param key 元数据名称
     * @param value 元数据值
     */
    async prisma_meta_insert(key: string, value: string) {
        await prisma.meta.create({
            data: {
                manga: {
                    connect: {
                        mangaId: this.mangaRecord.mangaId,
                    },
                },
                metaName: key,
                metaContent: value,
            }
        })
    }

    async tag_insert(tags: any[]) {
        for (let tag of tags) {
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
                        tagColor: this.tagColor,
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
    }
}