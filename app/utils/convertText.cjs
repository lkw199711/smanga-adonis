/*
 * @Author: 梁楷文 lkw199711@163.com
 * @Date: 2024-07-29 18:53:49
 * @LastEditors: 梁楷文 lkw199711@163.com
 * @LastEditTime: 2024-07-30 09:48:00
 * @FilePath: \smanga-adonis\app\utils\convertText.cjs
 */
S = require("simplebig");
// console.log(S.t2s("東加拿大"));//东加拿大
// console.log(S.t2s("太古遺產"));//太古遗产
// console.log(S.s2t("繁体中文"));//繁體中文
/*
//bind functions to String.prototype
S.attach();
console.log("香港動漫".t2s());//香港动漫
console.log("夜莺工作室".s2t());//夜鶯工作室
*/

module.exports = {
  S,
}
