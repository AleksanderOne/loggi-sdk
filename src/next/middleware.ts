import { NextRequest, NextResponse } from 'next/server';
import { runWithRequestId, generateRequestId } from './request-context';
import { isLoggiInitialized } from '../config';
import { _internalLog } from '../logger';

type NextRouteHandler = (
    request: NextRequest,
    context?: { params?: Record<string, string | string[]> }
) => Promise<NextResponse> | NextResponse;

/**
 * Higher-Order Function opakowująca route handlery Next.js
 * Dodaje requestId do kontekstu i loguje request/response
 */
export function withLogging(handler: NextRouteHandler): NextRouteHandler {
    return async (request: NextRequest, context?: { params?: Record<string, string | string[]> }) => {
        const start = Date.now();
        const method = request.method;
        const url = request.nextUrl.pathname;
        const requestId = generateRequestId();

        return runWithRequestId(requestId, async () => {

            try {
                const response = await handler(request, context);

                // Loguj sukces
                if (isLoggiInitialized()) {
                    _internalLog('info', 'api', `${method} ${url}`, {
                        requestUrl: url,
                        requestMethod: method,
                        requestStatus: response.status,
                        requestDurationMs: Date.now() - start,
                        requestId,
                    });
                }

                // Dodaj requestId do response headers (przydatne do debugowania)
                if (requestId) {
                    response.headers.set('X-Request-Id', requestId);
                }

                return response;
            } catch (error) {
                // Loguj błąd
                if (isLoggiInitialized()) {
                    _internalLog('error', 'api', `${method} ${url} FAILED`, {
                        requestUrl: url,
                        requestMethod: method,
                        error: error instanceof Error ? error.message : String(error),
                        stack: error instanceof Error ? error.stack : undefined,
                        requestDurationMs: Date.now() - start,
                        requestId,
                    });
                }
                throw error;
            }
        });
    };
}

/**
 * Middleware do logowania wszystkich requestów (dla next.config.js middleware)
 * Użycie: export default loggingMiddleware;
 */
export function createLoggingMiddleware() {
    return async (request: NextRequest) => {
        const start = Date.now();
        const method = request.method;
        const url = request.nextUrl.pathname;

        // Generuj requestId
        const requestId = crypto.randomUUID();

        // Loguj request
        if (isLoggiInitialized()) {
            _internalLog('log', 'middleware', `${method} ${url}`, {
                requestUrl: url,
                requestMethod: method,
                requestId,
                userAgent: request.headers.get('user-agent') || undefined,
            });
        }

        // Kontynuuj do następnego middleware/route
        const response = NextResponse.next();

        // Dodaj requestId do headers
        response.headers.set('X-Request-Id', requestId);

        return response;
    };
}
