import { get_config } from '#utils/index'
import type {
  MetadataProfileConfig,
  MetadataProfileKey,
  MetadataSource,
  ScanEngine,
  ScanTemplateConfig,
  ScanTemplateRuleConfig,
} from './scan_types.js'

const MAX_CONFIG_LENGTH = 64 * 1024
const MAX_RULES = 20
const MAX_DEPTH = 8
const DEFAULT_METADATA_FILE_BYTES = 1024 * 1024
const METADATA_SOURCES: MetadataSource[] = ['smanga', 'series-json', 'comicinfo']

export class ScanConfigError extends Error {
  constructor(
    message: string,
    readonly fieldPath: string
  ) {
    super(`${fieldPath}: ${message}`)
    this.name = 'ScanConfigError'
  }
}

function parseObject(raw: string, fieldPath: string): Record<string, unknown> {
  if (raw.length > MAX_CONFIG_LENGTH) {
    throw new ScanConfigError(`配置不能超过 ${MAX_CONFIG_LENGTH} 字节`, fieldPath)
  }

  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw new ScanConfigError(
      `不是有效 JSON${error instanceof Error ? `（${error.message}）` : ''}`,
      fieldPath
    )
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ScanConfigError('必须是 JSON 对象', fieldPath)
  }
  return value as Record<string, unknown>
}

function optionalRegex(value: unknown, fieldPath: string) {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string') throw new ScanConfigError('必须是字符串', fieldPath)
  try {
    new RegExp(value)
  } catch (error) {
    throw new ScanConfigError(
      `不是有效正则表达式${error instanceof Error ? `（${error.message}）` : ''}`,
      fieldPath
    )
  }
  return value
}

function integer(value: unknown, fieldPath: string, min: number, max: number) {
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) {
    throw new ScanConfigError(`必须是 ${min} 到 ${max} 之间的整数`, fieldPath)
  }
  return Number(value)
}

function parseRule(value: unknown, index: number): ScanTemplateRuleConfig {
  const prefix = `scanTemplateConfig.rules[${index}]`
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ScanConfigError('必须是对象', prefix)
  }
  const rule = value as Record<string, unknown>
  const id = typeof rule.id === 'string' ? rule.id.trim() : ''
  if (!id || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) {
    throw new ScanConfigError('只能包含字母、数字、下划线和短横线，且长度不超过 64', `${prefix}.id`)
  }

  const label = typeof rule.label === 'string' && rule.label.trim() ? rule.label.trim() : id
  const mangaIndex = integer(rule.mangaIndex, `${prefix}.mangaIndex`, 0, MAX_DEPTH)
  const singleChapter = rule.singleChapter === true
  const chapterIndex = singleChapter
    ? null
    : integer(rule.chapterIndex, `${prefix}.chapterIndex`, mangaIndex + 1, MAX_DEPTH + 1)

  return {
    id,
    label,
    priority:
      rule.priority === undefined
        ? 100 - index
        : integer(rule.priority, `${prefix}.priority`, 0, 10000),
    mangaIndex,
    chapterIndex,
    singleChapter,
    directoryInclude: optionalRegex(rule.directoryInclude, `${prefix}.directoryInclude`),
    directoryExclude: optionalRegex(rule.directoryExclude, `${prefix}.directoryExclude`),
  }
}

export function parseScanTemplateConfig(raw?: string | null): ScanTemplateConfig | null {
  if (!raw?.trim()) return null
  const value = parseObject(raw, 'scanTemplateConfig')
  if (value.version !== 1)
    throw new ScanConfigError('仅支持 version=1', 'scanTemplateConfig.version')
  if (value.strategy !== 'single' && value.strategy !== 'mixed') {
    throw new ScanConfigError('必须是 single 或 mixed', 'scanTemplateConfig.strategy')
  }
  if (!Array.isArray(value.rules) || value.rules.length === 0 || value.rules.length > MAX_RULES) {
    throw new ScanConfigError(`必须包含 1 到 ${MAX_RULES} 条规则`, 'scanTemplateConfig.rules')
  }

  const rules = value.rules.map(parseRule)
  if (new Set(rules.map((rule) => rule.id)).size !== rules.length) {
    throw new ScanConfigError('规则 id 不能重复', 'scanTemplateConfig.rules')
  }
  return { version: 1, strategy: value.strategy, rules }
}

function metadataSources(value: unknown, fieldPath: string, allowEmpty = true): MetadataSource[] {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) {
    throw new ScanConfigError(allowEmpty ? '必须是数组' : '不能为空', fieldPath)
  }
  const sources = value.map((source, index) => {
    if (!METADATA_SOURCES.includes(source as MetadataSource)) {
      throw new ScanConfigError('包含不支持的元数据源', `${fieldPath}[${index}]`)
    }
    return source as MetadataSource
  })
  if (new Set(sources).size !== sources.length)
    throw new ScanConfigError('不能包含重复项', fieldPath)
  return sources
}

export function defaultMetadataProfileConfig(
  profile: MetadataProfileKey = 'auto'
): MetadataProfileConfig {
  const sources =
    profile === 'none'
      ? []
      : profile === 'auto'
        ? [...METADATA_SOURCES]
        : [profile as MetadataSource]
  return {
    version: 1,
    sources,
    precedence: [...sources],
    overwriteExisting: true,
    maxFileBytes: DEFAULT_METADATA_FILE_BYTES,
  }
}

export function parseMetadataProfileConfig(
  raw?: string | null,
  profile: MetadataProfileKey = 'auto'
): MetadataProfileConfig {
  if (!raw?.trim()) return defaultMetadataProfileConfig(profile)
  const value = parseObject(raw, 'metadataProfileConfig')
  if (value.version !== 1)
    throw new ScanConfigError('仅支持 version=1', 'metadataProfileConfig.version')
  const sources = metadataSources(value.sources, 'metadataProfileConfig.sources')
  const precedence = metadataSources(value.precedence, 'metadataProfileConfig.precedence')
  if (precedence.some((source) => !sources.includes(source))) {
    throw new ScanConfigError('只能包含 sources 中已启用的来源', 'metadataProfileConfig.precedence')
  }

  return {
    version: 1,
    sources,
    precedence,
    overwriteExisting: value.overwriteExisting === true,
    maxFileBytes:
      value.maxFileBytes === undefined
        ? DEFAULT_METADATA_FILE_BYTES
        : integer(value.maxFileBytes, 'metadataProfileConfig.maxFileBytes', 1024, 10 * 1024 * 1024),
  }
}

export function normalizeScanConfigJson(
  value: string | null | undefined,
  kind: 'template' | 'metadata'
) {
  if (!value?.trim()) return value
  return JSON.stringify(
    kind === 'template' ? parseScanTemplateConfig(value) : parseMetadataProfileConfig(value)
  )
}

export function resolveScanEngine(): ScanEngine {
  const configured = get_config()?.scan?.engine
  if (configured === 'legacy' || configured === 'template-v1' || configured === 'template-v2')
    return configured
  return 'template-v2'
}
