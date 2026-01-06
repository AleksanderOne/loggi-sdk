/**
 * Loggi SDK - Server-side logging dla Next.js
 *
 * Użycie w instrumentation.ts:
 *
 * import { initLoggi } from 'loggi-sdk';
 *
 * export async function register() {
 *     initLoggi({
 *         apiKey: process.env.LOGGI_API_KEY!,
 *         projectSlug: 'my-app',
 *         environment: process.env.NODE_ENV as 'development' | 'production',
 *     });
 * }
 */

// Główne API
export { initLoggi, getConfig, isLoggiInitialized } from './config';
export { logger, _internalLog, createLogger, createLoggerSync, fetchSchema } from './logger';
export type { CategoryLogger, DynamicLogger } from './logger';
export { flush, isTransportOffline, resetOfflineMode, initTransport } from './transport';

// Nowe API - loggi (zalecane)
export { createLoggi, createLoggiSync } from './loggi';
export type { Loggi, CLACategories, AHACategories, FACategories } from './loggi';

// Typy
export type {
    LogLevel,
    LogCategory,
    LogEntry,
    LoggiConfig,
    LogSchema,
    CategorySchema,
} from './types';

// Integracje (do manualnego użycia)
export { captureConsole, restoreConsole, rawConsole } from './integrations/console';
export { captureFetch, restoreFetch } from './integrations/fetch';
// UWAGA: captureUnhandled NIE jest eksportowane z głównego entrypointa
// ponieważ używa process.on który nie działa w Edge Runtime.
// Jeśli potrzebujesz, użyj: import { captureUnhandled } from 'loggi-sdk/node';

// Next.js helpers (bez middleware - to wymaga import z 'loggi-sdk/next')
export { runWithRequestId, getRequestId } from './next/request-context';
// withLogging i createLoggingMiddleware dostępne przez: import { withLogging } from 'loggi-sdk/next'

// Utilities
export { sanitize, sanitizeMessage } from './utils/sanitize';
