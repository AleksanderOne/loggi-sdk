import { getConfig, isLoggiInitialized } from '../config';
import { _internalLog } from '../logger';
import { getRequestId } from '../next/request-context';

/**
 * Oryginalny fetch
 */
let originalFetch: typeof fetch | null = null;

/**
 * Czy fetch jest już przechwycony
 */
let isCaptured = false;

// Typy dla fetch - kompatybilne z Node.js i przeglądarką
type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

/**
 * Wyciągnij URL z input fetch
 */
function extractUrl(input: FetchInput): string {
    if (typeof input === 'string') return input;
    if (input instanceof URL) return input.toString();
    if (typeof input === 'object' && 'url' in input) return (input as { url: string }).url;
    return String(input);
}

/**
 * Przechwytuj fetch()
 */
export function captureFetch(): void {
    if (isCaptured) return;
    if (typeof globalThis.fetch !== 'function') return;

    isCaptured = true;
    originalFetch = globalThis.fetch;

    globalThis.fetch = async (input: FetchInput, init?: FetchInit): Promise<Response> => {
        const url = extractUrl(input);
        const method = init?.method || 'GET';

        // Ignoruj requesty do Loggi-App (anty-pętla)
        if (url.includes('/api/logs/collect') || url.includes('/api/logs/stream')) {
            return originalFetch!(input, init);
        }

        const start = Date.now();
        const requestId = getRequestId();

        try {
            const response = await originalFetch!(input, init);

            // Loguj tylko jeśli SDK jest zainicjalizowane
            if (isLoggiInitialized()) {
                _internalLog('info', 'fetch', `${method} ${url}`, {
                    requestUrl: url,
                    requestMethod: method,
                    requestStatus: response.status,
                    requestDurationMs: Date.now() - start,
                    requestId,
                });
            }

            return response;
        } catch (error) {
            // Loguj błąd
            if (isLoggiInitialized()) {
                _internalLog('error', 'fetch', `${method} ${url} FAILED`, {
                    requestUrl: url,
                    requestMethod: method,
                    error: error instanceof Error ? error.message : String(error),
                    requestDurationMs: Date.now() - start,
                    requestId,
                });
            }
            throw error;
        }
    };
}

/**
 * Przywróć oryginalny fetch (do testów)
 */
export function restoreFetch(): void {
    if (!isCaptured || !originalFetch) return;

    globalThis.fetch = originalFetch;
    originalFetch = null;
    isCaptured = false;
}
