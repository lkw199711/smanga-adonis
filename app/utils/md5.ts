import { createHash } from 'crypto'

/*
// 定义要加密的字符串
const data = 'q'

// 使用 crypto 模块创建 MD5 哈希
const hash = createHash('md5').update(data).digest('hex')
*/

export default function md5(str: string): string {
  return createHash('md5').update(str).digest('hex')
}
