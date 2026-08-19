export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "当前账号没有执行该操作的权限") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "请先登录系统") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/**
 * Compatibility boundary for legacy service code that still throws plain Error.
 * New domain code should throw one of the explicit errors above; this mapper is
 * intentionally conservative so unknown failures remain 500 and do not leak
 * implementation details to API clients.
 */
export function toDomainError(error: unknown) {
  if (error instanceof AppError) return error;
  if (!(error instanceof Error)) return new AppError("服务器处理失败，请稍后重试", 500, "SERVER_ERROR");

  const message = error.message;
  if (/账号或密码错误|账号已停用|会话无效|请先登录/.test(message)) {
    return new UnauthorizedError("账号或密码错误");
  }
  if (/没有.*权限|无权|仅老板|禁止执行/.test(message)) {
    return new ForbiddenError(message);
  }
  if (/不存在|未找到|找不到/.test(message)) return new NotFoundError(message);
  if (/已存在|重复|冲突|不足|已绑定|已关联|占用|不能删除|不能编辑|不能直接/.test(message)) {
    return new ConflictError(message);
  }
  if (/必须|不能为空|请选择|请输入|无效|不合法|仅支持|尚未|缺少|不能/.test(message)) {
    return new ValidationError(message);
  }
  // Unknown exceptions must not be presented as client validation failures or leak internal
  // messages. The error middleware logs the original exception with its request id.
  return new AppError("服务器处理失败，请稍后重试", 500, "SERVER_ERROR");
}
