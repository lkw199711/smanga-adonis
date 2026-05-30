#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import sharp from 'sharp'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const require = createRequire(import.meta.url)
const AdmZip = require('adm-zip')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const BASE_PATH = path.join(__dirname, 'test-manga-data')

const palette = ['#c94f4f', '#3f7c85', '#d4a017', '#4f6fb5', '#6f8f4e', '#8a5a83', '#c06f3d']

const stats = {
  directories: 0,
  images: 0,
  json: 0,
  archives: 0,
}

function assertSafeBasePath() {
  const resolvedBase = path.resolve(BASE_PATH)
  const expectedBase = path.resolve(__dirname, 'test-manga-data')
  if (resolvedBase !== expectedBase) {
    throw new Error(`Refusing to reset unexpected path: ${resolvedBase}`)
  }
}

function resetBasePath() {
  assertSafeBasePath()
  fs.rmSync(BASE_PATH, { recursive: true, force: true })
  fs.mkdirSync(BASE_PATH, { recursive: true })
  stats.directories += 1
}

function mkdirp(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
    stats.directories += 1
  }
}

function writeJson(filePath, data) {
  mkdirp(path.dirname(filePath))
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  stats.json += 1
}

function writeText(filePath, content) {
  mkdirp(path.dirname(filePath))
  fs.writeFileSync(filePath, content, 'utf8')
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function colorFor(seed) {
  let hash = 0
  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return palette[hash % palette.length]
}

function imageSvg({
  width = 800,
  height = 1200,
  title,
  subtitle = '',
  label = '',
  color = '#3f7c85',
}) {
  const lines = [title, subtitle].filter(Boolean)
  const text = lines
    .map((line, index) => {
      const fontSize = index === 0 ? 40 : 26
      const dy = index === 0 ? 0 : 46
      return `<tspan x="${width / 2}" dy="${dy}" font-size="${fontSize}">${escapeXml(line)}</tspan>`
    })
    .join('')

  return `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="#fbfaf7"/>
      <rect x="28" y="28" width="${width - 56}" height="${height - 56}" fill="none" stroke="#222" stroke-width="3"/>
      <rect x="54" y="54" width="${width - 108}" height="${Math.floor((height - 108) * 0.35)}" fill="${color}" opacity="0.88"/>
      <rect x="54" y="${Math.floor(height * 0.42)}" width="${Math.floor((width - 132) * 0.52)}" height="${Math.floor(height * 0.2)}" fill="#ffffff" stroke="#222" stroke-width="2"/>
      <rect x="${Math.floor(width * 0.56)}" y="${Math.floor(height * 0.42)}" width="${Math.floor((width - 132) * 0.44)}" height="${Math.floor(height * 0.2)}" fill="#ffffff" stroke="#222" stroke-width="2"/>
      <rect x="54" y="${Math.floor(height * 0.68)}" width="${width - 108}" height="${Math.floor(height * 0.2)}" fill="#ffffff" stroke="#222" stroke-width="2"/>
      <text x="${width / 2}" y="${height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Arial, sans-serif" font-weight="700" fill="#222">
        ${text}
      </text>
      <text x="${width / 2}" y="${height - 58}" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" fill="#555">${escapeXml(label)}</text>
    </svg>
  `
}

async function imageBuffer(options) {
  return sharp(Buffer.from(imageSvg(options)))
    .jpeg({ quality: 86 })
    .toBuffer()
}

async function createImage(filePath, options) {
  mkdirp(path.dirname(filePath))
  await sharp(Buffer.from(imageSvg(options)))
    .jpeg({ quality: 86 })
    .toFile(filePath)
  stats.images += 1
}

async function createCover(filePath, title, subtitle = 'cover', width = 800, height = 1200) {
  await createImage(filePath, {
    width,
    height,
    title,
    subtitle,
    label: 'SMANGA TEST FIXTURE',
    color: colorFor(`${title}:${subtitle}`),
  })
}

async function createPage(filePath, mangaName, chapterName, pageNumber) {
  await createImage(filePath, {
    title: mangaName,
    subtitle: `${chapterName} / page ${String(pageNumber).padStart(3, '0')}`,
    label: path.basename(filePath),
    color: colorFor(`${mangaName}:${chapterName}:${pageNumber}`),
  })
}

async function createPageSet(dir, mangaName, chapterName, pageCount = 3) {
  mkdirp(dir)
  for (let page = 1; page <= pageCount; page += 1) {
    await createPage(
      path.join(dir, `page-${String(page).padStart(3, '0')}.jpg`),
      mangaName,
      chapterName,
      page
    )
  }
}

async function createChapter(dir, mangaName, chapterName, pageCount = 3) {
  mkdirp(dir)
  await createCover(path.join(dir, 'cover.jpg'), chapterName, mangaName, 800, 600)
  await createPageSet(dir, mangaName, chapterName, pageCount)
}

async function createMangaWithChapters(root, mangaName, chapterNames, options = {}) {
  const mangaPath = path.join(root, ...(options.parents || []), mangaName)
  mkdirp(mangaPath)
  await createCover(path.join(mangaPath, 'cover.jpg'), mangaName)

  for (const chapterName of chapterNames) {
    await createChapter(
      path.join(mangaPath, chapterName),
      mangaName,
      chapterName,
      options.pageCount || 3
    )
  }

  return { mangaPath, mangaName, chapterNames }
}

async function createSingleManga(root, mangaName, options = {}) {
  const mangaPath = path.join(root, ...(options.parents || []), mangaName)
  mkdirp(mangaPath)
  await createCover(path.join(mangaPath, 'cover.jpg'), mangaName)
  await createPageSet(mangaPath, mangaName, mangaName, options.pageCount || 4)
  return { mangaPath, mangaName }
}

async function createMangaWithVolumes(root, mangaName, volumes, options = {}) {
  const mangaPath = path.join(root, ...(options.parents || []), mangaName)
  mkdirp(mangaPath)
  await createCover(path.join(mangaPath, 'cover.jpg'), mangaName)

  for (const volume of volumes) {
    const volumePath = path.join(mangaPath, volume.name)
    mkdirp(volumePath)
    for (const chapterName of volume.chapters) {
      await createChapter(
        path.join(volumePath, chapterName),
        mangaName,
        `${volume.name} ${chapterName}`,
        options.pageCount || 3
      )
    }
  }

  return { mangaPath, mangaName }
}

async function createSmangaMetadata(mangaPath, mangaName, chapterNames, options = {}) {
  const metaPath = options.metaPath || path.join(mangaPath, '.smanga')
  mkdirp(metaPath)
  writeJson(path.join(metaPath, 'info.json'), {
    title: `${mangaName} - metadata title`,
    subTitle: 'smanga custom metadata sample',
    author: 'SMANGA Fixture Author',
    star: 4,
    describe: 'This manga uses .smanga/info.json and metadata images.',
    publishDate: '2024-01-15',
    classify: 'fixture',
    finished: false,
    updateDate: '2026-05-30',
    publisher: 'Fixture Studio',
    status: 'ongoing',
    tags: ['smanga', 'metadata', 'fixture'],
    character: [
      {
        name: 'character1.jpg',
        description: 'Character image used to verify character metadata import.',
      },
    ],
    chapters: chapterNames.map((name) => ({ title: name })),
  })

  await createCover(path.join(metaPath, 'cover.jpg'), mangaName, 'metadata cover')
  await createImage(path.join(metaPath, 'banner.jpg'), {
    width: 1200,
    height: 420,
    title: mangaName,
    subtitle: 'metadata banner',
    label: 'banner.jpg',
    color: colorFor(`${mangaName}:banner`),
  })
  await createImage(path.join(metaPath, 'thumbnail.jpg'), {
    width: 480,
    height: 480,
    title: mangaName,
    subtitle: 'thumbnail',
    label: 'thumbnail.jpg',
    color: colorFor(`${mangaName}:thumbnail`),
  })
  await createImage(path.join(metaPath, 'character1.jpg'), {
    width: 520,
    height: 720,
    title: mangaName,
    subtitle: 'character1',
    label: 'character1.jpg',
    color: colorFor(`${mangaName}:character1`),
  })
}

function createSeriesJson(mangaPath, mangaName) {
  writeJson(path.join(mangaPath, 'series.json'), {
    metadata: {
      name: `${mangaName} - series title`,
      alias: 'series.json alias',
      authors: ['Series Fixture Author'],
      tags: 'series-json,metadata,fixture',
      description_text: 'This manga uses series.json metadata.',
      year: 2025,
      publisher: 'Series Fixture Publisher',
      status: 'ongoing',
    },
  })
}

async function createCbzChapter(filePath, mangaName, chapterName, pageCount = 3) {
  mkdirp(path.dirname(filePath))
  const zip = new AdmZip()
  const comicInfo = `<?xml version="1.0" encoding="UTF-8"?>
<ComicInfo xmlns:ty="https://github.com/inorichi/tachiyomi">
  <Title>${escapeXml(chapterName)}</Title>
  <Series>${escapeXml(mangaName)}</Series>
  <Writer>ComicInfo Fixture Author</Writer>
  <Summary>ComicInfo metadata stored inside a cbz chapter.</Summary>
  <Year>2026</Year>
  <Month>05</Month>
  <Day>30</Day>
  <Genre>fixture</Genre>
  <Tags>comicinfo,cbz,metadata</Tags>
  <ty:PublishingStatusTachiyomi type="string">Completed</ty:PublishingStatusTachiyomi>
</ComicInfo>
`
  zip.addFile('ComicInfo.xml', Buffer.from(comicInfo, 'utf8'))

  for (let page = 1; page <= pageCount; page += 1) {
    const buffer = await imageBuffer({
      title: mangaName,
      subtitle: `${chapterName} / page ${String(page).padStart(3, '0')}`,
      label: `page-${String(page).padStart(3, '0')}.jpg`,
      color: colorFor(`${mangaName}:${chapterName}:cbz:${page}`),
    })
    zip.addFile(`page-${String(page).padStart(3, '0')}.jpg`, buffer)
  }

  zip.writeZip(filePath)
  stats.archives += 1
}

async function generateFixtures() {
  resetBasePath()

  const serialRoot = path.join(BASE_PATH, '01-manga-chapter-image')
  await createMangaWithChapters(serialRoot, '连载漫画A', ['第01话 开始', '第02话 继续'])
  await createMangaWithChapters(serialRoot, '连载漫画B', ['第01话 初遇', '第02话 夜行'])

  const singleRoot = path.join(BASE_PATH, '02-manga-image')
  await createSingleManga(singleRoot, '单本散图漫画A')
  await createSingleManga(singleRoot, '单本散图漫画B')

  const categorySerialRoot = path.join(BASE_PATH, '03-category-manga-chapter-image')
  await createMangaWithChapters(categorySerialRoot, '分类连载漫画A', ['第01话', '第02话'], {
    parents: ['动作'],
  })
  await createMangaWithChapters(categorySerialRoot, '分类连载漫画B', ['第01话', '第02话'], {
    parents: ['治愈'],
  })

  const categorySingleRoot = path.join(BASE_PATH, '04-category-manga-image')
  await createSingleManga(categorySingleRoot, '分类单本漫画A', { parents: ['短篇'] })
  await createSingleManga(categorySingleRoot, '分类单本漫画B', { parents: ['插画集'] })

  const volumeRoot = path.join(BASE_PATH, '05-manga-volume-chapter-image')
  await createMangaWithVolumes(volumeRoot, '卷册嵌套漫画A', [
    { name: '第01卷', chapters: ['第01话', '第02话'] },
    { name: '第02卷', chapters: ['第03话'] },
  ])
  await createMangaWithVolumes(volumeRoot, '卷册嵌套漫画B', [
    { name: '上卷', chapters: ['第01话'] },
    { name: '下卷', chapters: ['第02话', '第03话'] },
  ])

  const categoryVolumeRoot = path.join(BASE_PATH, '06-category-manga-volume-chapter-image')
  await createMangaWithVolumes(
    categoryVolumeRoot,
    '分类卷册漫画A',
    [{ name: '第01卷', chapters: ['第01话', '第02话'] }],
    { parents: ['冒险'] }
  )
  await createMangaWithVolumes(
    categoryVolumeRoot,
    '分类卷册漫画B',
    [
      { name: 'Part 1', chapters: ['Chapter 01'] },
      { name: 'Part 2', chapters: ['Chapter 02'] },
    ],
    { parents: ['科幻'] }
  )

  const smangaMetaRoot = path.join(BASE_PATH, '07-smanga-metadata')
  const smangaManga = await createMangaWithChapters(smangaMetaRoot, 'SMANGA元数据漫画', [
    '第01话 起点',
    '第02话 转折',
  ])
  await createSmangaMetadata(smangaManga.mangaPath, smangaManga.mangaName, smangaManga.chapterNames)
  const sidecarManga = await createMangaWithChapters(smangaMetaRoot, '旁挂元数据漫画', [
    '第01话',
    '第02话',
  ])
  await createSmangaMetadata(
    sidecarManga.mangaPath,
    sidecarManga.mangaName,
    sidecarManga.chapterNames,
    { metaPath: `${sidecarManga.mangaPath}-smanga-info` }
  )

  const seriesRoot = path.join(BASE_PATH, '08-series-json-metadata')
  const seriesManga = await createMangaWithChapters(seriesRoot, 'SeriesJson元数据漫画', [
    '第01话',
    '第02话',
  ])
  createSeriesJson(seriesManga.mangaPath, seriesManga.mangaName)
  const seriesSingleManga = await createSingleManga(seriesRoot, 'SeriesJson单本漫画')
  createSeriesJson(seriesSingleManga.mangaPath, seriesSingleManga.mangaName)

  const comicInfoRoot = path.join(BASE_PATH, '09-comicinfo-cbz')
  const comicInfoMangaPath = path.join(comicInfoRoot, 'ComicInfo压缩章节漫画')
  mkdirp(comicInfoMangaPath)
  await createCover(path.join(comicInfoMangaPath, 'cover.jpg'), 'ComicInfo压缩章节漫画')
  await createCbzChapter(
    path.join(comicInfoMangaPath, '第01话.cbz'),
    'ComicInfo压缩章节漫画',
    '第01话'
  )
  await createCbzChapter(
    path.join(comicInfoMangaPath, '第02话.cbz'),
    'ComicInfo压缩章节漫画',
    '第02话'
  )

  const mixedRoot = path.join(BASE_PATH, '10-auto-recommend-mixed')
  await createMangaWithChapters(mixedRoot, '自动推荐-连载漫画', ['第01话', '第02话'])
  await createSingleManga(mixedRoot, '自动推荐-单本散图')
  await createMangaWithChapters(mixedRoot, '自动推荐-分类连载', ['第01话'], { parents: ['分类层'] })
  await createMangaWithVolumes(mixedRoot, '自动推荐-复杂嵌套', [
    { name: '第01卷', chapters: ['第01话'] },
  ])
  writeText(path.join(mixedRoot, 'notes.txt'), 'This file should be ignored by manga scanners.\n')

  const noiseRoot = path.join(BASE_PATH, '11-noise-and-ignore')
  writeText(
    path.join(noiseRoot, 'README.txt'),
    'Noise fixture: hidden folders, empty folders, and unsupported files.\n'
  )
  writeText(path.join(noiseRoot, 'unsupported.txt'), 'Not a manga.\n')
  mkdirp(path.join(noiseRoot, '空目录'))
  await createMangaWithChapters(noiseRoot, '正常漫画', ['第01话'])
  await createMangaWithChapters(noiseRoot, '隐藏漫画', ['第01话'], {
    parents: ['.hidden-category'],
  })

  writeReadme()
  formatReadme()
}

function formatReadme() {
  const prettierBin = process.platform === 'win32' ? 'npx.cmd' : 'npx'

  try {
    execFileSync(prettierBin, ['prettier', '--write', path.join(BASE_PATH, 'README.md')], {
      stdio: 'ignore',
      shell: process.platform === 'win32',
    })
  } catch {
    // Prettier is only used to keep the generated markdown tidy in this dev fixture.
  }
}

function writeReadme() {
  const rows = [
    ['01-manga-chapter-image', 'manga > chapter > image', '现有连载/双层漫画结构'],
    ['02-manga-image', 'manga > image', '现有单本漫画结构'],
    [
      '03-category-manga-chapter-image',
      'category > manga > chapter > image',
      '分类目录 + 连载漫画',
    ],
    ['04-category-manga-image', 'category > manga > image', '分类目录 + 单本漫画'],
    ['05-manga-volume-chapter-image', 'manga > volume > chapter > image', '复杂嵌套目录'],
    [
      '06-category-manga-volume-chapter-image',
      'category > manga > volume > chapter > image',
      '分类目录 + 复杂嵌套目录',
    ],
    ['07-smanga-metadata', '.smanga/info.json and *-smanga-info', 'SMANGA 自定义元数据'],
    ['08-series-json-metadata', 'series.json', '本地 series.json 元数据'],
    ['09-comicinfo-cbz', 'manga > chapter.cbz with ComicInfo.xml', '压缩章节和 ComicInfo 元数据'],
    ['10-auto-recommend-mixed', 'mixed', '自动推荐模板时的混合样本'],
    ['11-noise-and-ignore', 'noise', '隐藏目录、空目录、无效文件过滤'],
  ]

  const tableRows = rows
    .map(([dir, template, purpose]) => `| \`${dir}\` | \`${template}\` | ${purpose} |`)
    .join('\n')

  writeText(
    path.join(BASE_PATH, 'README.md'),
    `# test-manga-data

此目录由 \`node generate-test-manga.mjs\` 生成，用来测试扫描模板、预扫描、自动推荐和本地元数据识别。

根目录:

\`\`\`
${BASE_PATH}
\`\`\`

## Fixture 列表

| 目录 | 模板/格式 | 用途 |
| --- | --- | --- |
${tableRows}

## 使用建议

- 测试旧逻辑时，可以分别把媒体库路径指向某一个顶层 fixture 目录。
- 测试自动推荐时，优先使用 \`10-auto-recommend-mixed\`，它故意混合了简单结构、分类结构和复杂嵌套结构。
- 测试 SMANGA 元数据时，使用 \`07-smanga-metadata\`；其中包含漫画目录内的 \`.smanga/info.json\`，也包含旁挂的 \`*-smanga-info\`。
- 测试 ComicInfo 时，使用 \`09-comicinfo-cbz\`；章节 cbz 内包含 \`ComicInfo.xml\`。

## 重新生成

\`\`\`bash
cd ${__dirname}
node generate-test-manga.mjs
\`\`\`

生成结果是确定性的，重新运行会先清空并重建 \`test-manga-data\`。
`
  )
}

await generateFixtures()

console.log('Generated test manga data.')
console.log(`Path: ${BASE_PATH}`)
console.log(`Directories: ${stats.directories}`)
console.log(`Images: ${stats.images}`)
console.log(`JSON files: ${stats.json}`)
console.log(`Archives: ${stats.archives}`)
