/**
 * Recursively sanitizes any object or array destined for Firestore,
 * ensuring no field contains an `undefined` value which triggers:
 * "Unsupported field value: undefined"
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return null as any;
  }

  // Primitives
  if (typeof data !== 'object') {
    return data;
  }

  // Preserve Firestore internal objects (FieldValue, serverTimestamp, Timestamp) and Dates
  if (
    data instanceof Date ||
    (data as any)._methodName ||
    (data as any).constructor?.name === 'FieldValue' ||
    (data as any).constructor?.name === 'Timestamp'
  ) {
    return data;
  }

  // Arrays
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as any;
  }

  // Plain objects
  const result: any = {};
  for (const key of Object.keys(data as any)) {
    const value = (data as any)[key];
    if (value !== undefined) {
      result[key] = sanitizeForFirestore(value);
    }
  }
  return result;
}
