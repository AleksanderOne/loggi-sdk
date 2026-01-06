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
 * Konfiguracja retry na starcie
 */
const STARTUP_RETRY_CONFIG = {
    maxRetries: 10,           // Max prób
    retryIntervalMs: 60000,   // Interwał między próbami (1 minuta)
};

/**
 * Czy trwa retry na starcie
 */
let isRetrying = false;

/**
 * Licznik prób retry na starcie
 */
let startupRetryCount = 0;

/**
 * Timer do retry
 */
let retryTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Czy połączenie zostało nawiązane (przynajmniej raz)
 */
let connectionEstablished = false;

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

    // Nie flush gdy trwa retry - logi będą wysłane po nawiązaniu połączenia
    if (isRetrying) {
        return;
    }

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
    connectionEstablished = false;
    startupRetryCount = 0;
    isRetrying = false;
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
}

/**
 * Sprawdź dostępność serwera loggi-app
 */
async function checkServerAvailability(): Promise<boolean> {
    if (!isLoggiInitialized()) return false;

    const config = getConfig();
    if (config.offlineMode) return false;

    try {
        const healthEndpoint = config.endpoint + '/api/health';
        const response = await fetch(healthEndpoint, {
            method: 'GET',
            signal: AbortSignal.timeout(5000), // 5s timeout
        });
        return response.ok;
    } catch {
        return false;
    }
}

/**
 * Uruchom retry loop - próbuje połączyć się z serwerem co minutę, max 10 razy
 */
async function startRetryLoop(): Promise<void> {
    if (isRetrying || connectionEstablished || isShuttingDown) return;
    if (!isLoggiInitialized()) return;

    const config = getConfig();
    if (config.offlineMode) return;

    isRetrying = true;
    startupRetryCount = 0;

    const attemptConnection = async () => {
        if (isShuttingDown || connectionEstablished) {
            isRetrying = false;
            return;
        }

        startupRetryCount++;

        if (config.debug) {
            console.log(`[LOGGI] Próba połączenia z serwerem logów (${startupRetryCount}/${STARTUP_RETRY_CONFIG.maxRetries})...`);
        }

        const available = await checkServerAvailability();

        if (available) {
            connectionEstablished = true;
            isRetrying = false;
            isOffline = false;
            consecutiveFailures = 0;

            if (config.debug) {
                console.log('[LOGGI] ✅ Połączono z serwerem logów');
            }

            // Wyślij zaległe logi
            if (queue.length > 0) {
                scheduleFlush();
            }
            return;
        }

        if (startupRetryCount >= STARTUP_RETRY_CONFIG.maxRetries) {
            // Wyczerpano próby - przejdź w tryb offline na stałe
            isRetrying = false;
            isOffline = true;
            queue = []; // Wyczyść kolejkę

            console.warn(
                `[LOGGI] ❌ Nie udało się połączyć z serwerem logów po ${STARTUP_RETRY_CONFIG.maxRetries} próbach. ` +
                `Przechodzę w tryb offline (tylko konsola).`
            );
            return;
        }

        // Zaplanuj następną próbę
        if (config.debug) {
            console.log(`[LOGGI] Serwer niedostępny. Następna próba za ${STARTUP_RETRY_CONFIG.retryIntervalMs / 1000}s...`);
        }

        retryTimer = setTimeout(attemptConnection, STARTUP_RETRY_CONFIG.retryIntervalMs);
    };

    // Pierwsza próba natychmiast
    await attemptConnection();
}

/**
 * Inicjalizuj transport - wywołaj po initLoggi()
 */
export async function initTransport(): Promise<void> {
    if (!isLoggiInitialized()) return;

    const config = getConfig();
    if (config.offlineMode) return;

    // Sprawdź czy serwer jest dostępny
    const available = await checkServerAvailability();

    if (available) {
        connectionEstablished = true;
        if (config.debug) {
            console.log('[LOGGI] ✅ Serwer logów dostępny');
        }
    } else {
        // Serwer niedostępny - uruchom retry loop w tle
        console.warn('[LOGGI] ⚠️ Serwer logów niedostępny. Uruchamiam retry w tle...');
        startRetryLoop();
    }
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

    // Wyczyść timery
    if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
    }
    isRetrying = false;

    // Wyślij wszystko co zostało (jeśli nie jesteśmy offline i mamy połączenie)
    if (!config.offlineMode && !isOffline && connectionEstablished && queue.length > 0) {
        await flush();
    }

    if (config.debug) {
        console.log('[LOGGI] Shutdown complete');
    }
}

// Rejestruj handlery shutdown (tylko w Node.js, nie w Edge Runtime)
// Edge Runtime ma `process` ale nie ma `process.on`
if (typeof process !== 'undefined' && typeof process.on === 'function') {
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('beforeExit', () => gracefulShutdown('beforeExit'));
}
