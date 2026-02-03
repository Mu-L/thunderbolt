import type { Context, ErrorHandler } from 'elysia'
import { Elysia } from 'elysia'

export type ErrorResponse = {
  success: false
  data: null
  error: string
}

export const STATUS_MESSAGES: Record<number, string> = {
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  422: 'Unprocessable entity',
  429: 'Too many requests',
  500: 'An unexpected error occurred',
  502: 'Bad gateway',
  503: 'Service temporarily unavailable',
  504: 'Gateway timeout',
}

/**
 * Create a standardized error response object
 */
export const createErrorResponse = (message: string): ErrorResponse => ({
  success: false,
  data: null,
  error: message,
})

/**
 * Get a safe, generic error message for a given status code
 * SECURITY: Never returns internal error details - only predefined messages
 */
export const getSafeErrorMessage = (status: number): string => STATUS_MESSAGES[status] ?? 'An unexpected error occurred'

/**
 * Extract HTTP status code from an error, defaulting to 500
 */
export const getErrorStatus = (error: unknown, fallbackStatus: number = 500): number => {
  if (error instanceof Error && 'status' in error && typeof (error as any).status === 'number') {
    return (error as any).status
  }
  return fallbackStatus
}

/**
 * Global error handling middleware for Elysia
 * Provides consistent error responses and logging
 * Returns format: { success: false, data: null, error: string }
 */
export const createErrorHandlingMiddleware = () => {
  const errorHandler: ErrorHandler = (ctx) => {
    const { code, error, set, request } = ctx
    const log = (ctx as any).log

    switch (code) {
      case 'VALIDATION':
        set.status = 400
        log?.warn({ error: error.message }, 'Validation failed')
        return createErrorResponse(`Validation failed: ${error.message}`)

      case 'NOT_FOUND':
        set.status = 404
        log?.warn({ url: request.url }, 'Resource not found')
        return createErrorResponse('The requested resource was not found')

      default:
        return handleGenericError(error, set, log)
    }
  }

  return new Elysia({ name: 'error-handling' }).onError(errorHandler)
}

/**
 * Handle generic errors with appropriate status codes and logging
 * SECURITY: Never expose internal error details to clients - only validation errors pass through
 */
const handleGenericError = (error: unknown, set: Context['set'], log?: any): ErrorResponse => {
  const currentStatus = typeof set.status === 'number' ? set.status : 500
  const status = getErrorStatus(error, currentStatus)
  set.status = status

  if (error instanceof Error) {
    log?.error({ error: error.message, stack: error.stack }, `Request failed with status ${status}`)
  } else {
    log?.error({ error }, 'Non-Error exception thrown')
  }

  return createErrorResponse(getSafeErrorMessage(status))
}
