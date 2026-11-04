import type { ErrorRequestHandler, RequestHandler } from 'express';
import { MulterError } from 'multer';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export const notFound: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, 'not_found', `No route for ${req.method} ${req.path}`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  let status = 500;
  let body: ErrorBody = {
    error: {
      code: 'internal_error',
      message: 'Something went wrong while processing the request.',
    },
  };

  if (err instanceof HttpError) {
    status = err.status;
    body = { error: { code: err.code, message: err.message, details: err.details } };
  } else if (err instanceof MulterError) {
    status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    body = {
      error: {
        code: err.code === 'LIMIT_FILE_SIZE' ? 'file_too_large' : 'upload_error',
        message:
          err.code === 'LIMIT_FILE_SIZE'
            ? 'Together the two files must be 4 MB or smaller.'
            : `Upload rejected: ${err.message}.`,
      },
    };
  } else if (isBodyParserError(err)) {
    status = err.status;
    body = { error: { code: 'bad_request', message: err.message } };
  } else {
    console.error(err);
  }

  res.status(status).json(body);
};

function isBodyParserError(err: unknown): err is { status: number; message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'status' in err &&
    typeof err.status === 'number' &&
    err.status >= 400 &&
    err.status < 500 &&
    'message' in err &&
    typeof err.message === 'string'
  );
}
