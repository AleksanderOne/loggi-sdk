# Loggi SDK

Centralny system logowania dla aplikacji Next.js.

## Quick Start

### 1. Instalacja

```bash
# npm link (development)
cd loggi-sdk && npm link
cd ../my-app && npm link loggi-sdk

# lub bezpośrednio w package.json
"dependencies": {
  "loggi-sdk": "file:../loggi-sdk"
}
```

### 2. Konfiguracja env

```bash
# .env
LOGGI_API_KEY=pk_xxx
LOGGI_ENDPOINT=http://localhost:3003  # opcjonalne (domyślnie localhost:3003)
LOGGI_PROJECT_SLUG=my-app             # opcjonalne (auto z package.json#name)
```

### 3. Inicjalizacja

```typescript
// instrumentation.ts
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { initLoggi } = await import('loggi-sdk');
    initLoggi(); // Auto-konfiguracja z env i package.json
  }
}
```

**To wszystko!** SDK automatycznie:
- Wykrywa `projectSlug` z `package.json` gdy brak env
- Używa domyślnego endpointu `http://localhost:3003`
- Przechodzi w offline mode gdy brak API key lub loggi-app niedostępne

## Użycie

```typescript
import { createLoggiSync } from 'loggi-sdk';

const loggi = createLoggiSync();

// Bazowe kategorie (zawsze dostępne)
loggi.auth.info('User logged in', { userId });
loggi.api.request('GET', '/users');
loggi.security.event('rate_limit', 'warning', { ip });
loggi.db.error('Connection failed', { error });
loggi.flow.start('Token Exchange');

// Poziomy logowania
loggi.auth.dev('Debug info', { step: 1 });  // Development only
loggi.auth.log('Standard log');
loggi.auth.info('Information');
loggi.auth.warn('Warning');
loggi.auth.error('Error', new Error('oops'));
loggi.auth.fatal('Critical error');
```

### Kategorie projektowe

```typescript
// Z definicją kategorii
const loggi = createLoggiSync(['project', 'policy', 'member']);

loggi.extra.project.info('Project created', { projectId });
loggi.extra.policy.warn('Policy violation');
loggi.extra.member.log('Member added');

// Nieznane kategorie - działają z ostrzeżeniem
loggi.extra.unknownCategory.info('This works but shows warning');
```

### Specjalne loggery

```typescript
// Flow logger - do śledzenia przepływu
const requestId = loggi.flow.start('Token Exchange');
loggi.flow.step('Validating code');
loggi.flow.step('Fetching user');
loggi.flow.end('Token Exchange', 'success', 150);

// API logger - request/response
loggi.api.request('POST', '/api/token', { userId });
loggi.api.response('POST', '/api/token', 200, 45);

// Security logger - eventy bezpieczeństwa
loggi.security.event('rate_limit', 'warning', { ip, count: 10 });
loggi.security.event('login_failed', 'failure', { email });
```

## Tryby pracy

| Tryb | Konsola | Loggi-App | Warunek |
|------|---------|-----------|---------|
| Development | ✅ | ✅ | `NODE_ENV=development` |
| Production | ❌ | ✅ | `NODE_ENV=production` |
| Offline | ✅ | ❌ | Brak `LOGGI_API_KEY` lub loggi-app niedostępne |

### Graceful Degradation

SDK automatycznie przechodzi w tryb offline gdy:
- Brak `LOGGI_API_KEY` w env
- Loggi-app jest niedostępne (po 3 nieudanych próbach)

W trybie offline:
- **Development**: logi wyświetlane w konsoli
- **Production**: ciche działanie (brak logów, aplikacja działa normalnie)

## Browser SDK (loggi.js)

```html
<!-- Opcja 1: data-api-key -->
<script src="https://loggi-app.vercel.app/loggi.js" data-api-key="pk_xxx" async></script>

<!-- Opcja 2: meta tagi -->
<meta name="loggi-api-key" content="pk_xxx">
<meta name="loggi-endpoint" content="http://localhost:3003">
<script src="/loggi.js" async></script>

<!-- Opcja 3: Next.js ze zmiennymi env -->
<script
  src="/loggi.js"
  data-api-key={process.env.NEXT_PUBLIC_LOGGI_API_KEY}
  async
/>
```

### Browser API

```javascript
// Manualny tracking
window.Loggi.track('button_click', { buttonId: 'submit' });
window.Loggi.error('Something went wrong', { context: 'form' });
window.Loggi.info('Page loaded');

// Status
window.Loggi.isOffline();   // true gdy brak API key
window.Loggi.isEncrypted(); // true gdy E2E encryption
```

## Konfiguracja zaawansowana

```typescript
import { initLoggi } from 'loggi-sdk';

initLoggi({
  // Wymagane (lub z env)
  apiKey: 'pk_xxx',

  // Opcjonalne
  endpoint: 'https://loggi.example.com',
  projectSlug: 'my-app',
  environment: 'production',

  // Auto-capture (domyślnie: true)
  captureConsole: true,   // Przechwytuj console.*
  captureFetch: true,     // Przechwytuj fetch()
  captureUnhandled: true, // Przechwytuj uncaught errors

  // Batching
  batchSize: 10,          // Logi w jednym batchu
  batchTimeoutMs: 5000,   // Max czas przed flush

  // Dev mode
  debug: true,            // Więcej logów SDK
  consoleInDev: true,     // Logi też w konsoli

  // Filtering
  minLevel: 'info',       // Minimalny poziom ('dev', 'log', 'info', 'warn', 'error', 'fatal')

  // Sanityzacja
  sensitiveKeys: ['password', 'token', 'secret'],
});
```

## Bazowe kategorie

| Kategoria | Opis | Przykłady |
|-----------|------|-----------|
| `auth` | Autentykacja, sesje | login, logout, token refresh |
| `api` | Wywołania API | request, response, timeout |
| `security` | Bezpieczeństwo | rate limit, CSRF, validation |
| `db` | Baza danych | query, connection, migration |
| `flow` | Przepływ operacji | start/step/end workflow |

## Migracja z console.log

```typescript
// PRZED
console.log('[AUTH] User logged in', { userId });
console.error('[API] Request failed', error);

// PO
import { createLoggiSync } from 'loggi-sdk';
const loggi = createLoggiSync();

loggi.auth.info('User logged in', { userId });
loggi.api.error('Request failed', error);
```

## API Reference

### initLoggi(config?)
Inicjalizuje SDK. Wywołaj raz w `instrumentation.ts`.

### createLoggiSync(categories?)
Tworzy synchroniczną instancję loggera.

### createLoggi()
Tworzy asynchroniczną instancję z pobieraniem schematu kategorii z API.

### flush()
Natychmiastowe wysłanie zakolejkowanych logów.

### isTransportOffline()
Sprawdza czy SDK jest w trybie offline.

### resetOfflineMode()
Resetuje tryb offline (próba ponownego połączenia).
