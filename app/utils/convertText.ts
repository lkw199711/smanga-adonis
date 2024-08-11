/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-29 18:53:49
 * @LastEditors: lkw199711 lkw199711@163.com
 * @LastEditTime: 2024-08-10 12:14:43
 * @FilePath: \smanga-adonis\app\utils\convertText.cjs
 */
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
export const S = require("simplebig");
// (S.t2s("東加拿大"));//东加拿大
// (S.t2s("太古遺產"));//太古遗产
// (S.s2t("繁体中文"));//繁體中文
/*
//bind functions to String.prototype
S.attach();
("香港動漫".t2s());//香港动漫
("夜莺工作室".s2t());//夜鶯工作室
*/

