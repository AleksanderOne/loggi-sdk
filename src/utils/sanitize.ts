/**
 * Rekurencyjnie sanityzuje obiekt, ukrywając wrażliwe dane
 */
export function sanitize(
    data: Record<string, unknown> | undefined,
    sensitiveKeys: string[]
): Record<string, unknown> | undefined {
    if (!data) return undefined;

    const result: Record<string, unknown> = {};
    const lowercaseKeys = sensitiveKeys.map(k => k.toLowerCase());

    for (const [key, value] of Object.entries(data)) {
        const keyLower = key.toLowerCase();

        // Sprawdź czy klucz jest wrażliwy
        if (lowercaseKeys.some(sk => keyLower.includes(sk))) {
            result[key] = '[REDACTED]';
        } else if (value && typeof value === 'object' && !Array.isArray(value)) {
            // Rekurencyjnie sanityzuj zagnieżdżone obiekty
            result[key] = sanitize(value as Record<string, unknown>, sensitiveKeys);
        } else if (Array.isArray(value)) {
            // Sanityzuj elementy tablicy
            result[key] = value.map(item =>
                item && typeof item === 'object'
                    ? sanitize(item as Record<string, unknown>, sensitiveKeys)
                    : item
            );
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * Sanityzuje string message - ukrywa tokeny i hasła
 */
export function sanitizeMessage(message: string): string {
    // Ukryj tokeny JWT
    let sanitized = message.replace(
        /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]*/g,
        '[JWT_TOKEN]'
    );

    // Ukryj Bearer tokens
    sanitized = sanitized.replace(
        /Bearer\s+[A-Za-z0-9-_.]+/gi,
        'Bearer [TOKEN]'
    );

    // Ukryj hasła w formatach key=value
    sanitized = sanitized.replace(
        /(password|secret|token|apikey|api_key)[\s]*[=:]\s*["']?[^"'\s,}]+["']?/gi,
        '$1=[REDACTED]'
    );

    return sanitized;
}
