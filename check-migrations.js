import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:./data/db/smanga.db'
    }
  }
});

async function main() {
  try {
    // 清空 tracker_node 及其关联表（成员关系/共享索引），便于重新自动注册
    const memberDel = await prisma.tracker_membership.deleteMany({});
    console.log('删除 tracker_membership:', memberDel.count);

    const shareDel = await prisma.tracker_share_index.deleteMany({});
    console.log('删除 tracker_share_index:', shareDel.count);

    const inviteDel = await prisma.tracker_invite.deleteMany({});
    console.log('删除 tracker_invite:', inviteDel.count);

    const groupDel = await prisma.tracker_group.deleteMany({});
    console.log('删除 tracker_group:', groupDel.count);

    const nodeDel = await prisma.tracker_node.deleteMany({});
    console.log('删除 tracker_node:', nodeDel.count);

    // 同时清空本地 p2p 缓存表
    await prisma.p2p_peer_cache.deleteMany({});
    await prisma.p2p_local_share.deleteMany({});
    await prisma.p2p_transfer.deleteMany({});
    await prisma.p2p_group.deleteMany({});
    console.log('已清空本地 p2p_* 缓存表');
  } catch (e) {
    console.error('清理失败:', e);
  } finally {
    await prisma.$disconnect();
  }
}

main();