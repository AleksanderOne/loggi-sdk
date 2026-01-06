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
import { captureUnhandled } from './integrations/unhandled';

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
 * Auto-wykrywanie projectSlug z package.json
 */
function autoDetectProjectSlug(): string {
    try {
        // Próbuj wczytać package.json z bieżącego katalogu
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pkg = require(process.cwd() + '/package.json');
        if (pkg.name) {
            // Usuń scope (@org/name -> name)
            return pkg.name.replace(/^@[^/]+\//, '');
        }
    } catch {
        // Ignoruj błędy - użyj fallback
    }
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
        captureUnhandled();
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
