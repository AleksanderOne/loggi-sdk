export { g as getRequestId, r as runWithRequestId } from './request-context-D8h090cW.mjs';

/**
 * Poziomy logowania
 * dev - logi developerskie z dodatkowym kontekstem (__file, __memory, __timestamp)
 * log - standardowe logowanie (dawny debug, odpowiednik console.log)
 */
type LogLevel = 'dev' | 'log' | 'info' | 'warn' | 'error' | 'fatal';
/**
 * Kategorie logów - używane do grupowania i filtrowania
 * (bazowe + możliwość rozszerzenia przez createLogger)
 */
type LogCategory = 'auth' | 'api' | 'security' | 'db' | 'middleware' | 'console' | 'fetch' | 'error' | 'custom' | 'flow' | string;
/**
 * Definicja kategorii z API
 */
interface CategorySchema {
    key: string;
    name: string;
    nameEn: string;
    icon: string;
    color: string;
    ansiColor: string;
    description: string;
    examples: string[];
    isBase: boolean;
}
/**
 * Schema logowania z API
 */
interface LogSchema {
    projectId: string;
    projectName: string;
    categories: CategorySchema[];
    version: string;
    generatedAt: string;
}
/**
 * Environment aplikacji
 */
type LogEnvironment = 'development' | 'production' | 'staging';
/**
 * Źródło loga
 */
type LogSource = 'server' | 'client';
/**
 * Pojedynczy wpis loga
 */
interface LogEntry {
    timestamp: string;
    level: LogLevel;
    category: LogCategory;
    source: LogSource;
    message: string;
    data?: Record<string, unknown>;
    requestId?: string;
    projectSlug?: string;
    environment?: LogEnvironment;
    requestUrl?: string;
    requestMethod?: string;
    requestStatus?: number;
    requestDurationMs?: number;
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}
/**
 * Konfiguracja SDK
 */
interface LoggiConfig {
    /** Klucz API projektu w Loggi-App (opcjonalne - bez klucza działa offline mode) */
    apiKey?: string;
    /** Endpoint Loggi-App (domyślnie: process.env.LOGGI_ENDPOINT lub http://localhost:3003) */
    endpoint?: string;
    /** Slug projektu (domyślnie: process.env.LOGGI_PROJECT_SLUG lub auto z package.json) */
    projectSlug?: string;
    /** Environment (domyślnie: process.env.NODE_ENV) */
    environment?: LogEnvironment;
    /** Przechwytywanie console.* (domyślnie: true) */
    captureConsole?: boolean;
    /** Przechwytywanie fetch() (domyślnie: true) */
    captureFetch?: boolean;
    /** Przechwytywanie uncaught errors (domyślnie: true) */
    captureUnhandled?: boolean;
    /** Wielkość batcha (domyślnie: 10) */
    batchSize?: number;
    /** Timeout batcha w ms (domyślnie: 5000) */
    batchTimeoutMs?: number;
    /** Tryb debug - więcej logów (domyślnie: NODE_ENV === 'development') */
    debug?: boolean;
    /** Wyświetlanie logów w konsoli w dev mode (domyślnie: true) */
    consoleInDev?: boolean;
    /** Minimalny poziom logów do wysłania (domyślnie: 'log' w dev, 'info' w prod) */
    minLevel?: LogLevel;
    /** Klucze do sanityzacji (domyślnie: ['password', 'token', 'secret', ...]) */
    sensitiveKeys?: string[];
    /** Mapowanie prefixów console.log na kategorie */
    prefixMap?: Record<string, LogCategory>;
    /** Tryb offline - logi tylko do konsoli, bez wysyłania do loggi-app */
    offlineMode?: boolean;
}

/**
 * Pobierz aktualną konfigurację
 */
declare function getConfig(): Required<LoggiConfig>;
/**
 * Sprawdź czy SDK jest zainicjalizowane
 */
declare function isLoggiInitialized(): boolean;
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
declare function initLoggi(config?: LoggiConfig): void;

/**
 * Główna funkcja logowania
 */
declare function log(level: LogLevel, category: LogCategory, message: string, data?: Record<string, unknown>): void;
/**
 * Główny obiekt loggera
 */
declare const logger: {
    dev: (message: string, data?: Record<string, unknown>) => void;
    log: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    fatal: (message: string, data?: Record<string, unknown>) => void;
    /** @deprecated Użyj .log() */
    debug: (message: string, data?: Record<string, unknown>) => void;
    auth: {
        dev: (message: string, data?: Record<string, unknown>) => void;
        log: (message: string, data?: Record<string, unknown>) => void;
        info: (message: string, data?: Record<string, unknown>) => void;
        warn: (message: string, data?: Record<string, unknown>) => void;
        error: (message: string, data?: Record<string, unknown>) => void;
        fatal: (message: string, data?: Record<string, unknown>) => void;
        /** @deprecated Użyj .log() */
        debug: (message: string, data?: Record<string, unknown>) => void;
    };
    api: {
        dev: (message: string, data?: Record<string, unknown>) => void;
        log: (message: string, data?: Record<string, unknown>) => void;
        info: (message: string, data?: Record<string, unknown>) => void;
        warn: (message: string, data?: Record<string, unknown>) => void;
        error: (message: string, data?: Record<string, unknown>) => void;
        fatal: (message: string, data?: Record<string, unknown>) => void;
        /** @deprecated Użyj .log() */
        debug: (message: string, data?: Record<string, unknown>) => void;
    };
    security: {
        dev: (message: string, data?: Record<string, unknown>) => void;
        log: (message: string, data?: Record<string, unknown>) => void;
        info: (message: string, data?: Record<string, unknown>) => void;
        warn: (message: string, data?: Record<string, unknown>) => void;
        error: (message: string, data?: Record<string, unknown>) => void;
        fatal: (message: string, data?: Record<string, unknown>) => void;
        /** @deprecated Użyj .log() */
        debug: (message: string, data?: Record<string, unknown>) => void;
    };
    db: {
        dev: (message: string, data?: Record<string, unknown>) => void;
        log: (message: string, data?: Record<string, unknown>) => void;
        info: (message: string, data?: Record<string, unknown>) => void;
        warn: (message: string, data?: Record<string, unknown>) => void;
        error: (message: string, data?: Record<string, unknown>) => void;
        fatal: (message: string, data?: Record<string, unknown>) => void;
        /** @deprecated Użyj .log() */
        debug: (message: string, data?: Record<string, unknown>) => void;
    };
    middleware: {
        dev: (message: string, data?: Record<string, unknown>) => void;
        log: (message: string, data?: Record<string, unknown>) => void;
        info: (message: string, data?: Record<string, unknown>) => void;
        warn: (message: string, data?: Record<string, unknown>) => void;
        error: (message: string, data?: Record<string, unknown>) => void;
        fatal: (message: string, data?: Record<string, unknown>) => void;
        /** @deprecated Użyj .log() */
        debug: (message: string, data?: Record<string, unknown>) => void;
    };
};

/**
 * Typ dla dynamicznego loggera kategorii
 */
type CategoryLogger = {
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
type DynamicLogger<T extends string> = {
    [K in T]: CategoryLogger;
} & {
    dev: (message: string, data?: Record<string, unknown>) => void;
    log: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    error: (message: string, data?: Record<string, unknown>) => void;
    fatal: (message: string, data?: Record<string, unknown>) => void;
    /** @deprecated Użyj .log() */
    debug: (message: string, data?: Record<string, unknown>) => void;
    _schema: LogSchema | null;
    _categories: string[];
};
/**
 * Pobierz schemat kategorii z API
 */
declare function fetchSchema(): Promise<LogSchema | null>;
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
declare function createLogger<T extends string = string>(): Promise<DynamicLogger<T>>;
/**
 * Wersja synchroniczna createLogger (bez pobierania schematu)
 * Używa cache jeśli schemat został już pobrany
 */
declare function createLoggerSync<T extends string = string>(): DynamicLogger<T>;

/**
 * Wyślij logi do Loggi-App
 */
declare function flush(): Promise<void>;
/**
 * Sprawdź czy transport jest w trybie offline
 */
declare function isTransportOffline(): boolean;
/**
 * Resetuj tryb offline (np. po ponownym połączeniu)
 */
declare function resetOfflineMode(): void;
/**
 * Inicjalizuj transport - wywołaj po initLoggi()
 */
declare function initTransport(): Promise<void>;

/**
 * LOGGI - Unified Logging API
 *
 * Jeden interfejs do wszystkich logów:
 *
 * // Bazowe (dostępne wszędzie):
 * loggi.auth.info('User logged in', { userId });
 * loggi.api.log('GET /users', { status: 200 });
 * loggi.security.warn('Rate limit exceeded', { ip });
 * loggi.db.error('Connection failed', { error });
 * loggi.flow.start('Token Exchange');
 *
 * // Logi developerskie (z dodatkowym kontekstem):
 * loggi.auth.dev('Debug auth flow', { step: 1 });
 *
 * // Projektowe (z konfiguracji):
 * loggi.extra.token.info('Token generated');      // CLA
 * loggi.extra.learning.log('Card reviewed');      // FA
 * loggi.extra.project.info('Project created');    // AHA
 */

/** Metody loggera dla kategorii */
interface CategoryMethods {
    /** Logi developerskie - z dodatkowym kontekstem (__file, __memory, __timestamp) */
    dev: (message: string, data?: Record<string, unknown>) => void;
    /** Standardowe logowanie (dawny debug, odpowiednik console.log) */
    log: (message: string, data?: Record<string, unknown>) => void;
    info: (message: string, data?: Record<string, unknown>) => void;
    warn: (message: string, data?: Record<string, unknown>) => void;
    /** error może przyjmować Error jako drugi parametr lub data jako Record */
    error: (message: string, errorOrData?: Error | Record<string, unknown>, data?: Record<string, unknown>) => void;
    fatal: (message: string, errorOrData?: Error | Record<string, unknown>, data?: Record<string, unknown>) => void;
    /** @deprecated Użyj .log() zamiast .debug() */
    debug: (message: string, data?: Record<string, unknown>) => void;
}
/** Flow logger z start/step/end */
interface FlowLogger extends CategoryMethods {
    start: (flowName: string, data?: Record<string, unknown>) => string;
    step: (stepName: string, data?: Record<string, unknown>) => void;
    end: (flowName: string, status: 'success' | 'failure', durationMs?: number) => void;
}
/** API logger z request/response */
interface ApiLogger extends CategoryMethods {
    request: (method: string, url: string, data?: Record<string, unknown>) => void;
    response: (method: string, url: string, status: number, durationMs: number, data?: unknown) => void;
}
/** Security logger z event */
interface SecurityLogger extends CategoryMethods {
    event: (eventType: string, status: 'success' | 'failure' | 'warning', data?: Record<string, unknown>) => void;
}
/** Bazowe kategorie (zawsze dostępne) */
interface BaseCategories {
    auth: CategoryMethods;
    api: ApiLogger;
    security: SecurityLogger;
    db: CategoryMethods;
    flow: FlowLogger;
}
/** Projektowe kategorie (dynamiczne) */
type ExtraCategories<T extends string = string> = {
    [K in T]: CategoryMethods;
};
/** Główny interfejs loggi */
interface Loggi<T extends string = string> extends BaseCategories {
    extra: ExtraCategories<T>;
    /** Metadane */
    _schema: LogSchema | null;
    _projectCategories: string[];
    /** Odśwież schemat z API */
    refresh: () => Promise<void>;
}
/**
 * Tworzy główny obiekt loggi
 *
 * @example
 * // W lib/loggi.ts projektu:
 * import { createLoggi } from 'loggi-sdk';
 *
 * // Dla CLA:
 * export const loggi = await createLoggi<'token' | 'session' | 'authorize' | 'aha' | 'claim'>();
 *
 * // Dla AHA:
 * export const loggi = await createLoggi<'project' | 'policy' | 'member' | 'cla'>();
 *
 * // Dla FA:
 * export const loggi = await createLoggi<'learning' | 'deck' | 'card'>();
 *
 * // Użycie:
 * loggi.auth.info('User logged in', { userId });
 * loggi.flow.start('Token Exchange');
 * loggi.extra.token.log('Token generated');
 * loggi.auth.dev('Debug auth flow', { step: 1 }); // z dodatkowym kontekstem
 */
declare function createLoggi<T extends string = string>(): Promise<Loggi<T>>;
/**
 * Wersja synchroniczna (bez pobierania schematu z API)
 * Używa lokalnej definicji kategorii + Proxy dla nieznanych
 *
 * @example
 * // Bez kategorii projektowych (tylko bazowe + fallback dla nieznanych)
 * const loggi = createLoggiSync();
 *
 * // Z kategorii projektowymi
 * const loggi = createLoggiSync(['project', 'policy', 'member']);
 */
declare function createLoggiSync<T extends string = string>(projectCategories?: T[]): Loggi<T>;
/** Kategorie CLA */
type CLACategories = 'token' | 'session' | 'authorize' | 'aha' | 'claim';
/** Kategorie AHA */
type AHACategories = 'project' | 'policy' | 'member' | 'cla' | 'session' | 'claim';
/** Kategorie FA */
type FACategories = 'learning' | 'deck' | 'card';

/**
 * Przechwytuj console.*
 */
declare function captureConsole(): void;
/**
 * Przywróć oryginalne console (do testów)
 */
declare function restoreConsole(): void;
/**
 * Surowe console - loguje bez przechwytywania przez SDK.
 * Użyj gdy masz własny logger który formatuje output i nie chcesz duplikacji.
 */
declare const rawConsole: {
    log: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
    debug: (...args: unknown[]) => void;
};

/**
 * Przechwytuj fetch()
 */
declare function captureFetch(): void;
/**
 * Przywróć oryginalny fetch (do testów)
 */
declare function restoreFetch(): void;

/**
 * Rejestruje handlery dla nieobsłużonych błędów i odrzuconych Promise'ów
 */
declare function captureUnhandled(): void;

/**
 * Rekurencyjnie sanityzuje obiekt, ukrywając wrażliwe dane
 */
declare function sanitize(data: Record<string, unknown> | undefined, sensitiveKeys: string[]): Record<string, unknown> | undefined;
/**
 * Sanityzuje string message - ukrywa tokeny i hasła
 */
declare function sanitizeMessage(message: string): string;

export { type AHACategories, type CLACategories, type CategoryLogger, type CategorySchema, type DynamicLogger, type FACategories, type LogCategory, type LogEntry, type LogLevel, type LogSchema, type Loggi, type LoggiConfig, log as _internalLog, captureConsole, captureFetch, captureUnhandled, createLogger, createLoggerSync, createLoggi, createLoggiSync, fetchSchema, flush, getConfig, initLoggi, initTransport, isLoggiInitialized, isTransportOffline, logger, rawConsole, resetOfflineMode, restoreConsole, restoreFetch, sanitize, sanitizeMessage };
