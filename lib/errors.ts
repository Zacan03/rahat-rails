export class AppError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 409 | 422 | 503,
    public readonly code: string,
  ) {
    super(code);
    this.name = "AppError";
  }
}
