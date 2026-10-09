/**
 * Umami 相关的错误。message 都是写给人看的中文，不带请求地址、共享编号、令牌、网站编号。
 */

/** 共享链接失效：取令牌这一步被拒（401、403、404）。数据接口的 401、403 不算，那要先重取令牌 */
export class UmamiAuthenticationError extends Error {
  constructor() {
    super("Umami 共享链接打不开了（可能被关掉或换了）");
    this.name = "UmamiAuthenticationError";
  }
}

/** 其余失败：格式不对、超时、被限流、被拒绝、返回的内容读不懂…… */
export class UmamiRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UmamiRequestError";
  }
}

/** 共享链接的写法不对（不是 https、路径里没有 /share/<编号>） */
export class UmamiShareUrlError extends UmamiRequestError {
  constructor() {
    super("Umami 共享链接的格式不对");
    this.name = "UmamiShareUrlError";
  }
}

/** 拿到的数前后对不上（累计是负数、按日期下降）：整次不入库，免得写进错的数 */
export class UmamiInconsistentError extends UmamiRequestError {
  constructor() {
    super("Umami 的数前后对不上，这次没入库");
    this.name = "UmamiInconsistentError";
  }
}
