export { g as getRequestId, r as runWithRequestId } from '../request-context-D8h090cW.js';
import { NextRequest, NextResponse } from 'next/server';

type NextRouteHandler = (request: NextRequest, context?: {
    params?: Record<string, string | string[]>;
}) => Promise<NextResponse> | NextResponse;
/**
 * Higher-Order Function opakowująca route handlery Next.js
 * Dodaje requestId do kontekstu i loguje request/response
 */
declare function withLogging(handler: NextRouteHandler): NextRouteHandler;
/**
 * Middleware do logowania wszystkich requestów (dla next.config.js middleware)
 * Użycie: export default loggingMiddleware;
 */
declare function createLoggingMiddleware(): (request: NextRequest) => Promise<NextResponse<unknown>>;

export { createLoggingMiddleware, withLogging };
