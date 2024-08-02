/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-29 18:45:15
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-29 18:45:29
 * @FilePath: \smanga-adonis\type\node-opencc.d.ts
 * @Description: 这是默认设置,请设置`customMade`, 打开koroFileHeader查看配置 进行设置: https://github.com/OBKoro1/koro1FileHeader/wiki/%E9%85%8D%E7%BD%AE
 */
// types/node-opencc.d.ts
declare module 'node-opencc' {
  export default class OpenCC {
    constructor(config?: string)
    convertPromise(text: string): Promise<string>
  }
}
