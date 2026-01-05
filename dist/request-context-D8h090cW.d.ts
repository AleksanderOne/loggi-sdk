/**
 * Pobierz aktualny request ID (lub undefined jeśli nie ma kontekstu)
 */
declare function getRequestId(): string | undefined;
/**
 * Uruchom funkcję w kontekście requestu
 */
declare function runWithRequestId<T>(requestId: string, fn: () => T): T;

export { getRequestId as g, runWithRequestId as r };
