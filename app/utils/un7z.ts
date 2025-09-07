import Seven from 'node-7z'
import { is_img } from './index.js'
import * as path from 'path'

// async function extract7z(filePath: string, outputDir: string) {
//   const myStream = Seven.extractFull(filePath, outputDir)

//   myStream.on('end', () => console.log('Extraction complete'))
//   myStream.on('error', (err: any) => console.error('Error:', err))
// }

export async function extract7z(filePath: string, outputDir: string) {
  return new Promise<boolean>((resolve, reject) => {
    const myStream = Seven.extractFull(filePath, outputDir)

    myStream.on('end', () => {
      console.log('Extraction complete')
      resolve(true)
    })

    myStream.on('error', (err: any) => {
      console.error('Error:', err)
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
      console.log('Listing complete')
      resolve(fileList)
    })

    myStream.on('error', (err: any) => {
      console.error('Error:', err)
      reject(err)
    })
  })
}

export async function first_image_7z(filePath: string, outputDir: string) {
  console.log('first_image_7z', filePath, outputDir)

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
      console.log('Extraction complete')
      resolve(image)
    })

    myStream.on('error', (err: any) => {
      console.error('Error:', err)
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
    console.log('first_image_7z', filePath, outputDir)

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
        console.log('Extraction complete')
        resolve(image)
      })

      myStream.on('error', (err: any) => {
        console.error('Error:', err)
        reject(err)
      })
    })
  }
}

// extract7z('path/to/file.7z', 'output/directory')
