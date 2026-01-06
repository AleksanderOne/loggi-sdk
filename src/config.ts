import {
    LoggiConfig,
    LogLevel,
    LogCategory,
    LogEnvironment,
    DEFAULT_PREFIX_MAP,
    DEFAULT_SENSITIVE_KEYS
} from './types';
import { captureConsole } from './integrations/console';
import { captureFetch } from './integrations/fetch';
// UWAGA: captureUnhandled importowane dynamicznie - używa process.on który nie działa w Edge Runtime

/**
 * Globalna konfiguracja SDK
 */
let globalConfig: Required<LoggiConfig> | null = null;

/**
 * Czy SDK zostało zainicjalizowane
 */
let isInitialized = false;

/**
 * Pobierz aktualną konfigurację
 */
export function getConfig(): Required<LoggiConfig> {
    if (!globalConfig) {
        throw new Error('[LOGGI] SDK not initialized. Call initLoggi() first.');
    }
    return globalConfig;
}

/**
 * Sprawdź czy SDK jest zainicjalizowane
 */
export function isLoggiInitialized(): boolean {
    return isInitialized;
}

/**
 * Auto-wykrywanie projectSlug
 * UWAGA: Usunięto auto-detekcję z package.json (niekompatybilna z Edge Runtime)
 * Użyj env LOGGI_PROJECT_SLUG lub przekaż w config
 */
function autoDetectProjectSlug(): string {
    // Bez auto-detekcji - Edge Runtime nie obsługuje process.cwd() i require()
    // projectSlug musi być ustawiony przez env lub config
    return 'unknown';
}

/**
 * Inicjalizacja SDK
 *
 * @example
 * // Minimalna konfiguracja (wszystko z env):
 * initLoggi();
 *
 * // Z jawnym API key:
 * initLoggi({ apiKey: 'pk_xxx' });
 *
 * // Pełna konfiguracja:
 * initLoggi({
 *   apiKey: 'pk_xxx',
 *   projectSlug: 'my-app',
 *   endpoint: 'https://loggi.example.com'
 * });
 */
export function initLoggi(config?: LoggiConfig): void {
    if (isInitialized) {
        console.warn('[LOGGI] SDK already initialized. Skipping re-initialization.');
        return;
    }

    const cfg = config || {};
    const isDev = process.env.NODE_ENV === 'development';
    const environment = (cfg.environment || process.env.NODE_ENV || 'development') as LogEnvironment;

    // Auto-wykrywanie projectSlug: config > env > package.json > 'unknown'
    const projectSlug = cfg.projectSlug
        || process.env.LOGGI_PROJECT_SLUG
        || autoDetectProjectSlug();

    // API key: config > env > brak (offline mode)
    const apiKey = cfg.apiKey || process.env.LOGGI_API_KEY || '';

    // Endpoint: config > env > default
    // NIE dodajemy /api/logs/collect tutaj - transport.ts sam to robi
    const endpoint = (cfg.endpoint || process.env.LOGGI_ENDPOINT || 'http://localhost:3003')
        .replace(/\/$/, ''); // Usuń trailing slash

    // Offline mode - gdy brak API key
    const offlineMode = !apiKey;

    globalConfig = {
        apiKey,
        endpoint,
        projectSlug,
        environment,
        captureConsole: cfg.captureConsole ?? true,
        captureFetch: cfg.captureFetch ?? true,
        captureUnhandled: cfg.captureUnhandled ?? true,
        batchSize: cfg.batchSize ?? 10,
        batchTimeoutMs: cfg.batchTimeoutMs ?? 5000,
        debug: cfg.debug ?? isDev,
        consoleInDev: cfg.consoleInDev ?? true,
        minLevel: cfg.minLevel ?? (isDev ? 'log' : 'info'),
        sensitiveKeys: cfg.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS,
        prefixMap: { ...DEFAULT_PREFIX_MAP, ...cfg.prefixMap },
        offlineMode,
    };

    // Auto-inicjalizacja integracji
    if (globalConfig.captureConsole) {
        captureConsole();
    }
    if (globalConfig.captureFetch) {
        captureFetch();
    }
    if (globalConfig.captureUnhandled) {
        // Dynamic import - captureUnhandled używa process.on który nie działa w Edge Runtime
        import('./integrations/unhandled').then(({ captureUnhandled }) => {
            captureUnhandled();
        }).catch(() => {
            // Edge Runtime - ignoruj błąd
        });
    }

    isInitialized = true;

    // Logowanie inicjalizacji
    if (offlineMode) {
        console.log('[LOGGI] SDK initialized in OFFLINE mode (no API key)', {
            projectSlug: globalConfig.projectSlug,
            environment: globalConfig.environment,
        });
    } else {
        if (globalConfig.debug) {
            console.log('[LOGGI] SDK initialized', {
                projectSlug: globalConfig.projectSlug,
                environment: globalConfig.environment,
                endpoint: globalConfig.endpoint,
                captureConsole: globalConfig.captureConsole,
                captureFetch: globalConfig.captureFetch,
                captureUnhandled: globalConfig.captureUnhandled,
            });
        }

        // Inicjalizuj transport z retry logic (w tle, nie blokuje)
        // Używamy dynamic import aby uniknąć cyklicznej zależności
        import('./transport').then(({ initTransport }) => {
            initTransport().catch(() => {
                // Błędy obsługiwane wewnętrznie przez initTransport
            });
        });
    }
}

/**
 * Reset SDK (głównie do testów)
 */
export function resetLoggi(): void {
    globalConfig = null;
    isInitialized = false;
}
