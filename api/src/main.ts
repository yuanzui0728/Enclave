// main.ts — 旧 LPP（每用户单进程）world 入口已于 Phase 8w 彻底退役。
//
// world 运行时现在只剩两种形态：
//   - 共享多租户 world：main-shared-world.ts（MAIN_MODE=shared-world，:4100，单进程服务全部用户）
//   - wiki 站点：main-wiki.ts（MAIN_MODE=wiki，:3500，独立库）
//
// cloud-api 不再为任何 phone spawn 每用户 LPP 子进程：路由全量走 shared:4100、新注册经
// ensureOwnerForPhone 首触建租户，compute provider 默认 mock + local-process provider 已中性化。
//
// 此文件仅作墓碑保留（nest entryFile / package.json start:prod / 历史 spawn 路径仍指向它）：
// 直接拒绝启动，杜绝误起一个无租户隔离的单库 world 把数据写进错误的库。
// i18n-ignore-start: operator-facing process bootstrap, not user UI.
console.error(
  '[LPP retired] api/dist/main.js 这个旧的每用户 world 入口已退役（Phase 8w）。\n' +
    '  - 共享 world 用：node dist/main-shared-world.js（MAIN_MODE=shared-world）\n' +
    '  - wiki 用：node dist/main-wiki.js（MAIN_MODE=wiki）',
);
process.exit(1);
// i18n-ignore-end
