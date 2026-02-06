export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code: string
  ) {
    super(message);
  }
}

export function badRequest(code: string, message: string): never {
  throw new ApiError(400, message, code);
}

export function forbidden(code: string, message: string): never {
  throw new ApiError(403, message, code);
}

export function notFound(code: string, message: string): never {
  throw new ApiError(404, message, code);
}

export function conflict(code: string, message: string): never {
  throw new ApiError(409, message, code);
}

export function internal(code: string, message: string): never {
  throw new ApiError(500, message, code);
}
