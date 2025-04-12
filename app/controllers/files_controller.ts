// import type { HttpContext } from '@adonisjs/core/http'
import type { HttpContext } from '@adonisjs/core/http'
import fs from 'fs'
import { get_os } from '#utils/index'

export default class FilesController {
    public async index({ request, response }: HttpContext) {
        const { file } = request.body()
        // 检查文件是否存在
        if (!fs.existsSync(file)) {
            return response.status(400).json({
                message: '图片路径错误',
                error: 'image error.',
            })
        }

        // 设置文件的MIME类型，这里假设你要返回JPEG图片
        response.header('Content-Type', 'image/jpeg')

        // 使用StreamedResponse返回图片文件流
        response.stream(fs.createReadStream(file))
    }

    public async apk({ response }: HttpContext) {
        let apkPath = '/data/file/smanga1.1.apk'
        if (get_os() === 'Windows') {
            apkPath = './data/file/smanga1.1.apk';
        }
        
        // 检查文件是否存在
        if (!fs.existsSync(apkPath)) {
            return response.status(400).json({
                message: '文件不存在',
                error: 'file error.',
            })
        }

        // 设置文件的MIME类型，这里假设你要返回JPEG图片
        response.attachment(apkPath)

        return response.send(fs.readFileSync(apkPath))
    }
}