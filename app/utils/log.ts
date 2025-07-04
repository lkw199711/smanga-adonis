
import prisma from "#start/prisma";
const version = '3.9.9';
const environment = 'production';

/**
 * 插入漫画扫描日志
 * @param param0 
 */
async function insert_manga_scan_log({ mediaName, mangaId, mangaName, newChapters }: any) {
    if (newChapters > 0) {
        const message = `[manga scan]${mediaName} ${mangaName}(${mangaId}) 扫描完成, 新增章节数: ${newChapters}`;
        await prisma.log.create({
            data: {
                message: message,
                logType: 'manga-scan',
                logLevel: 2,
                version: version,
                environment: environment,
            },
        });
    } else if (newChapters < 0) {
        const message = `[manga scan]${mediaName} ${mangaName}(${mangaId}) 扫描完成, 删除章节数: ${Math.abs(newChapters)}`;
        await prisma.log.create({
            data: {
                message: message,
                logType: 'manga-scan',
                logLevel: 2,
                version: version,
                environment: environment,
            },
        });
    } else {
        const message = `[manga scan]${mediaName} ${mangaName}(${mangaId}) 扫描完成, 无章节变动`;
        await prisma.log.create({
            data: {
                message: message,
                logType: 'manga-scan',
                logLevel: 1,
                version: version,
                environment: environment,
            },
        });
    }
}

async function media_cover_log({ mediaId, mediaName, mediaCover }: any) {
    const message = `[media poster]媒体库 ${mediaName}(${mediaId}) 封面生成完成, 封面路径: ${mediaCover}`;
    await prisma.log.create({
        data: {
            message: message,
            logType: 'media-cover',
            logLevel: 2,
            version: version,
            environment: environment,
        },
    });
}

async function error_log(model: string, errorMsg: string) {
    const message = `${model} ${errorMsg}`;
    console.log(message);
    await prisma.log.create({
        data: {
            message: message,
            logType: 'error',
            logLevel: 3,
            version: version,
            environment: environment,
        },
    });
}

export { insert_manga_scan_log, media_cover_log, error_log };