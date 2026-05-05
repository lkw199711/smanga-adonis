// 独立模拟节点自动注册流程，打印详细错误。
// 用法: cd smanga-adonis && node test-p2p-register.js

import fs from 'fs';
import path from 'path';
import os from 'os';
import axios from 'axios';

const cfgPath = path.resolve('./data/config/smanga.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
const p2p = cfg.p2p || {};

console.log('[cfg] enable      =', p2p.enable);
console.log('[cfg] role.node   =', p2p.role?.node);
console.log('[cfg] role.tracker=', p2p.role?.tracker);
console.log('[cfg] trackers    =', p2p.node?.trackers);
console.log('[cfg] nodeId      =', p2p.node?.nodeId || '(空)');
console.log('[cfg] nodeToken   =', p2p.node?.nodeToken ? '(已存在)' : '(空)');

const trackers = p2p.node?.trackers || [];
let url = trackers[0];
if (!url && p2p.role?.tracker) {
  url = p2p.tracker?.publicUrl || `http://127.0.0.1:${process.env.PORT || 9798}`;
}
console.log('[cfg] 选中 trackerUrl =', url);

if (!url) {
  console.error('未配置 trackers，退出');
  process.exit(1);
}

const payload = {
  nodeName: p2p.node?.nodeName || os.hostname() || 'smanga-node',
  version: 'smanga-adonis',
  localHost: p2p.node?.lanHost || undefined,
  localPort: p2p.node?.lanPort || p2p.node?.listenPort || undefined,
};
console.log('[req] payload =', payload);

try {
  const res = await axios.post(url.replace(/\/+$/, '') + '/tracker/node/register', payload, {
    timeout: 15000,
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
  });
  console.log('[ok ] status =', res.status);
  console.log('[ok ] data   =', JSON.stringify(res.data, null, 2));
} catch (e) {
  console.error('[err] message=', e?.message);
  console.error('[err] code   =', e?.code);
  console.error('[err] status =', e?.response?.status);
  console.error('[err] data   =', e?.response?.data);
}