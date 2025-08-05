import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const CryptoJS = require('crypto-js');
const crypKey = 'smanga.lj32fai12'; // 16/32位密钥

// ECB模式加密
const encrypted = CryptoJS.AES.encrypt('明文', crypKey, {
    mode: CryptoJS.mode.ECB,
    padding: CryptoJS.pad.Pkcs7
}).toString();

// 解密
const decrypted = CryptoJS.AES.decrypt(encrypted, crypKey, {
    mode: CryptoJS.mode.ECB
}).toString(CryptoJS.enc.Utf8);

const uuidv4 = CryptoJS.randomUUID

export default { encrypted, decrypted, uuidv4 };