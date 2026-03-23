import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../config/logger';

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  logger.error(`${err.message}`, { stack: err.stack, url: req.url, method: req.method });

  if (err instanceof ZodError) {
    res.status(400).json({
      success: false,
      message: 'Validation error',
      details: err.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
    });
    return;
  }

  if (err.message?.includes('duplicate key')) {
    res.status(409).json({ success: false, message: 'Record already exists' });
    return;
  }

  if (err.message?.includes('gratuity')) {
    res.status(400).json({ success: false, message: err.message });
    return;
  }

  const status = (err as { status?: number }).status || 500;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}
