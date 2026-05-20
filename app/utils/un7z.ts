import Seven from 'node-7z'
import { is_img } from './index.js'
import * as path from 'path'
import log from '#services/log_service'

// async function extract7z(filePath: string, outputDir: string) {
//   const myStream = Seven.extractFull(filePath, outputDir)
//   myStream.on('end', () => {})
//   myStream.on('error', (_err: any) => {})
// }

export async function extract7z(filePath: string, outputDir: string) {
  return new Promise<boolean>((resolve, reject) => {
    const myStream = Seven.extractFull(filePath, outputDir)

    myStream.on('end', () => {
      void log.info({
        type: 'media',
        module: 'un7z',
        action: 'extract.full.completed',
        message: 'Extraction complete',
        context: { filePath, outputDir },
      })
      resolve(true)
    })

    myStream.on('error', (err: any) => {
      void log.error({
        type: 'media',
        module: 'un7z',
        action: 'extract.full.failed',
        message: '7z extract failed',
        error: err,
        context: { filePath, outputDir },
      })
      reject(err)
    })
  })
}

export async function z_list(filePath: string) {
  return Seven.list(filePath, {
    $cherryPick: ['*.jpg*', '*.js'],
  })
}

export async function list7zContents(filePath: string): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    const fileList: string[] = []

    const myStream = Seven.list(filePath)

    myStream.on('data', (file) => {
      fileList.push(file.file)
    })

    myStream.on('end', () => {
      void log.info({
        type: 'media',
        module: 'un7z',
        action: 'list.completed',
        message: 'Listing complete',
        context: { filePath, count: fileList.length },
      })
      resolve(fileList)
    })

    myStream.on('error', (err: any) => {
      void log.error({
        type: 'media',
        module: 'un7z',
        action: 'list.failed',
        message: '7z list failed',
        error: err,
        context: { filePath },
      })
      reject(err)
    })
  })
}

export async function first_image_7z(filePath: string, outputDir: string) {
  void log.info({
    type: 'media',
    module: 'un7z',
    action: 'first_image.started',
    message: 'first_image_7z',
    context: { filePath, outputDir },
  })

  const fileList = await list7zContents(filePath)
  let image = fileList.find((file: string) => is_img(file))

  if (!image) return false

  // 取得文件名
  image = path.basename(image)

  // 取得输出目录
  // const outputDir = path.dirname(outputFile)

  return new Promise<string>((resolve, reject) => {
    const myStream = Seven.extract(filePath, outputDir, {
      recursive: true,
      $cherryPick: [image],
    })

    myStream.on('end', () => {
      void log.info({
        type: 'media',
        module: 'un7z',
        action: 'first_image.extract.completed',
        message: 'Extraction complete',
        context: { filePath, outputDir, image },
      })
      resolve(image)
    })

    myStream.on('error', (err: any) => {
      void log.error({
        type: 'media',
        module: 'un7z',
        action: 'first_image.extract.failed',
        message: 'first image extract failed',
        error: err,
        context: { filePath, outputDir, image },
      })
      reject(err)
    })
  })
}

export class Un7z {
  private filePath: string
  private outputDir: string

  constructor(filePath: string, outputDir: string) {
    this.filePath = filePath
    this.outputDir = outputDir
  }

  public async first_image_7z(
    filePath: string = this.filePath,
    outputDir: string = this.outputDir
  ) {
    void log.info({
      type: 'media',
      module: 'un7z',
      action: 'first_image.class.started',
      message: 'first_image_7z',
      context: { filePath, outputDir },
    })

    let fileList = await list7zContents(filePath)

    // 优先查找文件名包含 cover 的图片
    const coverNameImg = fileList.find((file: string) => /cover/i.test(file) && is_img(file))
    if (coverNameImg) {
      fileList = [coverNameImg]
    }

    let image = fileList.find((file: string) => is_img(file))

    if (!image) return false

    // 取得文件名
    image = path.basename(image)

    // 取得输出目录
    // const outputDir = path.dirname(outputFile)

    return new Promise<string>((resolve, reject) => {
      const myStream = Seven.extract(filePath, outputDir, {
        recursive: true,
        $cherryPick: [image],
      })

      myStream.on('end', () => {
        void log.info({
          type: 'media',
          module: 'un7z',
          action: 'first_image.class.extract.completed',
          message: 'Extraction complete',
          context: { filePath, outputDir, image },
        })
        resolve(image)
      })

      myStream.on('error', (err: any) => {
        void log.error({
          type: 'media',
          module: 'un7z',
          action: 'first_image.class.extract.failed',
          message: 'first image extract failed',
          error: err,
          context: { filePath, outputDir, image },
        })
        reject(err)
      })
    })
  }
}

// extract7z('path/to/file.7z', 'output/directory')
