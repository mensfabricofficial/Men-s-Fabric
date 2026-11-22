const EVICTABLE_BACKUP_KEYS = [
  'selvee_stock_movements_v1',
  'selvee_banners_catalog_v3',
  'mf_placed_orders_v2',
  'selvee_products_catalog_v3',
  'selvee_categories_catalog_v3',
  'selvee_site_settings_v3',
  'selvee_delivery_zones_v3',
  'selvee_coupons_catalog_v3',
  'selvee_notifications_cache_v1',
  'mf_pos_purchases_v1',
  'mf_pos_expenses_v1',
  'mf_pos_sales_returns_v1',
  'mf_pos_held_sales_v1',
  'mf_crm_customers_v1',
  'mf_pos_suppliers_v1',
  'mf_pos_sales_targets_v1',
  'mf_pos_target_archives_v1',
  'mf_staff_activity_logs_v1',
  'mf_size_guides_v1',
];

const isFirestoreInternalStorageKey = (key: string): boolean =>
  key.startsWith('firestore_') || key.includes('WebStorageSharedClientState');

export const cleanupFirestoreAndBloatStorage = (): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    let totalChars = 0;

    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (isFirestoreInternalStorageKey(key)) {
        keysToRemove.push(key);
        continue;
      }
      const val = window.localStorage.getItem(key) || '';
      totalChars += val.length;
      if (EVICTABLE_BACKUP_KEYS.includes(key) && val.length > 450_000) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach((k) => {
      try {
        window.localStorage.removeItem(k);
      } catch {
        // ignore
      }
    });

    // If total usage still exceeds ~2.5MB, trim evictable caches proactively
    if (totalChars > 2_500_000) {
      for (const k of EVICTABLE_BACKUP_KEYS) {
        try {
          window.localStorage.removeItem(k);
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // ignore storage access issues
  }
};

export const stripLargeInlineData = <T>(value: T, depth = 0): T => {
  if (depth > 8 || value === null || value === undefined) return value;
  if (typeof value === 'string') {
    if (value.startsWith('data:') && value.length > 1024) {
      return '' as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => stripLargeInlineData(item, depth + 1)) as unknown as T;
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = stripLargeInlineData(v, depth + 1);
    }
    return result as T;
  }
  return value;
};

export const evictBulkyCaches = (excludeKey?: string): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k) keys.push(k);
    }
    for (const k of keys) {
      if (isFirestoreInternalStorageKey(k)) {
        window.localStorage.removeItem(k);
      }
    }
    for (const k of EVICTABLE_BACKUP_KEYS) {
      if (k !== excludeKey) {
        window.localStorage.removeItem(k);
      }
    }
  } catch {
    // ignore
  }
};

export const safeSetLocalStorage = (
  key: string,
  value: unknown,
  options?: { stripInlineData?: boolean; maxChars?: number }
): void => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  const maxChars = options?.maxChars ?? 400_000;
  try {
    const prepared = options?.stripInlineData ? stripLargeInlineData(value) : value;
    const serialized = typeof prepared === 'string' ? prepared : JSON.stringify(prepared);
    if (serialized.length > maxChars) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        // ignore
      }
      return;
    }
    try {
      window.localStorage.setItem(key, serialized);
    } catch {
      evictBulkyCaches(key);
      try {
        window.localStorage.setItem(key, serialized);
      } catch {
        // ignore quota errors safely
      }
    }
  } catch {
    // ignore serialization/storage errors
  }
};
