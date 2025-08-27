import axios from 'axios';
import { ListResponse } from '#interfaces/response'
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
    async mangas(url: string, mediaId: number): Promise<ListResponse> {
        const res = sAxios.get(url, { params: { mediaId } });
        return (await res).data;
    },
    async chapters(url: string, mangaId: number): Promise<ListResponse> { 
        const res = sAxios.get(url, { params: { mangaId } });
        return (await res).data;
    }
}

export { sAxios, syncApi };