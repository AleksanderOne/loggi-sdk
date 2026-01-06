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

// src/next/request-context.ts
function generateRequestId(prefix = "req") {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${timestamp}_${random}`;
}
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

// src/types.ts
var LEVEL_PRIORITY;
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
  }
});

// src/transport.ts
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
var queue, flushTimer, isShuttingDown, isOffline, consecutiveFailures, MAX_FAILURES_BEFORE_OFFLINE, isRetrying, retryTimer, connectionEstablished;
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
    isRetrying = false;
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
var _originalConsoleLog, LEVEL_COLORS, LEVEL_EMOJI, CATEGORY_EMOJI, RESET, BOLD, DIM, _debugDeprecationWarningShown, _categoryMap, logMethodCustom, logger;
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
var init_console = __esm({
  "src/integrations/console.ts"() {
    "use strict";
    init_config();
    init_logger();
  }
});

// src/integrations/fetch.ts
var init_fetch = __esm({
  "src/integrations/fetch.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_request_context();
  }
});

// src/integrations/unhandled.ts
var init_unhandled = __esm({
  "src/integrations/unhandled.ts"() {
    "use strict";
    init_config();
    init_logger();
    init_request_context();
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

// src/next/index.ts
var next_exports = {};
__export(next_exports, {
  createLoggingMiddleware: () => createLoggingMiddleware,
  getRequestId: () => getRequestId,
  runWithRequestId: () => runWithRequestId,
  withLogging: () => withLogging
});
module.exports = __toCommonJS(next_exports);
init_request_context();

// src/next/middleware.ts
var import_server = require("next/server");
init_request_context();
init_config();
init_logger();
function withLogging(handler) {
  return async (request, context) => {
    const start = Date.now();
    const method = request.method;
    const url = request.nextUrl.pathname;
    const requestId = generateRequestId();
    return runWithRequestId(requestId, async () => {
      try {
        const response = await handler(request, context);
        if (isLoggiInitialized()) {
          log("info", "api", `${method} ${url}`, {
            requestUrl: url,
            requestMethod: method,
            requestStatus: response.status,
            requestDurationMs: Date.now() - start,
            requestId
          });
        }
        if (requestId) {
          response.headers.set("X-Request-Id", requestId);
        }
        return response;
      } catch (error) {
        if (isLoggiInitialized()) {
          log("error", "api", `${method} ${url} FAILED`, {
            requestUrl: url,
            requestMethod: method,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : void 0,
            requestDurationMs: Date.now() - start,
            requestId
          });
        }
        throw error;
      }
    });
  };
}
function createLoggingMiddleware() {
  return async (request) => {
    const start = Date.now();
    const method = request.method;
    const url = request.nextUrl.pathname;
    const requestId = crypto.randomUUID();
    if (isLoggiInitialized()) {
      log("log", "middleware", `${method} ${url}`, {
        requestUrl: url,
        requestMethod: method,
        requestId,
        userAgent: request.headers.get("user-agent") || void 0
      });
    }
    const response = import_server.NextResponse.next();
    response.headers.set("X-Request-Id", requestId);
    return response;
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createLoggingMiddleware,
  getRequestId,
  runWithRequestId,
  withLogging
});
//# sourceMappingURL=index.js.map