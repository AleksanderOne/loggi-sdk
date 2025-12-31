import { LogLevel, LogCategory, LogEntry, LogSchema, CategorySchema, LEVEL_PRIORITY } from './types';
import { getConfig, isLoggiInitialized } from './config';
import { enqueue } from './transport';
import { sanitize, sanitizeMessage } from './utils/sanitize';
import { getRequestId } from './next/request-context';

/**
 * Zapisz oryginalne console.log przed przechwyceniem
 * (używane przez printToConsole żeby uniknąć pętli)
 */
const _originalConsoleLog = console.log.bind(console);

/**
 * Formatowanie logów do konsoli
 */
const LEVEL_COLORS: Record<LogLevel, string> = {
    dev: '\x1b[35m',    // magenta - wyraźny dla dev
    log: '\x1b[90m',    // gray (dawny debug)
    info: '\x1b[36m',   // cyan
    warn: '\x1b[33m',   // yellow
    error: '\x1b[31m',  // red
    fatal: '\x1b[35m',  // magenta
};

const LEVEL_EMOJI: Record<LogLevel, string> = {
    dev: '🛠️',
    log: '🔍',
    info: '📋',
    warn: '⚠️',
    error: '❌',
    fatal: '💀',
};

// Bazowe emoji dla kategorii (fallback)
const CATEGORY_EMOJI: Record<string, string> = {
    auth: '🔐',
    api: '📡',
    security: '🛡️',
    db: '💾',
    middleware: '🔄',
    console: '📝',
    fetch: '🌐',
    error: '❌',
    custom: '📋',
    flow: '🔄',
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// Flaga do wyświetlania ostrzeżenia o deprecated debug() tylko raz
let _debugDeprecationWarningShown = false;

function warnDebugDeprecated(): void {
    if (!_debugDeprecationWarningShown) {
        console.warn('[LOGGI] ⚠️ Metoda .debug() jest deprecated. Użyj .log() zamiast tego.');
        _debugDeprecationWarningShown = true;
    }
}

/**
 * Cache schematu kategorii
 */
let _schemaCache: LogSchema | null = null;
let _categoryMap: Map<string, CategorySchema> = new Map();

/**
 * Wyświetl log w konsoli (tylko w dev mode)
 * Format: TIMESTAMP LEVEL_ICON LEVEL CATEGORY_ICON CATEGORY MESSAGE
 */
function printToConsole(entry: LogEntry): void {
    const levelColor = LEVEL_COLORS[entry.level];
    const levelEmoji = LEVEL_EMOJI[entry.level];
    const levelLabel = entry.level.toUpperCase().padEnd(5);

    // Pobierz info o kategorii z cache lub fallback
    const catInfo = _categoryMap.get(entry.category);
    const catEmoji = catInfo?.icon || CATEGORY_EMOJI[entry.category] || '📋';
    const catColor = catInfo?.ansiColor || '\x1b[37m';
    const catName = catInfo?.name || entry.category;

    // Timestamp: HH:MM:SS.mmm
    const now = new Date(entry.timestamp);
    const timestamp = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;

    // Format: TIMESTAMP LEVEL_ICON LEVEL CATEGORY_ICON CATEGORY(key) MESSAGE
    const categoryLabel = `${catName}(${entry.category})`.padEnd(20);

    const prefix = `${DIM}${timestamp}${RESET} ${levelEmoji} ${levelColor}${levelLabel}${RESET} ${catEmoji} ${catColor}${BOLD}${categoryLabel}${RESET}`;

    if (entry.data && Object.keys(entry.data).length > 0) {
        _originalConsoleLog(prefix, entry.message);
        // Formatuj dane
        const dataStr = Object.entries(entry.data)
            .filter(([, v]) => v !== undefined && v !== null && v !== '')
            .map(([k, v]) => {
                const formatted = typeof v === 'object' ? JSON.stringify(v) : String(v);
                return `${DIM}${k}${RESET}=${formatted.length > 60 ? formatted.slice(0, 57) + '...' : formatted}`;
            })
            .join(` ${DIM}│${RESET} `);
        if (dataStr) {
            _originalConsoleLog(`    ${DIM}└─${RESET} ${dataStr}`);
        }
    } else {
        _originalConsoleLog(prefix, entry.message);
    }
}

/**
 * Główna funkcja logowania
 */
function log(
    level: LogLevel,
    category: LogCategory,
    message: string,
    data?: Record<string, unknown>
): void {
    if (!isLoggiInitialized()) {
        // SDK nie zainicjalizowane - po prostu wyświetl w konsoli
        console.log(`[${level.toUpperCase()}] [${category}] ${message}`, data || '');
        return;
    }

    const config = getConfig();

    // Sprawdź minLevel
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.minLevel]) {
        return;
    }

    // Sanityzacja
    const sanitizedData = sanitize(data, config.sensitiveKeys);
    const sanitizedMessage = sanitizeMessage(message);

    const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level,
        category,
        source: 'server',
        message: sanitizedMessage,
        data: sanitizedData,
        requestId: getRequestId(),
        projectSlug: config.projectSlug,
        environment: config.environment,
    };

    // Dev mode - też do konsoli
    if (config.debug && config.consoleInDev) {
        printToConsole(entry);
    }

    // Wyślij do Loggi-App
    enqueue(entry);
}

/**
 * Tworzy logger dla konkretnej kategorii
 */
function createCategoryLogger(category: LogCategory) {
    const logMethod = (message: string, data?: Record<string, unknown>) => log('log', category, message, data);
    return {
        dev: (message: string, data?: Record<string, unknown>) => log('dev', category, message, data),
        log: logMethod,
        info: (message: string, data?: Record<string, unknown>) => log('info', category, message, data),
        warn: (message: string, data?: Record<string, unknown>) => log('warn', category, message, data),
        error: (message: string, data?: Record<string, unknown>) => log('error', category, message, data),
        fatal: (message: string, data?: Record<string, unknown>) => log('fatal', category, message, data),
        /** @deprecated Użyj .log() */
        debug: (message: string, data?: Record<string, unknown>) => {
            warnDebugDeprecated();
            logMethod(message, data);
        },
    };
}

const logMethodCustom = (message: string, data?: Record<string, unknown>) => log('log', 'custom', message, data);

/**
 * Główny obiekt loggera
 */
export const logger = {
    // Podstawowe metody (używają kategorii 'custom')
    dev: (message: string, data?: Record<string, unknown>) => log('dev', 'custom', message, data),
    log: logMethodCustom,
    info: (message: string, data?: Record<string, unknown>) => log('info', 'custom', message, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', 'custom', message, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', 'custom', message, data),
    fatal: (message: string, data?: Record<string, unknown>) => log('fatal', 'custom', message, data),
    /** @deprecated Użyj .log() */
    debug: (message: string, data?: Record<string, unknown>) => {
        warnDebugDeprecated();
        logMethodCustom(message, data);
    },

    // Loggery dla konkretnych kategorii
    auth: createCategoryLogger('auth'),
    api: createCategoryLogger('api'),
    security: createCategoryLogger('security'),
    db: createCategoryLogger('db'),
    middleware: createCategoryLogger('middleware'),
};

/**
 * Eksport wewnętrznej funkcji log (do użytku przez integracje)
 */
export { log as _internalLog };

// ═══════════════════════════════════════════════════════════════════════════════
// DYNAMICZNE LOGGERY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Typ dla dynamicznego loggera kategorii
 */
export type CategoryLogger = {
    dev: (message: string, data?: Record<string, unknown>) => void;
    log: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    fatal: (message: string, data?: Record<string, unknown>) => void;
    /** @deprecated Użyj .log() */
    debug: (message: string, data?: Record<string, unknown>) => void;
};

/**
 * Typ zwracany przez createLogger
 */
export type DynamicLogger<T extends string> = {
    [K in T]: CategoryLogger;
} & {
    // Podstawowe metody (domyślna kategoria 'custom')
    dev: (message: string, data?: Record<string, unknown>) => void;
    log: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    fatal: (message: string, data?: Record<string, unknown>) => void;
    /** @deprecated Użyj .log() */
    debug: (message: string, data?: Record<string, unknown>) => void;
    // Metadane
    _schema: LogSchema | null;
    _categories: string[];
};

/**
 * Pobierz schemat kategorii z API
 */
export async function fetchSchema(): Promise<LogSchema | null> {
    if (_schemaCache) return _schemaCache;

    if (!isLoggiInitialized()) {
        return null;
    }

    const config = getConfig();
    const schemaUrl = config.endpoint.replace('/api/logs/collect', `/api/log-schema/${config.projectSlug}`);

    try {
        const response = await fetch(schemaUrl, {
            headers: {
                'X-API-Key': config.apiKey,
            },
        });

        if (!response.ok) {
            if (config.debug) {
                console.warn(`[LOGGI] Failed to fetch schema: ${response.status}`);
            }
            return null;
        }

        const schema = await response.json() as LogSchema;
        _schemaCache = schema;

        // Buduj mapę kategorii
        for (const cat of schema.categories) {
            _categoryMap.set(cat.key, cat);
        }

        if (config.debug) {
            console.log(`[LOGGI] Schema loaded: ${schema.categories.length} categories`);
        }

        return schema;
    } catch (err) {
        if (config.debug) {
            console.warn('[LOGGI] Failed to fetch schema:', err);
        }
        return null;
    }
}

/**
 * Tworzy dynamiczny logger na podstawie schematu z API
 *
 * @example
 * // W instrumentation.ts lub na początku aplikacji:
 * const logger = await createLogger();
 *
 * // Użycie:
 * logger.auth.info('User logged in', { userId: '123' });
 * logger.payment.error('Transaction failed', { orderId: 'abc' });
 *
 * // Lub z określonymi kategoriami (type-safe):
 * const logger = await createLogger<'auth' | 'payment' | 'learning'>();
 * logger.learning.info('Card reviewed');
 */
export async function createLogger<T extends string = string>(): Promise<DynamicLogger<T>> {
    const schema = await fetchSchema();

    // Kategorie ze schematu lub fallback do bazowych
    const categoryKeys = schema?.categories.map(c => c.key) || ['auth', 'api', 'security', 'db', 'flow', 'custom'];

    const logMethodCustom = (message: string, data?: Record<string, unknown>) => log('log', 'custom', message, data);

    // Buduj obiekt loggera
    const dynamicLogger: Record<string, unknown> = {
        // Podstawowe metody
        dev: (message: string, data?: Record<string, unknown>) => log('dev', 'custom', message, data),
        log: logMethodCustom,
        info: (message: string, data?: Record<string, unknown>) => log('info', 'custom', message, data),
        warn: (message: string, data?: Record<string, unknown>) => log('warn', 'custom', message, data),
        error: (message: string, data?: Record<string, unknown>) => log('error', 'custom', message, data),
        fatal: (message: string, data?: Record<string, unknown>) => log('fatal', 'custom', message, data),
        debug: (message: string, data?: Record<string, unknown>) => {
            warnDebugDeprecated();
            logMethodCustom(message, data);
        },

        // Metadane
        _schema: schema,
        _categories: categoryKeys,
    };

    // Dodaj loggery dla każdej kategorii
    for (const key of categoryKeys) {
        const logMethodCat = (message: string, data?: Record<string, unknown>) => log('log', key as LogCategory, message, data);
        dynamicLogger[key] = {
            dev: (message: string, data?: Record<string, unknown>) => log('dev', key as LogCategory, message, data),
            log: logMethodCat,
            info: (message: string, data?: Record<string, unknown>) => log('info', key as LogCategory, message, data),
            warn: (message: string, data?: Record<string, unknown>) => log('warn', key as LogCategory, message, data),
            error: (message: string, data?: Record<string, unknown>) => log('error', key as LogCategory, message, data),
            fatal: (message: string, data?: Record<string, unknown>) => log('fatal', key as LogCategory, message, data),
            debug: (message: string, data?: Record<string, unknown>) => {
                warnDebugDeprecated();
                logMethodCat(message, data);
            },
        };
    }

    return dynamicLogger as DynamicLogger<T>;
}

/**
 * Wersja synchroniczna createLogger (bez pobierania schematu)
 * Używa cache jeśli schemat został już pobrany
 */
export function createLoggerSync<T extends string = string>(): DynamicLogger<T> {
    const categoryKeys = _schemaCache?.categories.map(c => c.key) || ['auth', 'api', 'security', 'db', 'flow', 'custom'];

    const logMethodCustom = (message: string, data?: Record<string, unknown>) => log('log', 'custom', message, data);

    const dynamicLogger: Record<string, unknown> = {
        dev: (message: string, data?: Record<string, unknown>) => log('dev', 'custom', message, data),
        log: logMethodCustom,
        info: (message: string, data?: Record<string, unknown>) => log('info', 'custom', message, data),
        warn: (message: string, data?: Record<string, unknown>) => log('warn', 'custom', message, data),
        error: (message: string, data?: Record<string, unknown>) => log('error', 'custom', message, data),
        fatal: (message: string, data?: Record<string, unknown>) => log('fatal', 'custom', message, data),
        debug: (message: string, data?: Record<string, unknown>) => {
            warnDebugDeprecated();
            logMethodCustom(message, data);
        },
        _schema: _schemaCache,
        _categories: categoryKeys,
    };

    for (const key of categoryKeys) {
        const logMethodCat = (message: string, data?: Record<string, unknown>) => log('log', key as LogCategory, message, data);
        dynamicLogger[key] = {
            dev: (message: string, data?: Record<string, unknown>) => log('dev', key as LogCategory, message, data),
            log: logMethodCat,
            info: (message: string, data?: Record<string, unknown>) => log('info', key as LogCategory, message, data),
            warn: (message: string, data?: Record<string, unknown>) => log('warn', key as LogCategory, message, data),
            error: (message: string, data?: Record<string, unknown>) => log('error', key as LogCategory, message, data),
            fatal: (message: string, data?: Record<string, unknown>) => log('fatal', key as LogCategory, message, data),
            debug: (message: string, data?: Record<string, unknown>) => {
                warnDebugDeprecated();
                logMethodCat(message, data);
            },
        };
    }

    return dynamicLogger as DynamicLogger<T>;
}
