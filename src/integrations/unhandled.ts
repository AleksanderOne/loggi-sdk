import { isLoggiInitialized } from '../config';
import { _internalLog } from '../logger';
import { getRequestId } from '../next/request-context';

/**
 * Czy handlery są już zarejestrowane
 */
let isRegistered = false;

/**
 * Rejestruje handlery dla nieobsłużonych błędów i odrzuconych Promise'ów
 */
export function captureUnhandled(): void {
    if (isRegistered) return;
    if (typeof process === 'undefined') return; // Browser environment

    isRegistered = true;

    // Uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
        if (isLoggiInitialized()) {
            _internalLog('fatal', 'error', `Uncaught Exception: ${error.message}`, {
                error: error.message,
                stack: error.stack,
                requestId: getRequestId(),
            });
        }
        // Re-throw aby Node.js zakończył proces (domyślne zachowanie)
        // W produkcji PM2/Docker powinien zrestartować proces
    });

    // Unhandled promise rejections
    process.on('unhandledRejection', (reason: unknown) => {
        if (isLoggiInitialized()) {
            const message = reason instanceof Error ? reason.message : String(reason);
            const stack = reason instanceof Error ? reason.stack : undefined;

            _internalLog('error', 'error', `Unhandled Promise Rejection: ${message}`, {
                error: message,
                stack,
                requestId: getRequestId(),
            });
        }
    });
}
