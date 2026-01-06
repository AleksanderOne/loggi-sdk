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

import { LogLevel, LogEntry, LogSchema, CategorySchema, LEVEL_PRIORITY } from './types';
import { getConfig, isLoggiInitialized } from './config';
import { enqueue } from './transport';
import { sanitize, sanitizeMessage } from './utils/sanitize';
import { getRequestId } from './next/request-context';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPY
// ═══════════════════════════════════════════════════════════════════════════════

/** Poziomy logowania */
type Level = 'dev' | 'log' | 'info' | 'warn' | 'error' | 'fatal';

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
export interface Loggi<T extends string = string> extends BaseCategories {
  extra: ExtraCategories<T>;
  /** Metadane */
  _schema: LogSchema | null;
  _projectCategories: string[];
  /** Odśwież schemat z API */
  refresh: () => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// KOLORY I FORMATOWANIE
// ═══════════════════════════════════════════════════════════════════════════════

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const LEVEL_CONFIG: Record<Level, { icon: string; color: string; label: string }> = {
  dev: { icon: '🛠️', color: '\x1b[35m', label: ' DEV ' },   // Magenta - wyraźny dla dev
  log: { icon: '🔍', color: '\x1b[90m', label: ' LOG ' },   // Gray - dawny debug
  info: { icon: '📋', color: '\x1b[96m', label: 'INFO ' },
  warn: { icon: '⚠️ ', color: '\x1b[93m', label: 'WARN ' },
  error: { icon: '❌', color: '\x1b[91m', label: 'ERROR' },
  fatal: { icon: '💀', color: '\x1b[95m', label: 'FATAL' },
};

const BASE_CATEGORY_CONFIG: Record<string, { icon: string; color: string; name: string }> = {
  auth: { icon: '🔐', color: '\x1b[95m', name: 'Autoryzacja' },
  api: { icon: '🌐', color: '\x1b[94m', name: 'API' },
  security: { icon: '🛡️', color: '\x1b[91m', name: 'Bezpieczeństwo' },
  db: { icon: '💾', color: '\x1b[93m', name: 'BazaDanych' },
  flow: { icon: '🔄', color: '\x1b[35m', name: 'Przepływ' },
};

// ═══════════════════════════════════════════════════════════════════════════════
// CACHE I STAN
// ═══════════════════════════════════════════════════════════════════════════════

let _schemaCache: LogSchema | null = null;
let _categoryMap: Map<string, CategorySchema> = new Map();
const _originalConsoleLog = console.log.bind(console);

// ═══════════════════════════════════════════════════════════════════════════════
// FORMATOWANIE KONSOLI
// ═══════════════════════════════════════════════════════════════════════════════

function formatTimestamp(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
}

function formatData(data: Record<string, unknown>): string {
  const entries = Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => {
      const formatted = typeof v === 'object' ? JSON.stringify(v) : String(v);
      return `${DIM}${k}${RESET}=${formatted.length > 60 ? formatted.slice(0, 57) + '...' : formatted}`;
    });

  if (entries.length === 0) return '';
  return `\n    ${DIM}└─${RESET} ${entries.join(` ${DIM}│${RESET} `)}`;
}

function printToConsole(level: Level, category: string, message: string, data?: Record<string, unknown>): void {
  const levelCfg = LEVEL_CONFIG[level];

  // Pobierz config kategorii - z cache lub bazowy
  const catSchema = _categoryMap.get(category);
  const catConfig = BASE_CATEGORY_CONFIG[category] || {
    icon: catSchema?.icon || '📋',
    color: catSchema?.ansiColor || '\x1b[37m',
    name: catSchema?.name || category,
  };

  const timestamp = formatTimestamp();
  const categoryLabel = `${catConfig.name}(${category})`.padEnd(20);

  const prefix = `${DIM}${timestamp}${RESET} ${levelCfg.icon} ${levelCfg.color}${levelCfg.label}${RESET} ${catConfig.icon} ${catConfig.color}${BOLD}${categoryLabel}${RESET}`;

  _originalConsoleLog(prefix, message);

  if (data && Object.keys(data).length > 0) {
    const dataStr = formatData(data);
    if (dataStr) _originalConsoleLog(dataStr);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// GŁÓWNA FUNKCJA LOGOWANIA
// ═══════════════════════════════════════════════════════════════════════════════

function log(level: Level, category: string, message: string, data?: Record<string, unknown>): void {
  if (!isLoggiInitialized()) {
    // Fallback - wyświetl w konsoli
    printToConsole(level, category, message, data);
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
    category: category as any,
    source: 'server',
    message: sanitizedMessage,
    data: sanitizedData,
    requestId: getRequestId(),
    projectSlug: config.projectSlug,
    environment: config.environment,
  };

  // Dev mode - też do konsoli
  if (config.debug && config.consoleInDev) {
    printToConsole(level, category, message, data);
  }

  // Wyślij do Loggi-App
  enqueue(entry);
}

// ═══════════════════════════════════════════════════════════════════════════════
// KREATORY LOGGERÓW
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Helper do obsługi error(message, error?, data?) lub error(message, data?)
 */
function parseErrorArgs(
  errorOrData?: Error | Record<string, unknown>,
  data?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!errorOrData) return data;

  if (errorOrData instanceof Error) {
    // error(message, Error, data?)
    return {
      ...data,
      error: {
        name: errorOrData.name,
        message: errorOrData.message,
        stack: errorOrData.stack,
      },
    };
  }

  // error(message, data)
  return errorOrData;
}

/**
 * Wyekstrahuj ścieżkę pliku i linię ze stack trace
 */
function extractFileFromStack(): string {
  const stack = new Error().stack;
  if (!stack) return 'unknown';

  // Szukamy linii która nie jest z SDK (pomijamy loggi.ts, logger.ts)
  const lines = stack.split('\n');
  for (const line of lines) {
    if (line.includes('loggi.ts') || line.includes('logger.ts') || line.includes('at Error')) continue;
    const match = line.match(/\((.+):(\d+):(\d+)\)/) || line.match(/at (.+):(\d+):(\d+)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  return 'unknown';
}

// Flaga do wyświetlania ostrzeżenia o deprecated debug() tylko raz
let _debugDeprecationWarningShown = false;

function createCategoryMethods(category: string): CategoryMethods {
  const logMethod = (message: string, data?: Record<string, unknown>) => log('log', category, message, data);

  return {
    // Nowa metoda dev z dodatkowym kontekstem
    dev: (message, data) => {
      const devContext = {
        __dev: true,
        __file: extractFileFromStack(),
        __timestamp: typeof performance !== 'undefined' ? performance.now() : Date.now(),
        __memory: typeof process !== 'undefined' && typeof process.memoryUsage === 'function' ? process.memoryUsage().heapUsed : undefined,
      };
      log('dev', category, message, { ...data, ...devContext });
    },
    // Nowa metoda log (dawny debug)
    log: logMethod,
    info: (message, data) => log('info', category, message, data),
    warn: (message, data) => log('warn', category, message, data),
    error: (message, errorOrData, data) => log('error', category, message, parseErrorArgs(errorOrData, data)),
    fatal: (message, errorOrData, data) => log('fatal', category, message, parseErrorArgs(errorOrData, data)),
    // Deprecated alias - wyświetl ostrzeżenie przy pierwszym użyciu
    debug: (message, data) => {
      if (!_debugDeprecationWarningShown) {
        console.warn('[LOGGI] ⚠️ Metoda .debug() jest deprecated. Użyj .log() zamiast tego.');
        _debugDeprecationWarningShown = true;
      }
      logMethod(message, data);
    },
  };
}

function createFlowLogger(): FlowLogger {
  const base = createCategoryMethods('flow');
  let currentRequestId: string | null = null;

  return {
    ...base,
    start: (flowName, data) => {
      currentRequestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const border = '─'.repeat(40);
      _originalConsoleLog(`\n${DIM}┌${border}${RESET}`);
      log('info', 'flow', `${BOLD}▶▶▶ START: ${flowName}${RESET}`, { ...data, requestId: currentRequestId });
      return currentRequestId;
    },
    step: (stepName, data) => {
      log('log', 'flow', `${DIM}├─${RESET} ${stepName}`, data);
    },
    end: (flowName, status, durationMs) => {
      const statusIcon = status === 'success' ? '✅' : '❌';
      const statusColor = status === 'success' ? '\x1b[92m' : '\x1b[91m';
      log(status === 'failure' ? 'error' : 'info', 'flow',
        `${BOLD}◀◀◀ END: ${flowName} ${statusIcon} ${statusColor}[${status.toUpperCase()}]${RESET}`,
        durationMs ? { durationMs } : undefined
      );
      const border = '─'.repeat(40);
      _originalConsoleLog(`${DIM}└${border}${RESET}\n`);
      currentRequestId = null;
    },
  };
}

function createApiLogger(): ApiLogger {
  const base = createCategoryMethods('api');

  const METHOD_COLORS: Record<string, string> = {
    GET: '\x1b[92m',
    POST: '\x1b[94m',
    PUT: '\x1b[93m',
    PATCH: '\x1b[33m',
    DELETE: '\x1b[91m',
  };

  return {
    ...base,
    request: (method, url, data) => {
      const methodColor = METHOD_COLORS[method] || '\x1b[37m';
      log('log', 'api', `▶ ${methodColor}${method}${RESET} ${url}`, data);
    },
    response: (method, url, status, durationMs, data) => {
      const level: Level = status >= 400 ? 'error' : status >= 300 ? 'warn' : 'info';
      const statusColor = status >= 400 ? '\x1b[91m' : status >= 300 ? '\x1b[93m' : '\x1b[92m';
      log(level, 'api', `◀ ${method} ${url} → ${statusColor}${status}${RESET}`, {
        durationMs,
        ...(data ? { response: data } : {}),
      });
    },
  };
}

function createSecurityLogger(): SecurityLogger {
  const base = createCategoryMethods('security');

  return {
    ...base,
    event: (eventType, status, data) => {
      const statusIcon = status === 'success' ? '✅' : status === 'failure' ? '🚫' : '⚠️';
      const statusColor = status === 'success' ? '\x1b[92m' : status === 'failure' ? '\x1b[91m' : '\x1b[93m';
      const level: Level = status === 'failure' ? 'error' : status === 'warning' ? 'warn' : 'info';
      log(level, 'security', `${statusIcon} ${eventType} ${statusColor}[${status.toUpperCase()}]${RESET}`, data);
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// POBIERANIE SCHEMATU
// ═══════════════════════════════════════════════════════════════════════════════

async function fetchSchema(): Promise<LogSchema | null> {
  if (_schemaCache) return _schemaCache;

  if (!isLoggiInitialized()) {
    return null;
  }

  const config = getConfig();
  const schemaUrl = config.endpoint.replace('/api/logs/collect', `/api/log-schema/${config.projectSlug}`);

  try {
    const response = await fetch(schemaUrl, {
      headers: { 'X-API-Key': config.apiKey },
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
    _categoryMap.clear();
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

// ═══════════════════════════════════════════════════════════════════════════════
// PROXY DLA NIEZNANYCH KATEGORII
// ═══════════════════════════════════════════════════════════════════════════════

// Set do śledzenia ostrzeżeń (żeby nie spamować)
const _unknownCategoryWarnings = new Set<string>();

/**
 * Tworzy Proxy dla extra kategorii - zwraca logger nawet dla nieistniejących kategorii
 */
function createExtraProxy<T extends string>(
  knownCategories: Record<string, CategoryMethods>
): ExtraCategories<T> {
  return new Proxy(knownCategories as ExtraCategories<T>, {
    get: (target, prop: string | symbol) => {
      // Ignoruj symbole i wewnętrzne property
      if (typeof prop === 'symbol' || prop.startsWith('_')) {
        return undefined;
      }

      // Jeśli kategoria istnieje - zwróć ją
      if (prop in target) {
        return target[prop as T];
      }

      // Kategoria nie istnieje - zwróć logger z ostrzeżeniem (tylko raz per kategoria)
      if (!_unknownCategoryWarnings.has(prop)) {
        _unknownCategoryWarnings.add(prop);
        _originalConsoleLog(
          `[LOGGI] ⚠️ Unknown category "${prop}" - logs will be saved with category "unknown". ` +
          `Add this category in loggi-app dashboard or use a base category (auth, api, security, db, flow).`
        );
      }

      // Zwróć logger który loguje z oryginalną kategorią (zostanie zapisana w metadata)
      return createUnknownCategoryMethods(prop);
    },
  });
}

/**
 * Tworzy metody loggera dla nieznanej kategorii
 * Loguje normalnie, ale dodaje info że kategoria nie jest zdefiniowana
 */
function createUnknownCategoryMethods(originalCategory: string): CategoryMethods {
  const logWithUnknown = (level: Level, message: string, data?: Record<string, unknown>) => {
    log(level, 'custom', message, {
      ...data,
      _unknownCategory: originalCategory,
      _categoryWarning: `Category "${originalCategory}" is not defined in loggi-app`,
    });
  };

  return {
    dev: (message, data) => logWithUnknown('dev', message, data),
    log: (message, data) => logWithUnknown('log', message, data),
    info: (message, data) => logWithUnknown('info', message, data),
    warn: (message, data) => logWithUnknown('warn', message, data),
    error: (message, errorOrData, data) => logWithUnknown('error', message, parseErrorArgs(errorOrData, data)),
    fatal: (message, errorOrData, data) => logWithUnknown('fatal', message, parseErrorArgs(errorOrData, data)),
    debug: (message, data) => logWithUnknown('log', message, data),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// GŁÓWNY EKSPORT - createLoggi()
// ═══════════════════════════════════════════════════════════════════════════════

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
export async function createLoggi<T extends string = string>(): Promise<Loggi<T>> {
  const schema = await fetchSchema();

  // Kategorie projektowe (nie-bazowe)
  const projectCategories = schema?.categories
    .filter(c => !c.isBase)
    .map(c => c.key) || [];

  // Buduj obiekt extra ze znanymi kategoriami
  const knownExtra: Record<string, CategoryMethods> = {};
  for (const key of projectCategories) {
    knownExtra[key] = createCategoryMethods(key);
  }

  // Proxy dla extra - obsługuje też nieznane kategorie
  const extraProxy = createExtraProxy<T>(knownExtra);

  const loggiInstance: Loggi<T> = {
    // Bazowe
    auth: createCategoryMethods('auth'),
    api: createApiLogger(),
    security: createSecurityLogger(),
    db: createCategoryMethods('db'),
    flow: createFlowLogger(),

    // Projektowe (z Proxy dla nieznanych)
    extra: extraProxy,

    // Metadane
    _schema: schema,
    _projectCategories: projectCategories,

    // Refresh
    refresh: async () => {
      _schemaCache = null;
      const newSchema = await fetchSchema();
      if (newSchema) {
        const newProjectCategories = newSchema.categories
          .filter(c => !c.isBase)
          .map(c => c.key);

        for (const key of newProjectCategories) {
          if (!(key in knownExtra)) {
            knownExtra[key] = createCategoryMethods(key);
          }
        }
        loggiInstance._schema = newSchema;
        loggiInstance._projectCategories = newProjectCategories;
      }
    },
  };

  return loggiInstance;
}

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
export function createLoggiSync<T extends string = string>(
  projectCategories: T[] = []
): Loggi<T> {
  // Buduj obiekt extra ze znanymi kategoriami
  const knownExtra: Record<string, CategoryMethods> = {};
  for (const key of projectCategories) {
    knownExtra[key] = createCategoryMethods(key);
  }

  // Proxy dla extra - obsługuje też nieznane kategorie
  const extraProxy = createExtraProxy<T>(knownExtra);

  return {
    auth: createCategoryMethods('auth'),
    api: createApiLogger(),
    security: createSecurityLogger(),
    db: createCategoryMethods('db'),
    flow: createFlowLogger(),
    extra: extraProxy,
    _schema: _schemaCache,
    _projectCategories: projectCategories,
    refresh: async () => {
      await fetchSchema();
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// PREDEFINIOWANE INSTANCJE DLA PROJEKTÓW
// ═══════════════════════════════════════════════════════════════════════════════

/** Kategorie CLA */
export type CLACategories = 'token' | 'session' | 'authorize' | 'aha' | 'claim';

/** Kategorie AHA */
export type AHACategories = 'project' | 'policy' | 'member' | 'cla' | 'session' | 'claim';

/** Kategorie FA */
export type FACategories = 'learning' | 'deck' | 'card';
