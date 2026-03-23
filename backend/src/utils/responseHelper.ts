import { Response } from 'express';

export function success(res: Response, data: unknown, message = 'Success', statusCode = 200) {
  return res.status(statusCode).json({ success: true, message, data });
}

export function created(res: Response, data: unknown, message = 'Created successfully') {
  return res.status(201).json({ success: true, message, data });
}

export function paginated(
  res: Response,
  data: unknown[],
  total: number,
  page: number,
  limit: number,
  message = 'Success'
) {
  return res.status(200).json({
    success: true,
    message,
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
  });
}

export function error(res: Response, message: string, statusCode = 500, details?: unknown) {
  return res.status(statusCode).json({ success: false, message, details });
}

export function notFound(res: Response, message = 'Resource not found') {
  return res.status(404).json({ success: false, message });
}

export function forbidden(res: Response, message = 'Access denied') {
  return res.status(403).json({ success: false, message });
}

export function unauthorized(res: Response, message = 'Unauthorized') {
  return res.status(401).json({ success: false, message });
}

export function badRequest(res: Response, message: string, details?: unknown) {
  return res.status(400).json({ success: false, message, details });
}
