"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/types.ts
var LEVEL_PRIORITY, DEFAULT_PREFIX_MAP, DEFAULT_SENSITIVE_KEYS;
var init_types = __esm({
  "src/types.ts"() {
    "use strict";
    LEVEL_PRIORITY = {
      dev: 0,
      // Najniższy - tylko development, z dodatkowym kontekstem
      log: 1,
      // Standardowe logowanie (dawny debug)
      info: 2,
      warn: 3,
      error: 4,
      fatal: 5
    };
    DEFAULT_PREFIX_MAP = {
      "[CLA AUTH]": "auth",
      "[CLA AUTHORIZE]": "auth",
      "[CLA TOKEN]": "auth",
      "[CLA SECURITY]": "security",
      "[CLA API]": "api",
      "[CLA DB]": "db",
      "[AHA MIDDLEWARE]": "middleware",
      "[AHA AUTH]": "auth",
      "[AHA PROJECT]": "api",
      "[AHA POLICY]": "security",
      "[AHA MEMBER]": "api",
      "[AHA SESSION]": "auth",
      "[FA AUTH]": "auth",
      "[FA API]": "api"
    };
    DEFAULT_SENSITIVE_KEYS = [
      "password",
      "token",
      "secret",
      "apiKey",
      "api_key",
      "authorization",
      "cookie",
      "session",
      "credit_card",
      "cvv",
      "ssn"
    ];
  }
});

// src/transport.ts
var transport_exports = {};
__export(transport_exports, {
  enqueue: () => enqueue,
  flush: () => flush,
  initTransport: () => initTransport,
  isTransportOffline: () => isTransportOffline,
  resetOfflineMode: () => resetOfflineMode
});
function enqueue(entry) {
  if (isShuttingDown) return;
  if (!isLoggiInitialized()) {
    return;
  }
  const config = getConfig();
  if (config.offlineMode || isOffline) {
    return;
  }
  queue.push(entry);
  if (isRetrying) {
    return;
  }
  scheduleFlush();
}
function scheduleFlush() {
  const config = getConfig();
  if (config.offlineMode || isOffline) {
    return;
  }
  if (queue.length >= config.batchSize) {
    flush();
  } else if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flush();
    }, config.batchTimeoutMs);
  }
}
async function flush() {
  if (queue.length === 0) return;
  if (!isLoggiInitialized()) return;
  const config = getConfig();
  if (config.offlineMode || isOffline) {
    queue = [];
    return;
  }
  const batch = queue.splice(0, config.batchSize);
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    const endpoint = config.endpoint.includes("/api/logs/collect") ? config.endpoint : config.endpoint + "/api/logs/collect";
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": config.apiKey
      },
      body: JSON.stringify({
        logs: batch,
        projectSlug: config.projectSlug,
        environment: config.environment
      })
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    consecutiveFailures = 0;
    if (config.debug) {
      console.log(`[LOGGI] Sent ${batch.length} logs`);
    }
  } catch (error) {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_FAILURES_BEFORE_OFFLINE) {
      isOffline = true;
      queue = [];
      if (config.debug) {
        console.warn(`[LOGGI] Loggi-app unavailable after ${consecutiveFailures} failures. Switching to console-only mode.`);
      }
    } else if (config.debug) {
      console.warn(`[LOGGI] Failed to send logs (attempt ${consecutiveFailures}/${MAX_FAILURES_BEFORE_OFFLINE}):`, error);
    }
  }
  if (queue.length > 0 && !isOffline) {
    scheduleFlush();
  }
}
function isTransportOffline() {
  return isOffline;
}
function resetOfflineMode() {
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
async function checkServerAvailability() {
  if (!isLoggiInitialized()) return false;
  const config = getConfig();
  if (config.offlineMode) return false;
  try {
    const healthEndpoint = config.endpoint + "/api/health";
    const response = await fetch(healthEndpoint, {
      method: "GET",
      signal: AbortSignal.timeout(5e3)
      // 5s timeout
    });
    return response.ok;
  } catch {
    return false;
  }
}
async function startRetryLoop() {
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
      console.log(`[LOGGI] Pr\xF3ba po\u0142\u0105czenia z serwerem log\xF3w (${startupRetryCount}/${STARTUP_RETRY_CONFIG.maxRetries})...`);
    }
    const available = await checkServerAvailability();
    if (available) {
      connectionEstablished = true;
      isRetrying = false;
      isOffline = false;
      consecutiveFailures = 0;
      if (config.debug) {
        console.log("[LOGGI] \u2705 Po\u0142\u0105czono z serwerem log\xF3w");
      }
      if (queue.length > 0) {
        scheduleFlush();
      }
      return;
    }
    if (startupRetryCount >= STARTUP_RETRY_CONFIG.maxRetries) {
      isRetrying = false;
      isOffline = true;
      queue = [];
      console.warn(
        `[LOGGI] \u274C Nie uda\u0142o si\u0119 po\u0142\u0105czy\u0107 z serwerem log\xF3w po ${STARTUP_RETRY_CONFIG.maxRetries} pr\xF3bach. Przechodz\u0119 w tryb offline (tylko konsola).`
      );
      return;
    }
    if (config.debug) {
      console.log(`[LOGGI] Serwer niedost\u0119pny. Nast\u0119pna pr\xF3ba za ${STARTUP_RETRY_CONFIG.retryIntervalMs / 1e3}s...`);
    }
    retryTimer = setTimeout(attemptConnection, STARTUP_RETRY_CONFIG.retryIntervalMs);
  };
  await attemptConnection();
}
async function initTransport() {
  if (!isLoggiInitialized()) return;
  const config = getConfig();
  if (config.offlineMode) return;
  const available = await checkServerAvailability();
  if (available) {
    connectionEstablished = true;
    if (config.debug) {
      console.log("[LOGGI] \u2705 Serwer log\xF3w dost\u0119pny");
    }
  } else {
    console.warn("[LOGGI] \u26A0\uFE0F Serwer log\xF3w niedost\u0119pny. Uruchamiam retry w tle...");
    startRetryLoop();
  }
}
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  if (!isLoggiInitialized()) return;
  isShuttingDown = true;
  const config = getConfig();
  if (config.debug) {
    console.log(`[LOGGI] Received ${signal}, flushing remaining logs...`);
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
  isRetrying = false;
  if (!config.offlineMode && !isOffline && connectionEstablished && queue.length > 0) {
    await flush();
  }
  if (config.debug) {
    console.log("[LOGGI] Shutdown complete");
  }
}
var queue, flushTimer, isShuttingDown, isOffline, consecutiveFailures, MAX_FAILURES_BEFORE_OFFLINE, STARTUP_RETRY_CONFIG, isRetrying, startupRetryCount, retryTimer, connectionEstablished;
var init_transport = __esm({
  "src/transport.ts"() {
    "use strict";
    init_config();
    queue = [];
    flushTimer = null;
    isShuttingDown = false;
    isOffline = false;
    consecutiveFailures = 0;
    MAX_FAILURES_BEFORE_OFFLINE = 3;
    STARTUP_RETRY_CONFIG = {
      maxRetries: 10,
      // Max prób
      retryIntervalMs: 6e4
      // Interwał między próbami (1 minuta)
    };
    isRetrying = false;
    startupRetryCount = 0;
    retryTimer = null;
    connectionEstablished = false;
    if (typeof process !== "undefined") {
      process.on("SIGINT", () => gracefulShutdown("SIGINT"));
      process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
      process.on("beforeExit", () => gracefulShutdown("beforeExit"));
    }
  }
});

// src/utils/sanitize.ts
function sanitize(data, sensitiveKeys) {
  if (!data) return void 0;
  const result = {};
  const lowercaseKeys = sensitiveKeys.map((k) => k.toLowerCase());
  for (const [key, value] of Object.entries(data)) {
    const keyLower = key.toLowerCase();
    if (lowercaseKeys.some((sk) => keyLower.includes(sk))) {
      result[key] = "[REDACTED]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      result[key] = sanitize(value, sensitiveKeys);
    } else if (Array.isArray(value)) {
      result[key] = value.map(
        (item) => item && typeof item === "object" ? sanitize(item, sensitiveKeys) : item
      );
    } else {
      result[key] = value;
    }
  }
  return result;
}
function sanitizeMessage(message) {
  let sanitized = message.replace(
    /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g,
    "[JWT_TOKEN]"
  );
  sanitized = sanitized.replace(
    /Bearer\s+[A-Za-z0-9-_.]+/gi,
    "Bearer [TOKEN]"
  );
  sanitized = sanitized.replace(
    /(password|secret|token|apikey|api_key)[\s]*[=:]\s*["']?[^"'\s,}]+["']?/gi,
    "$1=[REDACTED]"
  );
  return sanitized;
}
var init_sanitize = __esm({
  "src/utils/sanitize.ts"() {
    "use strict";
  }
});

// src/next/request-context.ts
function getRequestId() {
  return storage.getStore()?.requestId;
}
function runWithRequestId(requestId, fn) {
  return storage.run({ requestId, startTime: Date.now() }, fn);
}
var import_async_hooks, storage;
var init_request_context = __esm({
  "src/next/request-context.ts"() {
    "use strict";
    import_async_hooks = require("async_hooks");
    storage = new import_async_hooks.AsyncLocalStorage();
  }
});

// src/logger.ts
function warnDebugDeprecated() {
  if (!_debugDeprecationWarningShown) {
    console.warn("[LOGGI] \u26A0\uFE0F Metoda .debug() jest deprecated. U\u017Cyj .log() zamiast tego.");
    _debugDeprecationWarningShown = true;
  }
}
function printToConsole(entry) {
  const levelColor = LEVEL_COLORS[entry.level];
  const levelEmoji = LEVEL_EMOJI[entry.level];
  const levelLabel = entry.level.toUpperCase().padEnd(5);
  const catInfo = _categoryMap.get(entry.category);
  const catEmoji = catInfo?.icon || CATEGORY_EMOJI[entry.category] || "\u{1F4CB}";
  const catColor = catInfo?.ansiColor || "\x1B[37m";
  const catName = catInfo?.name || entry.category;
  const now = new Date(entry.timestamp);
  const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
  const categoryLabel = `${catName}(${entry.category})`.padEnd(20);
  const prefix = `${DIM}${timestamp}${RESET} ${levelEmoji} ${levelColor}${levelLabel}${RESET} ${catEmoji} ${catColor}${BOLD}${categoryLabel}${RESET}`;
  if (entry.data && Object.keys(entry.data).length > 0) {
    _originalConsoleLog(prefix, entry.message);
    const dataStr = Object.entries(entry.data).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(([k, v]) => {
      const formatted = typeof v === "object" ? JSON.stringify(v) : String(v);
      return `${DIM}${k}${RESET}=${formatted.length > 60 ? formatted.slice(0, 57) + "..." : formatted}`;
    }).join(` ${DIM}\u2502${RESET} `);
    if (dataStr) {
      _originalConsoleLog(`    ${DIM}\u2514\u2500${RESET} ${dataStr}`);
    }
  } else {
    _originalConsoleLog(prefix, entry.message);
  }
}
function log(level, category, message, data) {
  if (!isLoggiInitialized()) {
    console.log(`[${level.toUpperCase()}] [${category}] ${message}`, data || "");
    return;
  }
  const config = getConfig();
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.minLevel]) {
    return;
  }
  const sanitizedData = sanitize(data, config.sensitiveKeys);
  const sanitizedMessage = sanitizeMessage(message);
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    category,
    source: "server",
    message: sanitizedMessage,
    data: sanitizedData,
    requestId: getRequestId(),
    projectSlug: config.projectSlug,
    environment: config.environment
  };
  if (config.debug && config.consoleInDev) {
    printToConsole(entry);
  }
  enqueue(entry);
}
function createCategoryLogger(category) {
  const logMethod = (message, data) => log("log", category, message, data);
  return {
    dev: (message, data) => log("dev", category, message, data),
    log: logMethod,
    info: (message, data) => log("info", category, message, data),
    warn: (message, data) => log("warn", category, message, data),
    error: (message, data) => log("error", category, message, data),
    fatal: (message, data) => log("fatal", category, message, data),
    /** @deprecated Użyj .log() */
    debug: (message, data) => {
      warnDebugDeprecated();
      logMethod(message, data);
    }
  };
}
async function fetchSchema() {
  if (_schemaCache) return _schemaCache;
  if (!isLoggiInitialized()) {
    return null;
  }
  const config = getConfig();
  const schemaUrl = config.endpoint.replace("/api/logs/collect", `/api/log-schema/${config.projectSlug}`);
  try {
    const response = await fetch(schemaUrl, {
      headers: {
        "X-API-Key": config.apiKey
      }
    });
    if (!response.ok) {
      if (config.debug) {
        console.warn(`[LOGGI] Failed to fetch schema: ${response.status}`);
      }
      return null;
    }
    const schema = await response.json();
    _schemaCache = schema;
    for (const cat of schema.categories) {
      _categoryMap.set(cat.key, cat);
    }
    if (config.debug) {
      console.log(`[LOGGI] Schema loaded: ${schema.categories.length} categories`);
    }
    return schema;
  } catch (err) {
    if (config.debug) {
      console.warn("[LOGGI] Failed to fetch schema:", err);
    }
    return null;
  }
}
async function createLogger() {
  const schema = await fetchSchema();
  const categoryKeys = schema?.categories.map((c) => c.key) || ["auth", "api", "security", "db", "flow", "custom"];
  const logMethodCustom2 = (message, data) => log("log", "custom", message, data);
  const dynamicLogger = {
    // Podstawowe metody
    dev: (message, data) => log("dev", "custom", message, data),
    log: logMethodCustom2,
    info: (message, data) => log("info", "custom", message, data),
    warn: (message, data) => log("warn", "custom", message, data),
    error: (message, data) => log("error", "custom", message, data),
    fatal: (message, data) => log("fatal", "custom", message, data),
    debug: (message, data) => {
      warnDebugDeprecated();
      logMethodCustom2(message, data);
    },
    // Metadane
    _schema: schema,
    _categories: categoryKeys
  };
  for (const key of categoryKeys) {
    const logMethodCat = (message, data) => log("log", key, message, data);
    dynamicLogger[key] = {
      dev: (message, data) => log("dev", key, message, data),
      log: logMethodCat,
      info: (message, data) => log("info", key, message, data),
      warn: (message, data) => log("warn", key, message, data),
      error: (message, data) => log("error", key, message, data),
      fatal: (message, data) => log("fatal", key, message, data),
      debug: (message, data) => {
        warnDebugDeprecated();
        logMethodCat(message, data);
      }
    };
  }
  return dynamicLogger;
}
function createLoggerSync() {
  const categoryKeys = _schemaCache?.categories.map((c) => c.key) || ["auth", "api", "security", "db", "flow", "custom"];
  const logMethodCustom2 = (message, data) => log("log", "custom", message, data);
  const dynamicLogger = {
    dev: (message, data) => log("dev", "custom", message, data),
    log: logMethodCustom2,
    info: (message, data) => log("info", "custom", message, data),
    warn: (message, data) => log("warn", "custom", message, data),
    error: (message, data) => log("error", "custom", message, data),
    fatal: (message, data) => log("fatal", "custom", message, data),
    debug: (message, data) => {
      warnDebugDeprecated();
      logMethodCustom2(message, data);
    },
    _schema: _schemaCache,
    _categories: categoryKeys
  };
  for (const key of categoryKeys) {
    const logMethodCat = (message, data) => log("log", key, message, data);
    dynamicLogger[key] = {
      dev: (message, data) => log("dev", key, message, data),
      log: logMethodCat,
      info: (message, data) => log("info", key, message, data),
      warn: (message, data) => log("warn", key, message, data),
      error: (message, data) => log("error", key, message, data),
      fatal: (message, data) => log("fatal", key, message, data),
      debug: (message, data) => {
        warnDebugDeprecated();
        logMethodCat(message, data);
      }
    };
  }
  return dynamicLogger;
}
var _originalConsoleLog, LEVEL_COLORS, LEVEL_EMOJI, CATEGORY_EMOJI, RESET, BOLD, DIM, _debugDeprecationWarningShown, _schemaCache, _categoryMap, logMethodCustom, logger;
var init_logger = __esm({
  "src/logger.ts"() {
    "use strict";
    init_types();
    init_config();
    init_transport();
    init_sanitize();
    init_request_context();
    _originalConsoleLog = console.log.bind(console);
    LEVEL_COLORS = {
      dev: "\x1B[35m",
      // magenta - wyraźny dla dev
      log: "\x1B[90m",
      // gray (dawny debug)
      info: "\x1B[36m",
      // cyan
      warn: "\x1B[33m",
      // yellow
      error: "\x1B[31m",
      // red
      fatal: "\x1B[35m"
      // magenta
    };
    LEVEL_EMOJI = {
      dev: "\u{1F6E0}\uFE0F",
      log: "\u{1F50D}",
      info: "\u{1F4CB}",
      warn: "\u26A0\uFE0F",
      error: "\u274C",
      fatal: "\u{1F480}"
    };
    CATEGORY_EMOJI = {
      auth: "\u{1F510}",
      api: "\u{1F4E1}",
      security: "\u{1F6E1}\uFE0F",
      db: "\u{1F4BE}",
      middleware: "\u{1F504}",
      console: "\u{1F4DD}",
      fetch: "\u{1F310}",
      error: "\u274C",
      custom: "\u{1F4CB}",
      flow: "\u{1F504}"
    };
    RESET = "\x1B[0m";
    BOLD = "\x1B[1m";
    DIM = "\x1B[2m";
    _debugDeprecationWarningShown = false;
    _schemaCache = null;
    _categoryMap = /* @__PURE__ */ new Map();
    logMethodCustom = (message, data) => log("log", "custom", message, data);
    logger = {
      // Podstawowe metody (używają kategorii 'custom')
      dev: (message, data) => log("dev", "custom", message, data),
      log: logMethodCustom,
      info: (message, data) => log("info", "custom", message, data),
      warn: (message, data) => log("warn", "custom", message, data),
      error: (message, data) => log("error", "custom", message, data),
      fatal: (message, data) => log("fatal", "custom", message, data),
      /** @deprecated Użyj .log() */
      debug: (message, data) => {
        warnDebugDeprecated();
        logMethodCustom(message, data);
      },
      // Loggery dla konkretnych kategorii
      auth: createCategoryLogger("auth"),
      api: createCategoryLogger("api"),
      security: createCategoryLogger("security"),
      db: createCategoryLogger("db"),
      middleware: createCategoryLogger("middleware")
    };
  }
});

// src/integrations/console.ts
function formatArgs(args) {
  return args.map((arg) => {
    if (typeof arg === "string") return arg;
    if (typeof arg === "object") {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }
    return String(arg);
  }).join(" ");
}
function extractCategoryFromPrefix(message) {
  if (!isLoggiInitialized()) return "console";
  const config = getConfig();
  for (const [prefix, category] of Object.entries(config.prefixMap)) {
    if (message.startsWith(prefix)) {
      return category;
    }
  }
  return "console";
}
function captureConsole() {
  if (isCaptured) return;
  isCaptured = true;
  originalConsole = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
    debug: console.debug
  };
  const methods = ["log", "info", "warn", "error", "debug"];
  for (const method of methods) {
    const original = originalConsole[method];
    console[method] = (...args) => {
      if (isLoggiInitialized()) {
        const config = getConfig();
        if (config.debug && config.consoleInDev) {
          original.apply(console, args);
        }
      } else {
        original.apply(console, args);
      }
      const message = formatArgs(args);
      if (message.includes("[LOGGI]")) return;
      const category = extractCategoryFromPrefix(message);
      const level = METHOD_TO_LEVEL[method];
      let data;
      const lastArg = args[args.length - 1];
      if (args.length > 1 && typeof lastArg === "object" && lastArg !== null && !Array.isArray(lastArg)) {
        data = lastArg;
      }
      log(level, category, message, data);
    };
  }
}
function restoreConsole() {
  if (!isCaptured || !originalConsole) return;
  console.log = originalConsole.log;
  console.info = originalConsole.info;
  console.warn = originalConsole.warn;
  console.error = originalConsole.error;
  console.debug = originalConsole.debug;
  originalConsole = null;
  isCaptured = false;
}
var originalConsole, isCaptured, METHOD_TO_LEVEL, rawConsole;
var init_console = __esm({
  "src/integrations/console.ts"() {
    "use strict";
    init_config();
    init_logger();
    originalConsole = null;
    isCaptured = false;
    METHOD_TO_LEVEL = {
      log: "log",
      // console.log -> poziom 'log'
      info: "info",
      warn: "warn",
      error: "error",
      debug: "log"
      // console.debug -> poziom 'log' (nie 'dev')
    };
    rawConsole = {
      log: (...args) => {
        (originalConsole?.log ?? console.log).apply(console, args);
      },
      info: (...args) => {
        (originalConsole?.info ?? console.info).apply(console, args);
      },
      warn: (...args) => {
        (originalConsole?.warn ?? console.warn).apply(console, args);
      },
      error: (...args) => {
        (originalConsole?.error ?? console.error).apply(console, args);
      },
      debug: (...args) => {
        (originalConsole?.debug ?? console.debug).apply(console, args);
      }
    };
  }
});

// src/integrations/fetch.ts
function extractUrl(input) {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === "object" && "url" in input) return input.url;
  return String(input);
}
function captureFetch() {
  if (isCaptured2) return;
  if (typeof globalThis.fetch !== "function") return;
  isCaptured2 = true;
  originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = extractUrl(input);
    const method = init?.method || "GET";
    if (url.includes("/api/logs/collect") || url.includes("/api/logs/stream")) {
      return originalFetch(input, init);
    }
    const start = Date.now();
    const requestId = getRequestId();
    try {
      const response = await originalFetch(input, init);
      if (isLoggiInitialized()) {
        log("info", "fetch", `${method} ${url}`, {
          requestUrl: url,
          requestMethod: method,
          requestStatus: response.status,
          requestDurationMs: Date.now() - start,
          requestId
        });
      }
      return response;
    } catch (error) {
      if (isLoggiInitialized()) {
        log("error", "fetch", `${method} ${url} FAILED`, {
          requestUrl: url,
          requestMethod: method,
          error: error instanceof Error ? error.message : String(error),
          requestDurationMs: Date.now() - start,
          requestId
        });
      }
      throw error;
    }
  };
}
function restoreFetch() {
  if (!isCaptured2 || !originalFetch) return;
  globalThis.fetch = originalFetch;
  originalFetch = null;
  isCaptured2 = false;
}
var originalFetch, isCaptured2;
var init_fetch = __esm({
  "src/integrations/fetch.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_request_context();
    originalFetch = null;
    isCaptured2 = false;
  }
});

// src/integrations/unhandled.ts
function captureUnhandled() {
  if (isRegistered) return;
  if (typeof process === "undefined") return;
  isRegistered = true;
  process.on("uncaughtException", (error) => {
    if (isLoggiInitialized()) {
      log("fatal", "error", `Uncaught Exception: ${error.message}`, {
        error: error.message,
        stack: error.stack,
        requestId: getRequestId()
      });
    }
  });
  process.on("unhandledRejection", (reason) => {
    if (isLoggiInitialized()) {
      const message = reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : void 0;
      log("error", "error", `Unhandled Promise Rejection: ${message}`, {
        error: message,
        stack,
        requestId: getRequestId()
      });
    }
  });
}
var isRegistered;
var init_unhandled = __esm({
  "src/integrations/unhandled.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_request_context();
    isRegistered = false;
  }
});

// src/config.ts
function getConfig() {
  if (!globalConfig) {
    throw new Error("[LOGGI] SDK not initialized. Call initLoggi() first.");
  }
  return globalConfig;
}
function isLoggiInitialized() {
  return isInitialized;
}
function autoDetectProjectSlug() {
  try {
    const pkg = require(process.cwd() + "/package.json");
    if (pkg.name) {
      return pkg.name.replace(/^@[^/]+\//, "");
    }
  } catch {
  }
  return "unknown";
}
function initLoggi(config) {
  if (isInitialized) {
    console.warn("[LOGGI] SDK already initialized. Skipping re-initialization.");
    return;
  }
  const cfg = config || {};
  const isDev = process.env.NODE_ENV === "development";
  const environment = cfg.environment || process.env.NODE_ENV || "development";
  const projectSlug = cfg.projectSlug || process.env.LOGGI_PROJECT_SLUG || autoDetectProjectSlug();
  const apiKey = cfg.apiKey || process.env.LOGGI_API_KEY || "";
  const endpoint = (cfg.endpoint || process.env.LOGGI_ENDPOINT || "http://localhost:3003").replace(/\/$/, "");
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
    batchTimeoutMs: cfg.batchTimeoutMs ?? 5e3,
    debug: cfg.debug ?? isDev,
    consoleInDev: cfg.consoleInDev ?? true,
    minLevel: cfg.minLevel ?? (isDev ? "log" : "info"),
    sensitiveKeys: cfg.sensitiveKeys ?? DEFAULT_SENSITIVE_KEYS,
    prefixMap: { ...DEFAULT_PREFIX_MAP, ...cfg.prefixMap },
    offlineMode
  };
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
  if (offlineMode) {
    console.log("[LOGGI] SDK initialized in OFFLINE mode (no API key)", {
      projectSlug: globalConfig.projectSlug,
      environment: globalConfig.environment
    });
  } else {
    if (globalConfig.debug) {
      console.log("[LOGGI] SDK initialized", {
        projectSlug: globalConfig.projectSlug,
        environment: globalConfig.environment,
        endpoint: globalConfig.endpoint,
        captureConsole: globalConfig.captureConsole,
        captureFetch: globalConfig.captureFetch,
        captureUnhandled: globalConfig.captureUnhandled
      });
    }
    Promise.resolve().then(() => (init_transport(), transport_exports)).then(({ initTransport: initTransport2 }) => {
      initTransport2().catch(() => {
      });
    });
  }
}
var globalConfig, isInitialized;
var init_config = __esm({
  "src/config.ts"() {
    "use strict";
    init_types();
    init_console();
    init_fetch();
    init_unhandled();
    globalConfig = null;
    isInitialized = false;
  }
});

// src/index.ts
var src_exports = {};
__export(src_exports, {
  _internalLog: () => log,
  captureConsole: () => captureConsole,
  captureFetch: () => captureFetch,
  captureUnhandled: () => captureUnhandled,
  createLogger: () => createLogger,
  createLoggerSync: () => createLoggerSync,
  createLoggi: () => createLoggi,
  createLoggiSync: () => createLoggiSync,
  fetchSchema: () => fetchSchema,
  flush: () => flush,
  getConfig: () => getConfig,
  getRequestId: () => getRequestId,
  initLoggi: () => initLoggi,
  initTransport: () => initTransport,
  isLoggiInitialized: () => isLoggiInitialized,
  isTransportOffline: () => isTransportOffline,
  logger: () => logger,
  rawConsole: () => rawConsole,
  resetOfflineMode: () => resetOfflineMode,
  restoreConsole: () => restoreConsole,
  restoreFetch: () => restoreFetch,
  runWithRequestId: () => runWithRequestId,
  sanitize: () => sanitize,
  sanitizeMessage: () => sanitizeMessage
});
module.exports = __toCommonJS(src_exports);
init_config();
init_logger();
init_transport();

// src/loggi.ts
init_types();
init_config();
init_transport();
init_sanitize();
init_request_context();
var RESET2 = "\x1B[0m";
var BOLD2 = "\x1B[1m";
var DIM2 = "\x1B[2m";
var LEVEL_CONFIG = {
  dev: { icon: "\u{1F6E0}\uFE0F", color: "\x1B[35m", label: " DEV " },
  // Magenta - wyraźny dla dev
  log: { icon: "\u{1F50D}", color: "\x1B[90m", label: " LOG " },
  // Gray - dawny debug
  info: { icon: "\u{1F4CB}", color: "\x1B[96m", label: "INFO " },
  warn: { icon: "\u26A0\uFE0F ", color: "\x1B[93m", label: "WARN " },
  error: { icon: "\u274C", color: "\x1B[91m", label: "ERROR" },
  fatal: { icon: "\u{1F480}", color: "\x1B[95m", label: "FATAL" }
};
var BASE_CATEGORY_CONFIG = {
  auth: { icon: "\u{1F510}", color: "\x1B[95m", name: "Autoryzacja" },
  api: { icon: "\u{1F310}", color: "\x1B[94m", name: "API" },
  security: { icon: "\u{1F6E1}\uFE0F", color: "\x1B[91m", name: "Bezpiecze\u0144stwo" },
  db: { icon: "\u{1F4BE}", color: "\x1B[93m", name: "BazaDanych" },
  flow: { icon: "\u{1F504}", color: "\x1B[35m", name: "Przep\u0142yw" }
};
var _schemaCache2 = null;
var _categoryMap2 = /* @__PURE__ */ new Map();
var _originalConsoleLog2 = console.log.bind(console);
function formatTimestamp() {
  const now = /* @__PURE__ */ new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
}
function formatData(data) {
  const entries = Object.entries(data).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(([k, v]) => {
    const formatted = typeof v === "object" ? JSON.stringify(v) : String(v);
    return `${DIM2}${k}${RESET2}=${formatted.length > 60 ? formatted.slice(0, 57) + "..." : formatted}`;
  });
  if (entries.length === 0) return "";
  return `
    ${DIM2}\u2514\u2500${RESET2} ${entries.join(` ${DIM2}\u2502${RESET2} `)}`;
}
function printToConsole2(level, category, message, data) {
  const levelCfg = LEVEL_CONFIG[level];
  const catSchema = _categoryMap2.get(category);
  const catConfig = BASE_CATEGORY_CONFIG[category] || {
    icon: catSchema?.icon || "\u{1F4CB}",
    color: catSchema?.ansiColor || "\x1B[37m",
    name: catSchema?.name || category
  };
  const timestamp = formatTimestamp();
  const categoryLabel = `${catConfig.name}(${category})`.padEnd(20);
  const prefix = `${DIM2}${timestamp}${RESET2} ${levelCfg.icon} ${levelCfg.color}${levelCfg.label}${RESET2} ${catConfig.icon} ${catConfig.color}${BOLD2}${categoryLabel}${RESET2}`;
  _originalConsoleLog2(prefix, message);
  if (data && Object.keys(data).length > 0) {
    const dataStr = formatData(data);
    if (dataStr) _originalConsoleLog2(dataStr);
  }
}
function log2(level, category, message, data) {
  if (!isLoggiInitialized()) {
    printToConsole2(level, category, message, data);
    return;
  }
  const config = getConfig();
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[config.minLevel]) {
    return;
  }
  const sanitizedData = sanitize(data, config.sensitiveKeys);
  const sanitizedMessage = sanitizeMessage(message);
  const entry = {
    timestamp: (/* @__PURE__ */ new Date()).toISOString(),
    level,
    category,
    source: "server",
    message: sanitizedMessage,
    data: sanitizedData,
    requestId: getRequestId(),
    projectSlug: config.projectSlug,
    environment: config.environment
  };
  if (config.debug && config.consoleInDev) {
    printToConsole2(level, category, message, data);
  }
  enqueue(entry);
}
function parseErrorArgs(errorOrData, data) {
  if (!errorOrData) return data;
  if (errorOrData instanceof Error) {
    return {
      ...data,
      error: {
        name: errorOrData.name,
        message: errorOrData.message,
        stack: errorOrData.stack
      }
    };
  }
  return errorOrData;
}
function extractFileFromStack() {
  const stack = new Error().stack;
  if (!stack) return "unknown";
  const lines = stack.split("\n");
  for (const line of lines) {
    if (line.includes("loggi.ts") || line.includes("logger.ts") || line.includes("at Error")) continue;
    const match = line.match(/\((.+):(\d+):(\d+)\)/) || line.match(/at (.+):(\d+):(\d+)/);
    if (match) {
      return `${match[1]}:${match[2]}`;
    }
  }
  return "unknown";
}
var _debugDeprecationWarningShown2 = false;
function createCategoryMethods(category) {
  const logMethod = (message, data) => log2("log", category, message, data);
  return {
    // Nowa metoda dev z dodatkowym kontekstem
    dev: (message, data) => {
      const devContext = {
        __dev: true,
        __file: extractFileFromStack(),
        __timestamp: typeof performance !== "undefined" ? performance.now() : Date.now(),
        __memory: typeof process !== "undefined" && process.memoryUsage ? process.memoryUsage().heapUsed : void 0
      };
      log2("dev", category, message, { ...data, ...devContext });
    },
    // Nowa metoda log (dawny debug)
    log: logMethod,
    info: (message, data) => log2("info", category, message, data),
    warn: (message, data) => log2("warn", category, message, data),
    error: (message, errorOrData, data) => log2("error", category, message, parseErrorArgs(errorOrData, data)),
    fatal: (message, errorOrData, data) => log2("fatal", category, message, parseErrorArgs(errorOrData, data)),
    // Deprecated alias - wyświetl ostrzeżenie przy pierwszym użyciu
    debug: (message, data) => {
      if (!_debugDeprecationWarningShown2) {
        console.warn("[LOGGI] \u26A0\uFE0F Metoda .debug() jest deprecated. U\u017Cyj .log() zamiast tego.");
        _debugDeprecationWarningShown2 = true;
      }
      logMethod(message, data);
    }
  };
}
function createFlowLogger() {
  const base = createCategoryMethods("flow");
  let currentRequestId = null;
  return {
    ...base,
    start: (flowName, data) => {
      currentRequestId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const border = "\u2500".repeat(40);
      _originalConsoleLog2(`
${DIM2}\u250C${border}${RESET2}`);
      log2("info", "flow", `${BOLD2}\u25B6\u25B6\u25B6 START: ${flowName}${RESET2}`, { ...data, requestId: currentRequestId });
      return currentRequestId;
    },
    step: (stepName, data) => {
      log2("log", "flow", `${DIM2}\u251C\u2500${RESET2} ${stepName}`, data);
    },
    end: (flowName, status, durationMs) => {
      const statusIcon = status === "success" ? "\u2705" : "\u274C";
      const statusColor = status === "success" ? "\x1B[92m" : "\x1B[91m";
      log2(
        status === "failure" ? "error" : "info",
        "flow",
        `${BOLD2}\u25C0\u25C0\u25C0 END: ${flowName} ${statusIcon} ${statusColor}[${status.toUpperCase()}]${RESET2}`,
        durationMs ? { durationMs } : void 0
      );
      const border = "\u2500".repeat(40);
      _originalConsoleLog2(`${DIM2}\u2514${border}${RESET2}
`);
      currentRequestId = null;
    }
  };
}
function createApiLogger() {
  const base = createCategoryMethods("api");
  const METHOD_COLORS = {
    GET: "\x1B[92m",
    POST: "\x1B[94m",
    PUT: "\x1B[93m",
    PATCH: "\x1B[33m",
    DELETE: "\x1B[91m"
  };
  return {
    ...base,
    request: (method, url, data) => {
      const methodColor = METHOD_COLORS[method] || "\x1B[37m";
      log2("log", "api", `\u25B6 ${methodColor}${method}${RESET2} ${url}`, data);
    },
    response: (method, url, status, durationMs, data) => {
      const level = status >= 400 ? "error" : status >= 300 ? "warn" : "info";
      const statusColor = status >= 400 ? "\x1B[91m" : status >= 300 ? "\x1B[93m" : "\x1B[92m";
      log2(level, "api", `\u25C0 ${method} ${url} \u2192 ${statusColor}${status}${RESET2}`, {
        durationMs,
        ...data ? { response: data } : {}
      });
    }
  };
}
function createSecurityLogger() {
  const base = createCategoryMethods("security");
  return {
    ...base,
    event: (eventType, status, data) => {
      const statusIcon = status === "success" ? "\u2705" : status === "failure" ? "\u{1F6AB}" : "\u26A0\uFE0F";
      const statusColor = status === "success" ? "\x1B[92m" : status === "failure" ? "\x1B[91m" : "\x1B[93m";
      const level = status === "failure" ? "error" : status === "warning" ? "warn" : "info";
      log2(level, "security", `${statusIcon} ${eventType} ${statusColor}[${status.toUpperCase()}]${RESET2}`, data);
    }
  };
}
async function fetchSchema2() {
  if (_schemaCache2) return _schemaCache2;
  if (!isLoggiInitialized()) {
    return null;
  }
  const config = getConfig();
  const schemaUrl = config.endpoint.replace("/api/logs/collect", `/api/log-schema/${config.projectSlug}`);
  try {
    const response = await fetch(schemaUrl, {
      headers: { "X-API-Key": config.apiKey }
    });
    if (!response.ok) {
      if (config.debug) {
        console.warn(`[LOGGI] Failed to fetch schema: ${response.status}`);
      }
      return null;
    }
    const schema = await response.json();
    _schemaCache2 = schema;
    _categoryMap2.clear();
    for (const cat of schema.categories) {
      _categoryMap2.set(cat.key, cat);
    }
    if (config.debug) {
      console.log(`[LOGGI] Schema loaded: ${schema.categories.length} categories`);
    }
    return schema;
  } catch (err) {
    if (config.debug) {
      console.warn("[LOGGI] Failed to fetch schema:", err);
    }
    return null;
  }
}
var _unknownCategoryWarnings = /* @__PURE__ */ new Set();
function createExtraProxy(knownCategories) {
  return new Proxy(knownCategories, {
    get: (target, prop) => {
      if (typeof prop === "symbol" || prop.startsWith("_")) {
        return void 0;
      }
      if (prop in target) {
        return target[prop];
      }
      if (!_unknownCategoryWarnings.has(prop)) {
        _unknownCategoryWarnings.add(prop);
        _originalConsoleLog2(
          `[LOGGI] \u26A0\uFE0F Unknown category "${prop}" - logs will be saved with category "unknown". Add this category in loggi-app dashboard or use a base category (auth, api, security, db, flow).`
        );
      }
      return createUnknownCategoryMethods(prop);
    }
  });
}
function createUnknownCategoryMethods(originalCategory) {
  const logWithUnknown = (level, message, data) => {
    log2(level, "custom", message, {
      ...data,
      _unknownCategory: originalCategory,
      _categoryWarning: `Category "${originalCategory}" is not defined in loggi-app`
    });
  };
  return {
    dev: (message, data) => logWithUnknown("dev", message, data),
    log: (message, data) => logWithUnknown("log", message, data),
    info: (message, data) => logWithUnknown("info", message, data),
    warn: (message, data) => logWithUnknown("warn", message, data),
    error: (message, errorOrData, data) => logWithUnknown("error", message, parseErrorArgs(errorOrData, data)),
    fatal: (message, errorOrData, data) => logWithUnknown("fatal", message, parseErrorArgs(errorOrData, data)),
    debug: (message, data) => logWithUnknown("log", message, data)
  };
}
async function createLoggi() {
  const schema = await fetchSchema2();
  const projectCategories = schema?.categories.filter((c) => !c.isBase).map((c) => c.key) || [];
  const knownExtra = {};
  for (const key of projectCategories) {
    knownExtra[key] = createCategoryMethods(key);
  }
  const extraProxy = createExtraProxy(knownExtra);
  const loggiInstance = {
    // Bazowe
    auth: createCategoryMethods("auth"),
    api: createApiLogger(),
    security: createSecurityLogger(),
    db: createCategoryMethods("db"),
    flow: createFlowLogger(),
    // Projektowe (z Proxy dla nieznanych)
    extra: extraProxy,
    // Metadane
    _schema: schema,
    _projectCategories: projectCategories,
    // Refresh
    refresh: async () => {
      _schemaCache2 = null;
      const newSchema = await fetchSchema2();
      if (newSchema) {
        const newProjectCategories = newSchema.categories.filter((c) => !c.isBase).map((c) => c.key);
        for (const key of newProjectCategories) {
          if (!(key in knownExtra)) {
            knownExtra[key] = createCategoryMethods(key);
          }
        }
        loggiInstance._schema = newSchema;
        loggiInstance._projectCategories = newProjectCategories;
      }
    }
  };
  return loggiInstance;
}
function createLoggiSync(projectCategories = []) {
  const knownExtra = {};
  for (const key of projectCategories) {
    knownExtra[key] = createCategoryMethods(key);
  }
  const extraProxy = createExtraProxy(knownExtra);
  return {
    auth: createCategoryMethods("auth"),
    api: createApiLogger(),
    security: createSecurityLogger(),
    db: createCategoryMethods("db"),
    flow: createFlowLogger(),
    extra: extraProxy,
    _schema: _schemaCache2,
    _projectCategories: projectCategories,
    refresh: async () => {
      await fetchSchema2();
    }
  };
}

// src/index.ts
init_console();
init_fetch();
init_unhandled();
init_request_context();
init_sanitize();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  _internalLog,
  captureConsole,
  captureFetch,
  captureUnhandled,
  createLogger,
  createLoggerSync,
  createLoggi,
  createLoggiSync,
  fetchSchema,
  flush,
  getConfig,
  getRequestId,
  initLoggi,
  initTransport,
  isLoggiInitialized,
  isTransportOffline,
  logger,
  rawConsole,
  resetOfflineMode,
  restoreConsole,
  restoreFetch,
  runWithRequestId,
  sanitize,
  sanitizeMessage
});
//# sourceMappingURL=index.js.map