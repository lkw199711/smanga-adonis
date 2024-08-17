/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-08-06 11:05:56
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-08-17 14:38:37
 * @FilePath: \smanga-adonis\app\utils\md5.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
import { createHash } from 'crypto'

/*
// 定义要加密的字符串
const data = 'q'

// 使用 crypto 模块创建 MD5 哈希
const hash = createHash('md5').update(data).digest('hex')
*/

export default function md5(str: string = ''): string {
  return createHash('md5').update(str).digest('hex')
}
