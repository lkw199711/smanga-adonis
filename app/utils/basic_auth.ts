/*
 * HTTP Basic Auth 解析与用户校验
 *
 * 用于 OPDS 接口对接第三方阅读器 (可达漫画 / Panels / Chunky 等),
 * 它们普遍只支持 Basic Auth, 不支持现有 token header 鉴权.
 *
 * 校验流程: 解析 Authorization 头 -> md5(密码) 与 user 表对比 -> 返回用户对象.
 */

import prisma from '#start/prisma'
import md5 from './md5.js'

export interface BasicAuthCredentials {
  username: string
  password: string
}

/**
 * 从 Authorization 头解析 Basic Auth 凭据.
 * @returns 解析失败返回 null
 */
export function parse_basic_auth(authHeader: string | undefined | null): BasicAuthCredentials | null {
  if (!authHeader) return null
  const match = /^\s*Basic\s+([A-Za-z0-9+/=]+)\s*$/i.exec(authHeader)
  if (!match) return null

  let decoded: string
  try {
    decoded = Buffer.from(match[1], 'base64').toString('utf-8')
  } catch {
    return null
  }

  const idx = decoded.indexOf(':')
  if (idx < 0) return null
  return {
    username: decoded.slice(0, idx),
    password: decoded.slice(idx + 1),
  }
}

/**
 * 用 Basic Auth 凭据校验用户, 复用 user 表的 md5 密码字段.
 * @returns 校验通过返回 user(含权限), 失败返回 null
 */
export async function authenticate_basic(
  cred: BasicAuthCredentials | null
): Promise<any | null> {
  if (!cred) return null
  if (!cred.username || !cred.password) return null

  const user: any = await prisma.user.findUnique({
    where: { userName: cred.username },
    include: { mediaPermissons: true, userPermissons: true },
  })
  if (!user) return null
  if (user.passWord !== md5(cred.password)) return null

  // 与 auth_middleware 保持一致, 注入便于鉴权使用的字段
  user.mediaLimit = (user.mediaPermissons || []).map((item: any) => item.mediaId)
  user.moduleLimit = (user.userPermissons || []).map((item: any) => item.module)
  return user
}

/** 给 401 响应统一加上 WWW-Authenticate 头 */
export const BASIC_REALM = 'smanga-opds'