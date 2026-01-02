import { LogLevel, LogCategory } from '../types';
import { getConfig, isLoggiInitialized } from '../config';
import { _internalLog } from '../logger';

/**
 * Oryginalne metody console
 */
let originalConsole: {
    log: typeof console.log;
    info: typeof console.info;
    warn: typeof console.warn;
    error: typeof console.error;
    debug: typeof console.debug;
} | null = null;

/**
 * Czy console jest już przechwycone
 */
let isCaptured = false;

/**
 * Mapowanie metod console na poziomy logów
 * console.log -> 'log' (dawny debug)
 * console.debug -> 'log' (mapowany tak samo jak console.log)
 */
const METHOD_TO_LEVEL: Record<string, LogLevel> = {
    log: 'log',     // console.log -> poziom 'log'
    info: 'info',
    warn: 'warn',
    error: 'error',
    debug: 'log',   // console.debug -> poziom 'log' (nie 'dev')
};

/**
 * Formatuj argumenty console do stringa
 */
function formatArgs(args: unknown[]): string {
    return args.map(arg => {
        if (typeof arg === 'string') return arg;
        if (typeof arg === 'object') {
            try {
                return JSON.stringify(arg);
            } catch {
                return String(arg);
            }
        }
        return String(arg);
    }).join(' ');
}

/**
 * Wyciągnij kategorię z prefiksu wiadomości
 */
function extractCategoryFromPrefix(message: string): LogCategory {
    if (!isLoggiInitialized()) return 'console';

    const config = getConfig();
    for (const [prefix, category] of Object.entries(config.prefixMap)) {
        if (message.startsWith(prefix)) {
            return category;
        }
    }
    return 'console';
}

/**
 * Usuń prefiks z wiadomości (opcjonalne - zachowujemy dla czytelności)
 */
function removePrefixFromMessage(message: string): string {
    if (!isLoggiInitialized()) return message;

    const config = getConfig();
    for (const prefix of Object.keys(config.prefixMap)) {
        if (message.startsWith(prefix)) {
            return message.slice(prefix.length).trim();
        }
    }
    return message;
}

/**
 * Przechwytuj console.*
 */
export function captureConsole(): void {
    if (isCaptured) return;
    isCaptured = true;

    // Zapisz oryginalne metody
    originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
        debug: console.debug,
    };

    const methods = ['log', 'info', 'warn', 'error', 'debug'] as const;

    for (const method of methods) {
        const original = originalConsole[method];

        (console as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
            // Wywołaj oryginalną metodę w dev mode
            if (isLoggiInitialized()) {
                const config = getConfig();
                if (config.debug && config.consoleInDev) {
                    original.apply(console, args);
                }
            } else {
                // SDK nie zainicjalizowane - normalne wywołanie
                original.apply(console, args);
            }

            // Formatuj wiadomość
            const message = formatArgs(args);

            // Pomiń logi SDK (anty-pętla)
            if (message.includes('[LOGGI]')) return;

            // Wyciągnij kategorię i poziom
            const category = extractCategoryFromPrefix(message);
            const level = METHOD_TO_LEVEL[method];

            // Wyciągnij dane z ostatniego argumentu (jeśli to obiekt)
            let data: Record<string, unknown> | undefined;
            const lastArg = args[args.length - 1];
            if (args.length > 1 && typeof lastArg === 'object' && lastArg !== null && !Array.isArray(lastArg)) {
                data = lastArg as Record<string, unknown>;
            }

            // Wyślij do Loggi
            _internalLog(level, category, message, data);
        };
    }
}

/**
 * Przywróć oryginalne console (do testów)
 */
export function restoreConsole(): void {
    if (!isCaptured || !originalConsole) return;

    console.log = originalConsole.log;
    console.info = originalConsole.info;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    console.debug = originalConsole.debug;

    originalConsole = null;
    isCaptured = false;
}

/**
 * Surowe console - loguje bez przechwytywania przez SDK.
 * Użyj gdy masz własny logger który formatuje output i nie chcesz duplikacji.
 */
export const rawConsole = {
    log: (...args: unknown[]) => {
        (originalConsole?.log ?? console.log).apply(console, args);
    },
    info: (...args: unknown[]) => {
        (originalConsole?.info ?? console.info).apply(console, args);
    },
    warn: (...args: unknown[]) => {
        (originalConsole?.warn ?? console.warn).apply(console, args);
    },
    error: (...args: unknown[]) => {
        (originalConsole?.error ?? console.error).apply(console, args);
    },
    debug: (...args: unknown[]) => {
        (originalConsole?.debug ?? console.debug).apply(console, args);
    },
};
