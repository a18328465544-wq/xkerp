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

export function toDomainError(error: unknown) {
  if (error instanceof AppError) return error;
  if (!(error instanceof Error)) return new AppError("业务操作失败", 400, "DOMAIN_ERROR");
  if (/不存在|未找到|找不到/.test(error.message)) {
    return new AppError(error.message, 404, "NOT_FOUND");
  }
  if (/已存在|重复|冲突|不能|不足|已绑定|已关联|占用/.test(error.message)) {
    return new AppError(error.message, 409, "CONFLICT");
  }
  return new AppError(error.message, 400, "VALIDATION_ERROR");
}
