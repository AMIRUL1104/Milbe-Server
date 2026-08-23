export interface ApiErrorDetails {
  field?: string;
  message: string;
  code?: string;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly errors: ApiErrorDetails[];
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    errors: ApiErrorDetails[] = [],
    isOperational = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;

    Object.setPrototypeOf(this, ApiError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message: string, errors: ApiErrorDetails[] = []): ApiError {
    return new ApiError(message, 400, errors);
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError(message, 401);
  }

  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError(message, 403);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(message, 404);
  }

  static conflict(message = "Conflict"): ApiError {
    return new ApiError(message, 409);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(message, 500, [], false);
  }

  static validation(message = "Validation failed", errors: ApiErrorDetails[]): ApiError {
    return new ApiError(message, 422, errors);
  }
}

export const isApiError = (error: unknown): error is ApiError => {
  return error instanceof ApiError;
};