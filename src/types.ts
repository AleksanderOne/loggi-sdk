/**
 * Poziomy logowania
 * dev - logi developerskie z dodatkowym kontekstem (__file, __memory, __timestamp)
 * log - standardowe logowanie (dawny debug, odpowiednik console.log)
 */
export type LogLevel = 'dev' | 'log' | 'info' | 'warn' | 'error' | 'fatal';

/**
 * Kategorie logów - używane do grupowania i filtrowania
 * (bazowe + możliwość rozszerzenia przez createLogger)
 */
export type LogCategory =
    | 'auth'       // Logowanie, sesje, OAuth
    | 'api'        // Wywołania API
    | 'security'   // Rate limiting, CSRF, walidacja
    | 'db'         // Operacje bazodanowe
    | 'middleware' // Middleware logi
    | 'console'    // Przechwycone z console.*
    | 'fetch'      // Przechwycone z fetch()
    | 'error'      // Uncaught errors
    | 'custom'     // Własne
    | 'flow'       // Przepływ operacji
    | string;      // Dynamiczne kategorie z API

/**
 * Definicja kategorii z API
 */
export interface CategorySchema {
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
export interface LogSchema {
    projectId: string;
    projectName: string;
    categories: CategorySchema[];
    version: string;
    generatedAt: string;
}

/**
 * Environment aplikacji
 */
export type LogEnvironment = 'development' | 'production' | 'staging';

/**
 * Źródło loga
 */
export type LogSource = 'server' | 'client';

/**
 * Pojedynczy wpis loga
 */
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    category: LogCategory;
    source: LogSource;
    message: string;
    data?: Record<string, unknown>;
    requestId?: string;
    projectSlug?: string;
    environment?: LogEnvironment;

    // Kontekst HTTP (opcjonalny)
    requestUrl?: string;
    requestMethod?: string;
    requestStatus?: number;
    requestDurationMs?: number;

    // Kontekst błędu (opcjonalny)
    error?: {
        name: string;
        message: string;
        stack?: string;
    };
}

/**
 * Konfiguracja SDK
 */
export interface LoggiConfig {
    /** Klucz API projektu w Loggi-App (opcjonalne - bez klucza działa offline mode) */
    apiKey?: string;

    /** Endpoint Loggi-App (domyślnie: process.env.LOGGI_ENDPOINT lub http://localhost:3003) */
    endpoint?: string;

    /** Slug projektu (domyślnie: process.env.LOGGI_PROJECT_SLUG lub auto z package.json) */
    projectSlug?: string;

    /** Environment (domyślnie: process.env.NODE_ENV) */
    environment?: LogEnvironment;

    // Auto-capture
    /** Przechwytywanie console.* (domyślnie: true) */
    captureConsole?: boolean;

    /** Przechwytywanie fetch() (domyślnie: true) */
    captureFetch?: boolean;

    /** Przechwytywanie uncaught errors (domyślnie: true) */
    captureUnhandled?: boolean;

    // Batching
    /** Wielkość batcha (domyślnie: 10) */
    batchSize?: number;

    /** Timeout batcha w ms (domyślnie: 5000) */
    batchTimeoutMs?: number;

    // Dev mode
    /** Tryb debug - więcej logów (domyślnie: NODE_ENV === 'development') */
    debug?: boolean;

    /** Wyświetlanie logów w konsoli w dev mode (domyślnie: true) */
    consoleInDev?: boolean;

    // Filtering
    /** Minimalny poziom logów do wysłania (domyślnie: 'log' w dev, 'info' w prod) */
    minLevel?: LogLevel;

    /** Klucze do sanityzacji (domyślnie: ['password', 'token', 'secret', ...]) */
    sensitiveKeys?: string[];

    /** Mapowanie prefixów console.log na kategorie */
    prefixMap?: Record<string, LogCategory>;

    // Offline mode (internal - ustawiane automatycznie)
    /** Tryb offline - logi tylko do konsoli, bez wysyłania do loggi-app */
    offlineMode?: boolean;
}

/**
 * Priorytet poziomów logowania
 */
export const LEVEL_PRIORITY: Record<LogLevel, number> = {
    dev: 0,     // Najniższy - tylko development, z dodatkowym kontekstem
    log: 1,     // Standardowe logowanie (dawny debug)
    info: 2,
    warn: 3,
    error: 4,
    fatal: 5,
};

/**
 * Domyślne mapowanie prefixów na kategorie
 */
export const DEFAULT_PREFIX_MAP: Record<string, LogCategory> = {
    '[CLA AUTH]': 'auth',
    '[CLA AUTHORIZE]': 'auth',
    '[CLA TOKEN]': 'auth',
    '[CLA SECURITY]': 'security',
    '[CLA API]': 'api',
    '[CLA DB]': 'db',
    '[AHA MIDDLEWARE]': 'middleware',
    '[AHA AUTH]': 'auth',
    '[AHA PROJECT]': 'api',
    '[AHA POLICY]': 'security',
    '[AHA MEMBER]': 'api',
    '[AHA SESSION]': 'auth',
    '[FA AUTH]': 'auth',
    '[FA API]': 'api',
};

/**
 * Domyślne klucze do sanityzacji
 */
export const DEFAULT_SENSITIVE_KEYS = [
    'password',
    'token',
    'secret',
    'apiKey',
    'api_key',
    'authorization',
    'cookie',
    'session',
    'credit_card',
    'cvv',
    'ssn',
];
