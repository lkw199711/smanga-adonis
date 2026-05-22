#!/usr/bin/env node

import sharp from 'sharp'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// 基础路径
const BASE_PATH = path.join(__dirname, 'test-manga-data')

/**
 * 生成一个简单的漫画风格图片
 * @param {string} filepath - 保存路径
 * @param {number} width - 宽度
 * @param {number} height - 高度
 * @param {string} text - 图片上的文字
 * @param {string} bgColor - 背景色
 */
async function createMangaPage(filepath, width = 800, height = 1200, text = '', bgColor = '#ffffff') {
  try {
    // 创建 SVG 内容（模拟漫画页面）
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <!-- 背景 -->
        <rect width="100%" height="100%" fill="${bgColor}"/>
        
        <!-- 漫画格子边框 -->
        <rect x="20" y="20" width="${width - 40}" height="${height - 40}" 
              fill="none" stroke="#333" stroke-width="3"/>
        
        <!-- 模拟漫画分格 -->
        <line x1="20" y1="${height * 0.33}" x2="${width - 20}" y2="${height * 0.33}" 
              stroke="#333" stroke-width="2"/>
        <line x1="20" y1="${height * 0.66}" x2="${width - 20}" y2="${height * 0.66}" 
              stroke="#333" stroke-width="2"/>
        <line x1="${width * 0.5}" y1="${height * 0.33}" x2="${width * 0.5}" y2="${height * 0.66}" 
              stroke="#333" stroke-width="2"/>
        
        <!-- 文字内容 -->
        ${text ? `
          <text x="${width / 2}" y="${height / 2}" 
                font-family="Arial, sans-serif" font-size="32" 
                fill="#333" text-anchor="middle" dominant-baseline="middle">
            ${text}
          </text>
        ` : ''}
        
        <!-- 页码 -->
        <text x="${width / 2}" y="${height - 40}" 
              font-family="Arial, sans-serif" font-size="20" 
              fill="#666" text-anchor="middle">
          Page
        </text>
      </svg>
    `

    // 使用 sharp 将 SVG 转换为 JPEG
    await sharp(Buffer.from(svg))
      .jpeg({ quality: 85 })
      .toFile(filepath)
    
    console.log(`    ✓ 创建: ${path.basename(filepath)}`)
  } catch (error) {
    console.error(`    ✗ 创建失败: ${filepath}`, error.message)
  }
}

/**
 * 创建封面图片
 */
async function createCover(filepath, title = 'Cover', width = 800, height = 1200) {
  const colors = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', '#F7DC6F', '#BB8FCE']
  const bgColor = colors[Math.floor(Math.random() * colors.length)]
  
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <!-- 渐变背景 -->
      <defs>
        <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:${bgColor};stop-opacity:1" />
          <stop offset="100%" style="stop-color:${bgColor}88;stop-opacity:1" />
        </linearGradient>
      </defs>
      
      <rect width="100%" height="100%" fill="url(#grad)"/>
      
      <!-- 装饰框 -->
      <rect x="40" y="40" width="${width - 80}" height="${height - 80}" 
            fill="none" stroke="white" stroke-width="4" rx="10"/>
      
      <!-- 标题 -->
      <text x="${width / 2}" y="${height / 2 - 30}" 
            font-family="Arial, sans-serif" font-size="48" font-weight="bold"
            fill="white" text-anchor="middle" dominant-baseline="middle">
        ${title}
      </text>
      
      <text x="${width / 2}" y="${height / 2 + 40}" 
            font-family="Arial, sans-serif" font-size="28"
            fill="white" text-anchor="middle" dominant-baseline="middle">
        COVER
      </text>
    </svg>
  `

  await sharp(Buffer.from(svg))
    .jpeg({ quality: 90 })
    .toFile(filepath)
  
  console.log(`  ✓ 封面: ${path.basename(filepath)}`)
}

/**
 * 生成测试数据结构
 */
async function generateTestData() {
  console.log('🎨 开始生成测试漫画数据...\n')
  
  // 确保基础目录存在
  fs.mkdirSync(BASE_PATH, { recursive: true })
  
  // 生成 3 个漫画库
  for (let libNum = 1; libNum <= 3; libNum++) {
    const libPath = path.join(BASE_PATH, `漫画库${libNum}`)
    fs.mkdirSync(libPath, { recursive: true })
    console.log(`📚 创建漫画库: 漫画库${libNum}`)
    
    // 每个库生成 2-3 部漫画
    const mangaCount = Math.floor(Math.random() * 2) + 2
    for (let mangaNum = 1; mangaNum <= mangaCount; mangaNum++) {
      const mangaName = `测试漫画${libNum}-${mangaNum}`
      const mangaPath = path.join(libPath, mangaName)
      fs.mkdirSync(mangaPath, { recursive: true })
      console.log(`  📖 创建漫画: ${mangaName}`)
      
      // 创建漫画封面
      await createCover(path.join(mangaPath, 'cover.jpg'), mangaName)
      
      // 每部漫画生成 3-5 个章节
      const chapterCount = Math.floor(Math.random() * 3) + 3
      for (let chapterNum = 1; chapterNum <= chapterCount; chapterNum++) {
        const chapterName = `第${chapterNum}话`
        const chapterPath = path.join(mangaPath, chapterName)
        fs.mkdirSync(chapterPath, { recursive: true })
        
        // 创建章节封面
        await createCover(
          path.join(chapterPath, 'cover.jpg'), 
          `${mangaName} - ${chapterName}`,
          800,
          600
        )
        
        // 每个章节生成 5-10 张图片
        const imageCount = Math.floor(Math.random() * 6) + 5
        for (let imageNum = 1; imageNum <= imageCount; imageNum++) {
          const imageName = `第${chapterNum}话_第${imageNum}页.jpg`
          const imagePath = path.join(chapterPath, imageName)
          const pageText = `${mangaName}\n${chapterName} - 第${imageNum}页`
          
          await createMangaPage(imagePath, 800, 1200, pageText)
        }
      }
    }
    console.log('')
  }
  
  // 统计信息
  const mangaDirs = fs.readdirSync(BASE_PATH, { recursive: true })
    .filter(f => f.includes('测试漫画'))
    .filter(f => fs.statSync(path.join(BASE_PATH, f)).isDirectory()).length
  
  const chapterDirs = fs.readdirSync(BASE_PATH, { recursive: true })
    .filter(f => /^第.*话$/.test(path.basename(f)))
    .filter(f => fs.statSync(path.join(BASE_PATH, f)).isDirectory()).length
  
  const imageFiles = fs.readdirSync(BASE_PATH, { recursive: true })
    .filter(f => f.endsWith('.jpg')).length
  
  console.log('✅ 测试漫画数据生成完成!')
  console.log(`\n📊 统计信息:`)
  console.log(`   基础路径: ${BASE_PATH}`)
  console.log(`   漫画总数: ${mangaDirs} 部`)
  console.log(`   章节总数: ${chapterDirs} 个`)
  console.log(`   图片总数: ${imageFiles} 张`)
  console.log(`\n💡 使用方法:`)
  console.log(`   在 smanga 系统中添加扫描路径:`)
  console.log(`   ${BASE_PATH}`)
  console.log(`\n🗑️  清理测试数据:`)
  console.log(`   rm -rf "${BASE_PATH}"`)
  console.log('')
}

// 执行生成
generateTestData().catch(console.error)
