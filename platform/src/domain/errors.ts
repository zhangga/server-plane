export type ErrorCode =
  | 'ENV_NOT_FOUND'
  | 'ENV_NAME_TAKEN'
  | 'INVALID_IMAGE_TAG'
  | 'INVALID_LOG_SERVICE'
  | 'INVALID_LOG_TAIL'
  | 'INVALID_NAME'
  | 'INVALID_STATE_TRANSITION'
  | 'NO_SLOT_AVAILABLE'
  | 'TASK_NOT_FOUND'
  | 'TASK_RUNNING'
  | 'INTERNAL_ERROR';

export type ErrorStatus = 400 | 404 | 409 | 500;

const STATUS_BY_CODE: Record<ErrorCode, ErrorStatus> = {
  ENV_NOT_FOUND: 404,
  ENV_NAME_TAKEN: 409,
  INVALID_IMAGE_TAG: 400,
  INVALID_LOG_SERVICE: 400,
  INVALID_LOG_TAIL: 400,
  INVALID_NAME: 400,
  INVALID_STATE_TRANSITION: 409,
  NO_SLOT_AVAILABLE: 409,
  TASK_NOT_FOUND: 404,
  TASK_RUNNING: 409,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly status: ErrorStatus;

  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
  }
}

export function toErrorResponse(
  err: unknown,
): { status: ErrorStatus; body: { error: { code: ErrorCode; message: string } } } {
  if (err instanceof AppError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
        },
      },
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: err instanceof Error ? err.message : 'Internal server error',
      },
    },
  };
}
