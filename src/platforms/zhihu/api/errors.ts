/**
 * 知乎开放平台相关的错误。message 都是写给人看的中文，不带密钥和请求地址里的敏感参数。
 */

/** 密钥不对或已过期（Code 20001）：拿数据的用例据此把 access-secret 标成过期 */
export class ZhihuAuthenticationError extends Error {
  constructor() {
    super("知乎开放平台密钥不对或已过期");
    this.name = "ZhihuAuthenticationError";
  }
}

/** 其余接口错误：参数、内容不可用、额度、风控、服务内部错误……code 是接口返回的 Code */
export class ZhihuApiError extends Error {
  constructor(
    message: string,
    readonly code?: number,
  ) {
    super(message);
    this.name = "ZhihuApiError";
  }
}

/** 拿到的数前后对不上（往回减出负数、按日期下降）：整次不入库，免得写进错的数 */
export class ZhihuInconsistentError extends ZhihuApiError {
  constructor() {
    super("知乎的数前后对不上，这次没入库");
    this.name = "ZhihuInconsistentError";
  }
}
