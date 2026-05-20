import axios from 'axios'
import { ListResponse } from '#interfaces/response'
import fs from 'fs'
import { error_log } from './log.js'
import { s_delete } from './index.js'
import log from '#services/log_service'

const sAxios = axios.create({
  timeout: 10 * 1000,
  params: {},
  headers: {
    'Content-Type': 'application/json; charset=UTF-8',
  },
  transformRequest: [
    (data) => {
      const timestamp = new Date().getTime()
      data = data || {}
      data = Object.assign(data, { timestamp })

      if (data.data && data.data.createTime) delete data.data.createTime
      if (data.data && data.data.updateTime) delete data.data.updateTime

      return JSON.stringify(data)
    },
  ],
  transformResponse: [
    function (response: Response) {
      response = response || {}
      if (typeof response === 'string') response = JSON.parse(response)
      return response
    },
  ],
})

const syncApi = {
  async analysis(url: string): Promise<any> {
    const res = sAxios.get(url)
    return (await res).data
  },
  async chapters(url: string, mangaId: number): Promise<any> {
    const res = sAxios.get(`${url}/analysis/chapters`, { params: { mangaId } })
    return (await res).data
  },
  async images(url: string, chapterId: number): Promise<any> {
    const res = sAxios.get(`${url}/analysis/images`, { params: { chapterId } })
    return (await res).data
  },
  async mangas(url: string, mediaId: number): Promise<ListResponse> {
    const res = await sAxios.get(`${url}/analysis/mangas`, { params: { mediaId } })
    return res.data
  },
  async file(url: string, filePath: string): Promise<any> {
    const res = sAxios.post(`${url}/file`, { file: filePath })
    return (await res).data
  },
}

interface RetryOptions {
  maxRetries: number
  initialDelay: number
  backoffFactor: number
}

const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  backoffFactor: 2,
}

async function download_file(
  serverUrl: string,
  filePath: string,
  savePath: string,
  retryOptions: RetryOptions = defaultRetryOptions
): Promise<void> {
  let retryCount = 0
  let currentDelay = retryOptions.initialDelay

  const performDownload = async () => {
    const writer = fs.createWriteStream(savePath)
    const response = await axios({
      timeout: 60 * 1000,
      method: 'get',
      url: `${serverUrl}/file`,
      params: { file: filePath },
      data: { file: filePath },
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
      },
      responseType: 'stream',
    })

    return new Promise((resolve, reject) => {
      response.data.pipe(writer)
      writer.on('finish', resolve)
      writer.on('error', (err) => {
        fs.unlinkSync(savePath)
        reject(new Error(`file write failed: ${err.message}`))
      })
    })
  }

  while (retryCount <= retryOptions.maxRetries) {
    try {
      await performDownload()
      return
    } catch (err: any) {
      if (retryCount === retryOptions.maxRetries) {
        await error_log(
          '[download file]',
          `${filePath} download failed after ${retryOptions.maxRetries} retries: ${err.message}`
        )

        await log.error({
          type: 'sync',
          module: 'download',
          action: 'remote.file.download.failed',
          message: `download failed after retries: ${filePath}`,
          error: err,
          context: {
            serverUrl,
            filePath,
            savePath,
            retries: retryOptions.maxRetries,
            retryCount,
            remoteStatus: err?.response?.status,
            remoteMessage: err?.response?.data?.message,
            remoteData: err?.response?.data,
          },
        })

        s_delete(savePath)
        throw new Error(`download failed after ${retryOptions.maxRetries} retries: ${err.message}`)
      }

      await new Promise((resolve) => setTimeout(resolve, currentDelay))
      currentDelay *= retryOptions.backoffFactor
      retryCount++
    }
  }
}

export { sAxios, syncApi, download_file }