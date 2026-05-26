// cloud-api 反代到共享 world 时注入的受信内部头：携带已在边缘 (CloudClientAuthGuard /
// ws-proxy JWT 校验) 验证过的用户 phone。world 只绑 loopback、公网经 cloud-api 终结，
// 故该头不可从外网伪造；cloud-api 转发前会先剥掉客户端自带的同名头再注入。
// cloud-api 侧有一份镜像常量 (apps/cloud-api/.../internal-identity.constants.ts)，两边须一致。
export const INTERNAL_USER_PHONE_HEADER = 'x-cloud-user-phone';
