import { LogEntry, LogEnvironment } from './types';
import { getConfig, isLoggiInitialized } from './config';

/**
 * Kolejka logów do wysłania
 */
let queue: LogEntry[] = [];

/**
 * Timer do automatycznego flush
 */
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Czy trwa shutdown
 */
let isShuttingDown = false;

/**
 * Czy jesteśmy w trybie offline (po nieudanych próbach)
 */
let isOffline = false;

/**
 * Licznik kolejnych błędów połączenia
 */
let consecutiveFailures = 0;

/**
 * Max błędów przed przejściem w tryb offline
 */
const MAX_FAILURES_BEFORE_OFFLINE = 3;

/**
 * Dodaj log do kolejki
 */
export function enqueue(entry: LogEntry): void {
    if (isShuttingDown) return;
    if (!isLoggiInitialized()) {
        // SDK nie zainicjalizowane - pomiń
        return;
    }

    const config = getConfig();

    // Offline mode - nie kolejkuj, logi już pokazane w konsoli
    if (config.offlineMode || isOffline) {
        return;
    }

    queue.push(entry);
    scheduleFlush();
}

/**
 * Zaplanuj flush kolejki
 */
function scheduleFlush(): void {
    const config = getConfig();

    if (config.offlineMode || isOffline) {
        return;
    }

    if (queue.length >= config.batchSize) {
        // Batch pełny - wyślij od razu
        flush();
    } else if (!flushTimer) {
        // Zaplanuj flush po timeout
        flushTimer = setTimeout(() => {
            flushTimer = null;
            flush();
        }, config.batchTimeoutMs);
    }
}

/**
 * Wyślij logi do Loggi-App
 */
export async function flush(): Promise<void> {
    if (queue.length === 0) return;
    if (!isLoggiInitialized()) return;

    const config = getConfig();

    // Offline mode - wyczyść kolejkę (logi już były w konsoli)
    if (config.offlineMode || isOffline) {
        queue = [];
        return;
    }

    const batch = queue.splice(0, config.batchSize);

    // Wyczyść timer
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    try {
        // Endpoint bez /api/logs/collect - dodajemy tutaj
        const endpoint = config.endpoint.includes('/api/logs/collect')
            ? config.endpoint
            : config.endpoint + '/api/logs/collect';

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': config.apiKey,
            },
            body: JSON.stringify({
                logs: batch,
                projectSlug: config.projectSlug,
                environment: config.environment as LogEnvironment,
            }),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Reset failure counter na sukces
        consecutiveFailures = 0;

        if (config.debug) {
            console.log(`[LOGGI] Sent ${batch.length} logs`);
        }
    } catch (error) {
        consecutiveFailures++;

        // Graceful degradation - po MAX_FAILURES przejdź w tryb offline
        if (consecutiveFailures >= MAX_FAILURES_BEFORE_OFFLINE) {
            isOffline = true;
            // Wyczyść kolejkę - logi już były w konsoli (jeśli debug mode)
            queue = [];

            if (config.debug) {
                console.warn(`[LOGGI] Loggi-app unavailable after ${consecutiveFailures} failures. Switching to console-only mode.`);
            }
        } else if (config.debug) {
            console.warn(`[LOGGI] Failed to send logs (attempt ${consecutiveFailures}/${MAX_FAILURES_BEFORE_OFFLINE}):`, error);
        }
        // NIE retry - graceful degradation, odpuszczamy logi
    }

    // Jeśli zostało coś w kolejce i nie jesteśmy offline, zaplanuj kolejny flush
    if (queue.length > 0 && !isOffline) {
        scheduleFlush();
    }
}

/**
 * Sprawdź czy transport jest w trybie offline
 */
export function isTransportOffline(): boolean {
    return isOffline;
}

/**
 * Resetuj tryb offline (np. po ponownym połączeniu)
 */
export function resetOfflineMode(): void {
    isOffline = false;
    consecutiveFailures = 0;
}

/**
 * Graceful shutdown - wyślij pozostałe logi przed zamknięciem
 */
async function gracefulShutdown(signal: string): Promise<void> {
    if (isShuttingDown) return;
    if (!isLoggiInitialized()) return; // SDK nie zainicjalizowane - nic do zrobienia
    isShuttingDown = true;

    const config = getConfig();
    if (config.debug) {
        console.log(`[LOGGI] Received ${signal}, flushing remaining logs...`);
    }

    // Wyczyść timer
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }

    // Wyślij wszystko co zostało (jeśli nie jesteśmy offline)
    if (!config.offlineMode && !isOffline && queue.length > 0) {
        await flush();
    }

    if (config.debug) {
        console.log('[LOGGI] Shutdown complete');
    }
}

// Rejestruj handlery shutdown
if (typeof process !== 'undefined') {
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('beforeExit', () => gracefulShutdown('beforeExit'));
}
