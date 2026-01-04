import { AsyncLocalStorage } from 'async_hooks';

/**
 * Kontekst requestu - przechowuje requestId przez cały cykl życia requestu
 */
interface RequestContext {
    requestId: string;
    startTime: number;
}

/**
 * AsyncLocalStorage do przechowywania kontekstu requestu
 */
const storage = new AsyncLocalStorage<RequestContext>();

/**
 * Generuj unikalny request ID
 */
export function generateRequestId(prefix: string = 'req'): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 10);
    return `${prefix}_${timestamp}_${random}`;
}

/**
 * Pobierz aktualny request ID (lub undefined jeśli nie ma kontekstu)
 */
export function getRequestId(): string | undefined {
    return storage.getStore()?.requestId;
}

/**
 * Pobierz czas trwania requestu w ms
 */
export function getRequestDuration(): number | undefined {
    const store = storage.getStore();
    return store ? Date.now() - store.startTime : undefined;
}

/**
 * Uruchom funkcję w kontekście requestu
 */
export function runWithRequestId<T>(requestId: string, fn: () => T): T {
    return storage.run({ requestId, startTime: Date.now() }, fn);
}

/**
 * Uruchom async funkcję w kontekście requestu
 */
export async function runWithRequestIdAsync<T>(requestId: string, fn: () => Promise<T>): Promise<T> {
    return storage.run({ requestId, startTime: Date.now() }, fn);
}
