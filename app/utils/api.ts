import axios from 'axios';
import { ListResponse } from '#interfaces/response'
import fs from 'fs';
import path from 'path';
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

async function download_file(serverUrl: string, filePath: string, savePath: string): Promise<void> {
    try {
        // 创建写入流
        const writer = fs.createWriteStream(savePath);

        // 发起异步请求
        const response = await axios({
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
        console.error(`下载请求失败: ${err.message}`, filePath, savePath);
        throw new Error(`下载请求失败: ${err.message}`);
    }
}

export { sAxios, syncApi, download_file };