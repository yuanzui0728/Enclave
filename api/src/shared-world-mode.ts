// 共享 world 进程的「模式开关」副作用模块。
//
// 必须作为 main-shared-world.ts 的**第一个** import：在任何实体文件被求值之前把
// MAIN_MODE 设成 shared-world。实体的 applyOwnerIdColumn（tenant-entity.ts）在 import
// 期就读 isSharedWorldMode() 决定是否把 ownerId 设为复合主键的一部分；而 nodenext/ESM
// 下所有 import 的求值早于模块体里的赋值语句，所以这一行不能写在 main-shared-world.ts
// 的函数体/模块体里（那样会晚于 AppModule → 实体的求值，主键形状就定错成单 id 了）。
//
// 启动命令通常已经在环境里带了 MAIN_MODE=shared-world（见跑法文档）；这个模块是兜底，
// 保证即使忘了带环境变量，import 期也能拿到正确模式。
process.env.MAIN_MODE = 'shared-world';
