import axios from 'axios';
import { ListResponse } from '#interfaces/response'
import fs from 'fs';
import { error_log } from './log.js';
import { s_delete } from './index.js';
/**
 * 创建默认接口请求设置
 * 传参接收使用json
 * 默认传参 userid 时间戳 密钥
 * @type {Axios}
 */
const sAxios = axios.create({
    timeout: 10 * 1000,
    params: {},
    headers: {
        'Content-Type': 'application/json; charset=UTF-8',
    },
    transformRequest: [
        (data) => {
            // 获取时间戳
            const timestamp = new Date().getTime();
            // 初始化传参
            data = data || {};
            // 加入时间戳与密钥
            data = Object.assign(data, {
                timestamp,
            });

            // 删除多余参数
            if (data.data && data.data.createTime) {
                delete data.data.createTime;
            }
            if (data.data && data.data.updateTime) {
                delete data.data.updateTime;
            }

            // 返回json
            return JSON.stringify(data);
        },
    ],
    transformResponse: [
        function (response: Response) {
            response = response || {};

            if (typeof response === 'string') response = JSON.parse(response);

            return response;
        },
    ],
});

const syncApi = {
    async analysis(url: string): Promise<any> {
        const res = sAxios.get(url);
        return (await res).data;
    },
    async chapters(url: string, mangaId: number): Promise<any> {
        const res = sAxios.get(`${url}/analysis/chapters`, { params: { mangaId } });
        return (await res).data;
    },
    async images(url: string, chapterId: number): Promise<any> {
        const res = sAxios.get(`${url}/analysis/images`, { params: { chapterId } });
        return (await res).data;
    },
    async mangas(url: string, mediaId: number): Promise<ListResponse> {
        const res = sAxios.get(`${url}/analysis/mangas`, { params: { mediaId } });
        return (await res).data;
    },
    async file(url: string, filePath: string): Promise<any> {
        const res = sAxios.post(`${url}/file`, { file: filePath });
        return (await res).data;
    }
}

async function download_file1(serverUrl: string, filePath: string, savePath: string): Promise<void> {
    try {
        // 创建写入流
        const writer = fs.createWriteStream(savePath);

        // 发起异步请求
        const response = await axios({
            timeout: 60 * 1000,
            method: 'get',
            url: `${serverUrl}/file`,
            params: { file: filePath },
            data: { file: filePath },
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
            },
            responseType: 'stream'
        });

        // 管道传输数据流
        response.data.pipe(writer);

        // 返回下载完成Promise
        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                resolve();
            });
            writer.on('error', (err) => {
                fs.unlinkSync(savePath);
                reject(new Error(`文件写入失败: ${err.message}`));
            });
        });

    } catch (err) {
        console.error(`下载请求失败: ${err.message}`, `${serverUrl}/file`, filePath, savePath);
        throw new Error(`下载请求失败: ${err.message}`);
    }
}

interface RetryOptions {
    maxRetries: number;
    initialDelay: number;
    backoffFactor: number;
}

const defaultRetryOptions: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    backoffFactor: 2
};

async function download_file(
    serverUrl: string,
    filePath: string,
    savePath: string,
    retryOptions: RetryOptions = defaultRetryOptions
): Promise<void> {
    let retryCount = 0;
    let currentDelay = retryOptions.initialDelay;

    const performDownload = async () => {
        const writer = fs.createWriteStream(savePath);
        const response = await axios({
            timeout: 60 * 1000,
            method: 'get',
            url: `${serverUrl}/file`,
            params: { file: filePath },
            data: { file: filePath },
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
            },
            responseType: 'stream'
        });

        return new Promise((resolve, reject) => {
            response.data.pipe(writer);
            writer.on('finish', resolve);
            writer.on('error', (err) => {
                fs.unlinkSync(savePath);
                reject(new Error(`文件写入失败: ${err.message}`));
            });
        });
    };

    while (retryCount <= retryOptions.maxRetries) {
        try {
            await performDownload();
            return;
        } catch (err) {
            if (retryCount === retryOptions.maxRetries) {
                // 写入错误日志
                error_log('[download file]', `${filePath} 下载失败，请尝试手动处理, 已重试${retryOptions.maxRetries}次: ${err.message}`);
                // 删除空文件
                s_delete(savePath);
                // 抛出错误 使队列重试
                throw new Error(`下载失败，已重试${retryOptions.maxRetries}次: ${err.message}`);
            }
            await new Promise(resolve => setTimeout(resolve, currentDelay));
            currentDelay *= retryOptions.backoffFactor;
            retryCount++;
        }
    }
}

export { sAxios, syncApi, download_file };