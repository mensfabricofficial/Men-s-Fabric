import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { safeSetLocalStorage } from '../utils/safeStorage';
import {
  Supplier,
  PurchaseEntry,
  ExpenseEntry,
  PartnerDeskConfig,
  Product,
  SalesTargetsConfig,
  SalesReturnEntry,
  SalesReturnItem,
  TargetArchiveRecord,
  HeldPosSale,
  CustomerProfile,
  CustomerPaymentLog,
  PaymentMethod,
  Order,
} from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { isFirestoreWriteBackedOff, markFirestoreWriteError } from '../lib/firestoreWriteGuard';
import { productService } from './productService';

const LOCAL_SUPPLIERS_KEY = 'mf_pos_suppliers_v1';
const LOCAL_PURCHASES_KEY = 'mf_pos_purchases_v1';
const LOCAL_EXPENSES_KEY = 'mf_pos_expenses_v1';
const LOCAL_PARTNERS_KEY = 'mf_partner_desks_v1';
const LOCAL_TARGETS_KEY = 'mf_pos_sales_targets_v1';
const LOCAL_RETURNS_KEY = 'mf_pos_sales_returns_v1';
const LOCAL_TARGET_ARCHIVES_KEY = 'mf_pos_target_archives_v1';
const LOCAL_HELD_SALES_KEY = 'mf_pos_held_sales_v1';
const LOCAL_CRM_CUSTOMERS_KEY = 'mf_crm_customers_v1';

const LEDGER_DOC = doc(db, 'settings', 'pos_ledger');
const PARTNERS_DOC = doc(db, 'settings', 'partnerPipeline');
const TARGETS_DOC = doc(db, 'settings', 'sales_targets');
const TARGET_ARCHIVES_DOC = doc(db, 'settings', 'target_archives');

export const DEFAULT_SALES_TARGETS: SalesTargetsConfig = {
  dailyAmountTarget: 25000,
  dailyPcsTarget: 20,
  dailyProfitTarget: 6000,
  dailyOrderTarget: 15,
  monthlyAmountTarget: 600000,
  monthlyPcsTarget: 500,
  monthlyProfitTarget: 150000,
  monthlyOrderTarget: 400,
  lowStockThresholdDefault: 5,
};

export const DEFAULT_PARTNER_DESKS: PartnerDeskConfig[] = [
  {
    stage: 'order_verification',
    partnerName: 'Order Verify Desk',
    roleTitle: 'Customer Information & Initial Payment Verification',
    partnerEmail: '',
    partnerPhone: '',
  },
  {
    stage: 'payment_verification',
    partnerName: 'Payment Verify Desk',
    roleTitle: 'Payment & Finance Verification',
    partnerEmail: '',
    partnerPhone: '',
  },
  {
    stage: 'inventory_packing',
    partnerName: 'Stock Verify Desk',
    roleTitle: 'Stock Verification & Stock Update',
    partnerEmail: '',
    partnerPhone: '',
  },
  {
    stage: 'delivery_dispatch',
    partnerName: 'Delivery Desk',
    roleTitle: 'Packing & Delivery',
    partnerEmail: '',
    partnerPhone: '',
  },
];

const readLocalList = <T,>(key: string, fallback: T[] = []): T[] => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore
  }
  return fallback;
};

const withTimeout = <T,>(promise: Promise<T>, ms = 3000): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Sync timeout')), ms)),
  ]);

let ledgerWriteChain: Promise<void> = Promise.resolve();

const syncLedgerMirror = (partial: {
  suppliers?: Supplier[];
  purchases?: PurchaseEntry[];
  expenses?: ExpenseEntry[];
  targets?: SalesTargetsConfig;
  returns?: SalesReturnEntry[];
  heldSales?: HeldPosSale[];
  crmCustomers?: CustomerProfile[];
}) => {
  if (isFirestoreWriteBackedOff()) return Promise.resolve();
  ledgerWriteChain = ledgerWriteChain.then(async () => {
    if (isFirestoreWriteBackedOff()) return;
    try {
      await setDoc(
        LEDGER_DOC,
        sanitizeForFirestore({
          ...partial,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    } catch (err) {
      markFirestoreWriteError(err);
    }
  });
  return ledgerWriteChain;
};

// Shared singleton live state (never emits stale localStorage before Firestore onSnapshot)
let liveTargets: SalesTargetsConfig | null = null;
let livePartnerDesks: PartnerDeskConfig[] | null = null;
let liveSuppliers: Supplier[] | null = null;
let livePurchases: PurchaseEntry[] | null = null;
let liveExpenses: ExpenseEntry[] | null = null;
let liveReturns: SalesReturnEntry[] | null = null;
let liveTargetArchives: TargetArchiveRecord[] | null = null;
let liveHeldSales: HeldPosSale[] | null = null;
let liveCrmCustomers: CustomerProfile[] | null = null;
let liveRegisteredUsers: Array<Partial<CustomerProfile>> | null = null;

const targetsListeners = new Set<(targets: SalesTargetsConfig) => void>();
const partnerDesksListeners = new Set<(desks: PartnerDeskConfig[]) => void>();
const suppliersListeners = new Set<(list: Supplier[]) => void>();
const purchasesListeners = new Set<(list: PurchaseEntry[]) => void>();
const expensesListeners = new Set<(list: ExpenseEntry[]) => void>();
const returnsListeners = new Set<(list: SalesReturnEntry[]) => void>();
const targetArchivesListeners = new Set<(list: TargetArchiveRecord[]) => void>();
const heldSalesListeners = new Set<(list: HeldPosSale[]) => void>();
const crmCustomersListeners = new Set<(list: CustomerProfile[]) => void>();
const registeredUsersListeners = new Set<(list: Array<Partial<CustomerProfile>>) => void>();

let sharedLedgerUnsub: Unsubscribe | null = null;
let sharedTargetsUnsub: Unsubscribe | null = null;
let sharedPartnersUnsub: Unsubscribe | null = null;
let sharedArchivesUnsub: Unsubscribe | null = null;
let sharedUsersUnsub: Unsubscribe | null = null;
let targetsDocHasAuthoritativeData = false;

const writeBackupList = <T,>(key: string, list: T[]) => {
  safeSetLocalStorage(key, list.slice(0, 150), {
    stripInlineData: true,
    maxChars: 200_000,
  });
};

const ensureSharedLedgerListener = () => {
  if (sharedLedgerUnsub) return;
  try {
    sharedLedgerUnsub = onSnapshot(
      LEDGER_DOC,
      (snap) => {
        const data = snap.exists() ? snap.data() : null;

        if (data && Array.isArray(data.suppliers)) {
          liveSuppliers = data.suppliers as Supplier[];
          writeBackupList(LOCAL_SUPPLIERS_KEY, liveSuppliers);
          suppliersListeners.forEach((cb) => cb(liveSuppliers!));
        } else if (liveSuppliers === null) {
          liveSuppliers = [];
          suppliersListeners.forEach((cb) => cb([]));
        }

        if (data && Array.isArray(data.purchases)) {
          livePurchases = data.purchases as PurchaseEntry[];
          writeBackupList(LOCAL_PURCHASES_KEY, livePurchases);
          purchasesListeners.forEach((cb) => cb(livePurchases!));
        } else if (livePurchases === null) {
          livePurchases = [];
          purchasesListeners.forEach((cb) => cb([]));
        }

        if (data && Array.isArray(data.expenses)) {
          liveExpenses = data.expenses as ExpenseEntry[];
          writeBackupList(LOCAL_EXPENSES_KEY, liveExpenses);
          expensesListeners.forEach((cb) => cb(liveExpenses!));
        } else if (liveExpenses === null) {
          liveExpenses = [];
          expensesListeners.forEach((cb) => cb([]));
        }

        if (data && Array.isArray(data.returns)) {
          liveReturns = data.returns as SalesReturnEntry[];
          writeBackupList(LOCAL_RETURNS_KEY, liveReturns);
          returnsListeners.forEach((cb) => cb(liveReturns!));
        } else if (liveReturns === null) {
          liveReturns = [];
          returnsListeners.forEach((cb) => cb([]));
        }

        if (data && Array.isArray(data.heldSales)) {
          liveHeldSales = data.heldSales as HeldPosSale[];
          writeBackupList(LOCAL_HELD_SALES_KEY, liveHeldSales);
          heldSalesListeners.forEach((cb) => cb(liveHeldSales!));
        } else if (liveHeldSales === null) {
          liveHeldSales = [];
          heldSalesListeners.forEach((cb) => cb([]));
        }

        if (data && Array.isArray(data.crmCustomers)) {
          liveCrmCustomers = data.crmCustomers as CustomerProfile[];
          writeBackupList(LOCAL_CRM_CUSTOMERS_KEY, liveCrmCustomers);
          crmCustomersListeners.forEach((cb) => cb(liveCrmCustomers!));
        } else if (liveCrmCustomers === null) {
          liveCrmCustomers = [];
          crmCustomersListeners.forEach((cb) => cb([]));
        }

        if (!targetsDocHasAuthoritativeData && data?.targets) {
          liveTargets = { ...DEFAULT_SALES_TARGETS, ...(data.targets as SalesTargetsConfig) };
          try {
            localStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(liveTargets));
          } catch {
            // ignore
          }
          targetsListeners.forEach((cb) => cb(liveTargets!));
        }
      },
      () => {
        if (liveSuppliers === null) {
          liveSuppliers = readLocalList<Supplier>(LOCAL_SUPPLIERS_KEY);
          suppliersListeners.forEach((cb) => cb(liveSuppliers!));
        }
        if (livePurchases === null) {
          livePurchases = readLocalList<PurchaseEntry>(LOCAL_PURCHASES_KEY);
          purchasesListeners.forEach((cb) => cb(livePurchases!));
        }
        if (liveExpenses === null) {
          liveExpenses = readLocalList<ExpenseEntry>(LOCAL_EXPENSES_KEY);
          expensesListeners.forEach((cb) => cb(liveExpenses!));
        }
        if (liveReturns === null) {
          liveReturns = readLocalList<SalesReturnEntry>(LOCAL_RETURNS_KEY);
          returnsListeners.forEach((cb) => cb(liveReturns!));
        }
        if (liveHeldSales === null) {
          liveHeldSales = readLocalList<HeldPosSale>(LOCAL_HELD_SALES_KEY);
          heldSalesListeners.forEach((cb) => cb(liveHeldSales!));
        }
        if (liveCrmCustomers === null) {
          liveCrmCustomers = readLocalList<CustomerProfile>(LOCAL_CRM_CUSTOMERS_KEY);
          crmCustomersListeners.forEach((cb) => cb(liveCrmCustomers!));
        }
      }
    );
  } catch {
    // ignore
  }
};

export const posService = {
  // ======================== REGISTERED USERS (SHARED) ========================
  getInstantRegisteredUsers(): Array<Partial<CustomerProfile>> {
    return liveRegisteredUsers ?? [];
  },

  subscribeToRegisteredUsers(cb: (list: Array<Partial<CustomerProfile>>) => void): Unsubscribe {
    registeredUsersListeners.add(cb);
    if (liveRegisteredUsers !== null) {
      cb(liveRegisteredUsers);
    }
    if (!sharedUsersUnsub) {
      try {
        sharedUsersUnsub = onSnapshot(
          collection(db, 'users'),
          (snap) => {
            const list: Array<Partial<CustomerProfile>> = [];
            snap.forEach((d) => list.push({ ...(d.data() as CustomerProfile), uid: d.id }));
            liveRegisteredUsers = list;
            registeredUsersListeners.forEach((listener) => listener(list));
          },
          () => {
            if (liveRegisteredUsers === null) {
              liveRegisteredUsers = [];
              registeredUsersListeners.forEach((listener) => listener([]));
            }
          }
        );
      } catch {
        // ignore
      }
    }
    return () => {
      registeredUsersListeners.delete(cb);
    };
  },

  // ======================== SALES TARGETS ========================
  getInstantTargets(): SalesTargetsConfig {
    return liveTargets ?? DEFAULT_SALES_TARGETS;
  },

  getLocalTargets(): SalesTargetsConfig {
    if (liveTargets !== null) return liveTargets;
    try {
      const raw = localStorage.getItem(LOCAL_TARGETS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return { ...DEFAULT_SALES_TARGETS, ...parsed };
        }
      }
    } catch {
      // ignore
    }
    return DEFAULT_SALES_TARGETS;
  },

  async saveTargets(targets: SalesTargetsConfig): Promise<SalesTargetsConfig> {
    const clean: SalesTargetsConfig = {
      dailyAmountTarget: Math.max(0, Number(targets.dailyAmountTarget) || 0),
      dailyPcsTarget: Math.max(0, Number(targets.dailyPcsTarget) || 0),
      dailyProfitTarget: Math.max(0, Number(targets.dailyProfitTarget) || 0),
      dailyOrderTarget: Math.max(0, Number(targets.dailyOrderTarget) || 0),
      monthlyAmountTarget: Math.max(0, Number(targets.monthlyAmountTarget) || 0),
      monthlyPcsTarget: Math.max(0, Number(targets.monthlyPcsTarget) || 0),
      monthlyProfitTarget: Math.max(0, Number(targets.monthlyProfitTarget) || 0),
      monthlyOrderTarget: Math.max(0, Number(targets.monthlyOrderTarget) || 0),
      lowStockThresholdDefault: Math.max(1, Number(targets.lowStockThresholdDefault) || 5),
      updatedAt: new Date().toISOString(),
    };

    liveTargets = clean;
    targetsListeners.forEach((cb) => cb(clean));
    try {
      localStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(clean));
    } catch {
      // ignore
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ targets: clean }), 2500),
      setDoc(TARGETS_DOC, sanitizeForFirestore({ ...clean, updatedAtServer: serverTimestamp() }), {
        merge: true,
      }).catch(() => {}),
    ]);
    return clean;
  },

  subscribeToTargets(cb: (targets: SalesTargetsConfig) => void): Unsubscribe {
    targetsListeners.add(cb);
    if (liveTargets !== null) {
      cb(liveTargets);
    }

    if (!sharedTargetsUnsub) {
      try {
        sharedTargetsUnsub = onSnapshot(
          TARGETS_DOC,
          (snap) => {
            if (snap.exists()) {
              targetsDocHasAuthoritativeData = true;
              const data = { ...DEFAULT_SALES_TARGETS, ...(snap.data() as SalesTargetsConfig) };
              liveTargets = data;
              try {
                localStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(data));
              } catch {
                // ignore
              }
              targetsListeners.forEach((listener) => listener(data));
            } else if (liveTargets === null) {
              liveTargets = DEFAULT_SALES_TARGETS;
              targetsListeners.forEach((listener) => listener(DEFAULT_SALES_TARGETS));
            }
          },
          () => {
            if (liveTargets === null) {
              const fallback = this.getLocalTargets();
              liveTargets = fallback;
              targetsListeners.forEach((listener) => listener(fallback));
            }
          }
        );
      } catch {
        // ignore
      }
    }
    ensureSharedLedgerListener();

    return () => {
      targetsListeners.delete(cb);
    };
  },

  // ======================== 4 PARTNER DESKS ========================
  getInstantPartnerDesks(): PartnerDeskConfig[] {
    return livePartnerDesks ?? DEFAULT_PARTNER_DESKS;
  },

  getLocalPartnerDesks(): PartnerDeskConfig[] {
    if (livePartnerDesks !== null) return livePartnerDesks;
    const saved = readLocalList<PartnerDeskConfig>(LOCAL_PARTNERS_KEY);
    if (saved.length === 4) return saved;
    return DEFAULT_PARTNER_DESKS;
  },

  async savePartnerDesks(desks: PartnerDeskConfig[]): Promise<void> {
    livePartnerDesks = desks;
    partnerDesksListeners.forEach((cb) => cb(desks));
    writeBackupList(LOCAL_PARTNERS_KEY, desks);
    try {
      await withTimeout(
        setDoc(
          PARTNERS_DOC,
          sanitizeForFirestore({
            desks,
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ),
        3000
      );
    } catch {
      // queued offline
    }
  },

  subscribeToPartnerDesks(cb: (desks: PartnerDeskConfig[]) => void): Unsubscribe {
    partnerDesksListeners.add(cb);
    if (livePartnerDesks !== null) {
      cb(livePartnerDesks);
    }

    if (!sharedPartnersUnsub) {
      try {
        sharedPartnersUnsub = onSnapshot(
          PARTNERS_DOC,
          (snap) => {
            if (snap.exists() && Array.isArray(snap.data()?.desks) && snap.data()?.desks.length === 4) {
              const remoteDesks = snap.data().desks as PartnerDeskConfig[];
              livePartnerDesks = remoteDesks;
              writeBackupList(LOCAL_PARTNERS_KEY, remoteDesks);
              partnerDesksListeners.forEach((listener) => listener(remoteDesks));
            } else if (livePartnerDesks === null) {
              livePartnerDesks = DEFAULT_PARTNER_DESKS;
              partnerDesksListeners.forEach((listener) => listener(DEFAULT_PARTNER_DESKS));
            }
          },
          () => {
            if (livePartnerDesks === null) {
              const fallback = this.getLocalPartnerDesks();
              livePartnerDesks = fallback;
              partnerDesksListeners.forEach((listener) => listener(fallback));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      partnerDesksListeners.delete(cb);
    };
  },

  // ======================== SUPPLIERS ========================
  getInstantSuppliers(): Supplier[] {
    return liveSuppliers ?? [];
  },

  getLocalSuppliers(): Supplier[] {
    if (liveSuppliers !== null) return liveSuppliers;
    return readLocalList<Supplier>(LOCAL_SUPPLIERS_KEY);
  },

  subscribeToSuppliers(cb: (list: Supplier[]) => void): Unsubscribe {
    suppliersListeners.add(cb);
    if (liveSuppliers !== null) {
      cb(liveSuppliers);
    }
    ensureSharedLedgerListener();
    return () => {
      suppliersListeners.delete(cb);
    };
  },

  async saveSupplier(supplierInput: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt' | 'totalPurchased' | 'totalPaid' | 'dueAmount'> & { id?: string }): Promise<Supplier> {
    const nowIso = new Date().toISOString();
    const list = this.getLocalSuppliers();
    const existing = supplierInput.id ? list.find((s) => s.id === supplierInput.id) : undefined;
    const id = supplierInput.id || `sup_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const record: Supplier = {
      id,
      name: supplierInput.name.trim(),
      contactPerson: supplierInput.contactPerson?.trim() || '',
      phone: supplierInput.phone.trim(),
      email: supplierInput.email?.trim() || '',
      address: supplierInput.address?.trim() || '',
      category: supplierInput.category?.trim() || 'Apparel & Fabrics',
      notes: supplierInput.notes?.trim() || '',
      totalPurchased: existing?.totalPurchased || 0,
      totalPaid: existing?.totalPaid || 0,
      dueAmount: existing?.dueAmount || 0,
      createdAt: existing?.createdAt || nowIso,
      updatedAt: nowIso,
    };

    const next = existing
      ? list.map((s) => (s.id === id ? record : s))
      : [record, ...list];

    liveSuppliers = next;
    suppliersListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_SUPPLIERS_KEY, next);
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ suppliers: next }), 2500),
      withTimeout(
        setDoc(doc(db, 'suppliers', id), sanitizeForFirestore(record), { merge: true }).catch(() => {}),
        2500
      ),
    ]);
    return record;
  },

  async deleteSupplier(supplierId: string): Promise<void> {
    const next = this.getLocalSuppliers().filter((s) => s.id !== supplierId);
    liveSuppliers = next;
    suppliersListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_SUPPLIERS_KEY, next);
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ suppliers: next }), 2500),
      withTimeout(deleteDoc(doc(db, 'suppliers', supplierId)).catch(() => {}), 2500),
    ]);
  },

  async recordSupplierDuePayment(supplierId: string, amount: number): Promise<Supplier | null> {
    if (amount <= 0) return null;
    const list = this.getLocalSuppliers();
    const target = list.find((s) => s.id === supplierId);
    if (!target) return null;

    const updated: Supplier = {
      ...target,
      totalPaid: (target.totalPaid || 0) + amount,
      dueAmount: Math.max(0, (target.dueAmount || 0) - amount),
      updatedAt: new Date().toISOString(),
    };
    const next = list.map((s) => (s.id === supplierId ? updated : s));
    liveSuppliers = next;
    suppliersListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_SUPPLIERS_KEY, next);
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ suppliers: next }), 2500),
      withTimeout(
        setDoc(doc(db, 'suppliers', supplierId), sanitizeForFirestore(updated), { merge: true }).catch(() => {}),
        2500
      ),
    ]);
    return updated;
  },

  // ======================== PURCHASES ========================
  getInstantPurchases(): PurchaseEntry[] {
    return livePurchases ?? [];
  },

  getLocalPurchases(): PurchaseEntry[] {
    if (livePurchases !== null) return livePurchases;
    return readLocalList<PurchaseEntry>(LOCAL_PURCHASES_KEY);
  },

  subscribeToPurchases(cb: (list: PurchaseEntry[]) => void): Unsubscribe {
    purchasesListeners.add(cb);
    if (livePurchases !== null) {
      cb(livePurchases);
    }
    ensureSharedLedgerListener();
    return () => {
      purchasesListeners.delete(cb);
    };
  },

  async addPurchase(params: {
    purchaseNumber?: string;
    supplierId: string;
    supplierName: string;
    date: string;
    items: PurchaseEntry['items'];
    paidAmount: number;
    paymentMethod: PurchaseEntry['paymentMethod'];
    syncStock: boolean;
    status?: PurchaseEntry['status'];
    origin?: PurchaseEntry['origin'];
    notes?: string;
    createdBy?: string;
  }): Promise<PurchaseEntry> {
    const nowIso = new Date().toISOString();
    const id = `pur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const existingList = this.getLocalPurchases();
    const nextNum = 2001 + existingList.length;
    const purchaseNumber =
      params.purchaseNumber?.trim() || `PUR-${nextNum}`;
    const totalAmount = params.items.reduce((sum, i) => sum + (Number(i.totalCost) || 0), 0);
    const paidAmount = Math.min(totalAmount, Math.max(0, Number(params.paidAmount) || 0));
    const dueAmount = Math.max(0, totalAmount - paidAmount);
    const initialStatus: PurchaseEntry['status'] = params.status || 'pending_purchase';
    const shouldPostLedgerNow = initialStatus === 'approved' || initialStatus === 'pending_stock';

    const entry: PurchaseEntry = {
      id,
      purchaseNumber,
      supplierId: params.supplierId,
      supplierName: params.supplierName,
      date: params.date,
      items: params.items,
      totalAmount,
      paidAmount,
      dueAmount,
      paymentMethod: params.paymentMethod,
      status: initialStatus,
      origin: params.origin || 'manual_purchase',
      ledgerPosted: shouldPostLedgerNow,
      stockSynced: initialStatus === 'approved' && params.syncStock,
      notes: params.notes?.trim() || '',
      createdBy: params.createdBy || 'Admin',
      createdAt: nowIso,
    };

    const nextPurchases = [entry, ...existingList];
    livePurchases = nextPurchases;
    purchasesListeners.forEach((cb) => cb(nextPurchases));
    writeBackupList(LOCAL_PURCHASES_KEY, nextPurchases);

    let nextSuppliers = this.getLocalSuppliers();
    if (shouldPostLedgerNow && params.supplierId) {
      nextSuppliers = nextSuppliers.map((s) =>
        s.id === params.supplierId
          ? {
              ...s,
              totalPurchased: (s.totalPurchased || 0) + totalAmount,
              totalPaid: (s.totalPaid || 0) + paidAmount,
              dueAmount: (s.dueAmount || 0) + dueAmount,
              updatedAt: nowIso,
            }
          : s
      );
      liveSuppliers = nextSuppliers;
      suppliersListeners.forEach((cb) => cb(nextSuppliers));
      writeBackupList(LOCAL_SUPPLIERS_KEY, nextSuppliers);
    }

    if (initialStatus === 'approved' && params.syncStock) {
      const localProducts = productService.getLocalProducts();
      for (const item of params.items) {
        if (!item.productId || item.quantity <= 0) continue;
        try {
          const prodData = localProducts.find((p) => p.id === item.productId);
          if (prodData) {
            const prevStock = Number(prodData.totalStock) || 0;
            const newTotalStock = prevStock + Number(item.quantity);
            await productService
              .updateProduct(item.productId, {
                totalStock: newTotalStock,
                approvalStatus: 'approved',
                pendingStockQty: 0,
                ...(item.unitCost > 0 ? { costPrice: Number(item.unitCost) } : {}),
              })
              .catch(() => {});
            await productService
              .recordStockMovement({
                productId: item.productId,
                productName: item.productName || prodData.name,
                sku: item.sku || prodData.sku || '',
                previousStock: prevStock,
                change: Number(item.quantity),
                newStock: newTotalStock,
                type: 'purchase',
                reason: `Purchase Bill ${purchaseNumber} (${params.supplierName})`,
                referenceId: purchaseNumber,
                staffName: params.createdBy || 'Admin',
                date: params.date,
              })
              .catch(() => {});
          }
        } catch {
          // continue others
        }
      }
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ purchases: nextPurchases, suppliers: nextSuppliers }), 2500),
      withTimeout(setDoc(doc(db, 'purchases', id), sanitizeForFirestore(entry), { merge: true }).catch(() => {}), 2500),
    ]);

    return entry;
  },

  async approvePurchaseToStock(
    purchaseId: string,
    staffName: string,
    patch?: {
      quantity?: number;
      unitCost?: number;
      paidAmount?: number;
      supplierId?: string;
      supplierName?: string;
    }
  ): Promise<PurchaseEntry | null> {
    const nowIso = new Date().toISOString();
    const list = this.getLocalPurchases();
    const target = list.find((p) => p.id === purchaseId);
    if (!target) return null;

    let updatedItems = target.items || [];
    if (patch && updatedItems.length > 0 && (patch.quantity !== undefined || patch.unitCost !== undefined)) {
      updatedItems = updatedItems.map((it, idx) => {
        if (idx !== 0) return it;
        const nextQty = patch.quantity !== undefined ? Math.max(0, Number(patch.quantity) || 0) : it.quantity;
        const nextCost = patch.unitCost !== undefined ? Math.max(0, Number(patch.unitCost) || 0) : it.unitCost;
        return {
          ...it,
          quantity: nextQty,
          unitCost: nextCost,
          totalCost: nextQty * nextCost,
        };
      });
    }

    const totalAmount = updatedItems.reduce((sum, i) => sum + (Number(i.totalCost) || 0), 0);
    const rawPaid = patch?.paidAmount !== undefined ? Number(patch.paidAmount) || 0 : target.paidAmount;
    const paidAmount = Math.min(totalAmount, Math.max(0, rawPaid));
    const dueAmount = Math.max(0, totalAmount - paidAmount);
    const resolvedSupplierId = patch?.supplierId !== undefined ? patch.supplierId : target.supplierId;
    const resolvedSupplierName = patch?.supplierName !== undefined ? patch.supplierName : target.supplierName;

    const updatedEntry: PurchaseEntry = {
      ...target,
      supplierId: resolvedSupplierId,
      supplierName: resolvedSupplierName,
      items: updatedItems,
      totalAmount,
      paidAmount,
      dueAmount,
      status: 'pending_stock',
      ledgerPosted: true,
      purchaseApprovedBy: staffName || 'Admin',
      purchaseApprovedAt: nowIso,
    };

    const nextPurchases = list.map((p) => (p.id === purchaseId ? updatedEntry : p));
    livePurchases = nextPurchases;
    purchasesListeners.forEach((cb) => cb(nextPurchases));
    writeBackupList(LOCAL_PURCHASES_KEY, nextPurchases);

    let nextSuppliers = this.getLocalSuppliers();
    if (!target.ledgerPosted && resolvedSupplierId) {
      nextSuppliers = nextSuppliers.map((s) =>
        s.id === resolvedSupplierId
          ? {
              ...s,
              totalPurchased: (s.totalPurchased || 0) + totalAmount,
              totalPaid: (s.totalPaid || 0) + paidAmount,
              dueAmount: (s.dueAmount || 0) + dueAmount,
              updatedAt: nowIso,
            }
          : s
      );
      liveSuppliers = nextSuppliers;
      suppliersListeners.forEach((cb) => cb(nextSuppliers));
      writeBackupList(LOCAL_SUPPLIERS_KEY, nextSuppliers);
    }

    const localProducts = productService.getLocalProducts();
    for (const item of updatedItems) {
      if (!item.productId) continue;
      const prodData = localProducts.find((p) => p.id === item.productId);
      if (prodData && (prodData.approvalStatus === 'pending_purchase' || prodData.approvalStatus === 'rejected')) {
        await productService
          .updateProduct(item.productId, {
            approvalStatus: 'pending_stock',
            pendingStockQty: Number(item.quantity) || 0,
            ...(item.unitCost > 0 ? { costPrice: Number(item.unitCost) } : {}),
          })
          .catch(() => {});
      }
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ purchases: nextPurchases, suppliers: nextSuppliers }), 2500),
      withTimeout(setDoc(doc(db, 'purchases', purchaseId), sanitizeForFirestore(updatedEntry), { merge: true }).catch(() => {}), 2500),
    ]);

    return updatedEntry;
  },

  async finalApprovePurchaseStock(purchaseId: string, staffName: string): Promise<PurchaseEntry | null> {
    const nowIso = new Date().toISOString();
    const list = this.getLocalPurchases();
    const target = list.find((p) => p.id === purchaseId);
    if (!target) return null;

    const updatedEntry: PurchaseEntry = {
      ...target,
      status: 'approved',
      stockSynced: true,
      stockApprovedBy: staffName || 'Stock Admin',
      stockApprovedAt: nowIso,
    };

    const nextPurchases = list.map((p) => (p.id === purchaseId ? updatedEntry : p));
    livePurchases = nextPurchases;
    purchasesListeners.forEach((cb) => cb(nextPurchases));
    writeBackupList(LOCAL_PURCHASES_KEY, nextPurchases);

    const localProducts = productService.getLocalProducts();
    for (const item of target.items || []) {
      if (!item.productId) continue;
      const prodData = localProducts.find((p) => p.id === item.productId);
      if (!prodData) continue;
      const qty = Math.max(0, Number(item.quantity) || 0);
      const prevStock = Number(prodData.totalStock) || 0;
      const newTotalStock = prevStock + qty;

      await productService
        .updateProduct(item.productId, {
          totalStock: newTotalStock,
          approvalStatus: 'approved',
          pendingStockQty: 0,
          ...(item.unitCost > 0 ? { costPrice: Number(item.unitCost) } : {}),
        })
        .catch(() => {});

      if (qty > 0) {
        await productService
          .recordStockMovement({
            productId: item.productId,
            productName: item.productName || prodData.name,
            sku: item.sku || prodData.sku || '',
            previousStock: prevStock,
            change: qty,
            newStock: newTotalStock,
            type: 'purchase',
            reason: `Stock Final Approval — ${target.purchaseNumber} (${target.supplierName})`,
            referenceId: target.purchaseNumber,
            staffName: staffName || 'Stock Admin',
            date: target.date,
          })
          .catch(() => {});
      }
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ purchases: nextPurchases }), 2500),
      withTimeout(setDoc(doc(db, 'purchases', purchaseId), sanitizeForFirestore(updatedEntry), { merge: true }).catch(() => {}), 2500),
    ]);

    return updatedEntry;
  },

  async rejectPurchaseEntry(purchaseId: string, staffName: string, reason?: string): Promise<PurchaseEntry | null> {
    const nowIso = new Date().toISOString();
    const list = this.getLocalPurchases();
    const target = list.find((p) => p.id === purchaseId);
    if (!target) return null;

    const updatedEntry: PurchaseEntry = {
      ...target,
      status: 'rejected',
      ledgerPosted: false,
      stockSynced: false,
      notes: reason?.trim() ? `${target.notes ? `${target.notes} | ` : ''}Rejected by ${staffName}: ${reason.trim()}` : target.notes,
    };

    const nextPurchases = list.map((p) => (p.id === purchaseId ? updatedEntry : p));
    livePurchases = nextPurchases;
    purchasesListeners.forEach((cb) => cb(nextPurchases));
    writeBackupList(LOCAL_PURCHASES_KEY, nextPurchases);

    let nextSuppliers = this.getLocalSuppliers();
    if (target.ledgerPosted && target.supplierId) {
      nextSuppliers = nextSuppliers.map((s) =>
        s.id === target.supplierId
          ? {
              ...s,
              totalPurchased: Math.max(0, (s.totalPurchased || 0) - target.totalAmount),
              totalPaid: Math.max(0, (s.totalPaid || 0) - target.paidAmount),
              dueAmount: Math.max(0, (s.dueAmount || 0) - target.dueAmount),
              updatedAt: nowIso,
            }
          : s
      );
      liveSuppliers = nextSuppliers;
      suppliersListeners.forEach((cb) => cb(nextSuppliers));
      writeBackupList(LOCAL_SUPPLIERS_KEY, nextSuppliers);
    }

    const localProducts = productService.getLocalProducts();
    for (const item of target.items || []) {
      if (!item.productId) continue;
      const prodData = localProducts.find((p) => p.id === item.productId);
      if (prodData && (prodData.approvalStatus === 'pending_purchase' || prodData.approvalStatus === 'pending_stock')) {
        await productService
          .updateProduct(item.productId, {
            approvalStatus: 'rejected',
            pendingStockQty: 0,
          })
          .catch(() => {});
      }
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ purchases: nextPurchases, suppliers: nextSuppliers }), 2500),
      withTimeout(setDoc(doc(db, 'purchases', purchaseId), sanitizeForFirestore(updatedEntry), { merge: true }).catch(() => {}), 2500),
    ]);

    return updatedEntry;
  },

  async deletePurchase(purchaseId: string): Promise<void> {
    const existing = this.getLocalPurchases();
    const target = existing.find((p) => p.id === purchaseId);
    const nextPurchases = existing.filter((p) => p.id !== purchaseId);
    livePurchases = nextPurchases;
    purchasesListeners.forEach((cb) => cb(nextPurchases));
    writeBackupList(LOCAL_PURCHASES_KEY, nextPurchases);

    let nextSuppliers = this.getLocalSuppliers();
    const shouldReverseLedger =
      target &&
      target.supplierId &&
      (target.ledgerPosted === true || (target.ledgerPosted === undefined && target.status !== 'pending_purchase' && target.status !== 'rejected'));

    if (shouldReverseLedger && target) {
      nextSuppliers = nextSuppliers.map((s) =>
        s.id === target.supplierId
          ? {
              ...s,
              totalPurchased: Math.max(0, (s.totalPurchased || 0) - target.totalAmount),
              totalPaid: Math.max(0, (s.totalPaid || 0) - target.paidAmount),
              dueAmount: Math.max(0, (s.dueAmount || 0) - target.dueAmount),
              updatedAt: new Date().toISOString(),
            }
          : s
      );
      liveSuppliers = nextSuppliers;
      suppliersListeners.forEach((cb) => cb(nextSuppliers));
      writeBackupList(LOCAL_SUPPLIERS_KEY, nextSuppliers);
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ purchases: nextPurchases, suppliers: nextSuppliers }), 2500),
      withTimeout(deleteDoc(doc(db, 'purchases', purchaseId)).catch(() => {}), 2500),
    ]);
  },

  // ======================== EXPENSES ========================
  getInstantExpenses(): ExpenseEntry[] {
    return liveExpenses ?? [];
  },

  getLocalExpenses(): ExpenseEntry[] {
    if (liveExpenses !== null) return liveExpenses;
    return readLocalList<ExpenseEntry>(LOCAL_EXPENSES_KEY);
  },

  subscribeToExpenses(cb: (list: ExpenseEntry[]) => void): Unsubscribe {
    expensesListeners.add(cb);
    if (liveExpenses !== null) {
      cb(liveExpenses);
    }
    ensureSharedLedgerListener();
    return () => {
      expensesListeners.delete(cb);
    };
  },

  async addExpense(params: {
    title: string;
    category: ExpenseEntry['category'];
    amount: number;
    date: string;
    time?: string;
    paymentMethod: ExpenseEntry['paymentMethod'];
    paidBy?: string;
    reference?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<ExpenseEntry> {
    const now = new Date();
    const defaultTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: ExpenseEntry = {
      id,
      title: params.title.trim(),
      category: params.category,
      amount: Math.max(0, Number(params.amount) || 0),
      date: params.date,
      time: params.time?.trim() || defaultTime,
      paymentMethod: params.paymentMethod,
      paidBy: params.paidBy?.trim() || '',
      reference: params.reference?.trim() || '',
      notes: params.notes?.trim() || '',
      createdBy: params.createdBy || 'Admin',
      createdAt: now.toISOString(),
    };

    const next = [entry, ...this.getLocalExpenses()];
    liveExpenses = next;
    expensesListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_EXPENSES_KEY, next);
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ expenses: next }), 2500),
      setDoc(doc(db, 'expenses', id), sanitizeForFirestore(entry), { merge: true }).catch(() => {}),
    ]);
    return entry;
  },

  async updateExpense(
    expenseId: string,
    patch: Partial<Omit<ExpenseEntry, 'id' | 'createdAt'>>
  ): Promise<ExpenseEntry | null> {
    const list = this.getLocalExpenses();
    const target = list.find((e) => e.id === expenseId);
    if (!target) return null;

    const updated: ExpenseEntry = {
      ...target,
      ...patch,
      amount: patch.amount !== undefined ? Math.max(0, Number(patch.amount) || 0) : target.amount,
      updatedAt: new Date().toISOString(),
    };
    const next = list.map((e) => (e.id === expenseId ? updated : e));
    liveExpenses = next;
    expensesListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_EXPENSES_KEY, next);
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ expenses: next }), 2500),
      setDoc(doc(db, 'expenses', expenseId), sanitizeForFirestore(updated), { merge: true }).catch(() => {}),
    ]);
    return updated;
  },

  async deleteExpense(expenseId: string): Promise<void> {
    const next = this.getLocalExpenses().filter((e) => e.id !== expenseId);
    liveExpenses = next;
    expensesListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_EXPENSES_KEY, next);
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ expenses: next }), 2500),
      deleteDoc(doc(db, 'expenses', expenseId)).catch(() => {}),
    ]);
  },

  // ======================== SALES RETURNS ========================
  getInstantReturns(): SalesReturnEntry[] {
    return liveReturns ?? [];
  },

  getLocalReturns(): SalesReturnEntry[] {
    if (liveReturns !== null) return liveReturns;
    return readLocalList<SalesReturnEntry>(LOCAL_RETURNS_KEY);
  },

  subscribeToReturns(cb: (list: SalesReturnEntry[]) => void): Unsubscribe {
    returnsListeners.add(cb);
    if (liveReturns !== null) {
      cb(liveReturns);
    }
    ensureSharedLedgerListener();
    return () => {
      returnsListeners.delete(cb);
    };
  },

  async addSalesReturn(params: {
    orderId: string;
    orderNumber: string;
    customerName: string;
    customerPhone: string;
    returnType: 'full' | 'partial';
    items: SalesReturnItem[];
    restock: boolean;
    refundMethod: SalesReturnEntry['refundMethod'];
    reason: string;
    date: string;
    processedBy: string;
    markOrderAsReturned?: boolean;
  }): Promise<SalesReturnEntry> {
    const id = `ret_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const returnNumber = `RET-${Math.floor(10000 + Math.random() * 90000)}`;

    const totalRefundAmount = params.items.reduce((s, it) => s + (Number(it.totalRefund) || 0), 0);
    const totalReturnedPcs = params.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);

    // Resolve unitCost from products if missing
    const localProducts = productService.getLocalProducts();
    const costMap = new Map<string, number>();
    localProducts.forEach((p) => {
      if (p.id && typeof p.costPrice === 'number' && p.costPrice > 0) {
        costMap.set(p.id, p.costPrice);
      }
    });

    const normalizedItems: SalesReturnItem[] = params.items.map((it) => {
      const unitCost =
        typeof it.unitCost === 'number' && it.unitCost > 0
          ? it.unitCost
          : costMap.get(it.productId) || 0;
      return { ...it, unitCost };
    });

    const totalCostReversed = normalizedItems.reduce(
      (s, it) => s + (Number(it.unitCost) || 0) * (Number(it.quantity) || 0),
      0
    );

    const entry: SalesReturnEntry = {
      id,
      returnNumber,
      orderId: params.orderId,
      orderNumber: params.orderNumber,
      customerName: params.customerName,
      customerPhone: params.customerPhone,
      returnType: params.returnType,
      items: normalizedItems,
      totalRefundAmount,
      totalCostReversed,
      totalReturnedPcs,
      restocked: params.restock,
      refundMethod: params.refundMethod,
      reason: params.reason.trim() || 'Customer Return',
      date: params.date,
      processedBy: params.processedBy || 'Admin',
      createdAt: new Date().toISOString(),
    };

    const nextReturns = [entry, ...this.getLocalReturns()];
    liveReturns = nextReturns;
    returnsListeners.forEach((cb) => cb(nextReturns));
    writeBackupList(LOCAL_RETURNS_KEY, nextReturns);

    // Update linked order status (full return triggers pipeline returned status)
    // Note: If markOrderAsReturned is true AND order stock is already going to be restored by transferOrderStage,
    // we avoid double restock by letting transferOrderStage handle full return restore OR restoring explicitly for partial returns!
    let restoredByOrderTransfer = false;
    if (params.markOrderAsReturned && params.orderId) {
      try {
        const { orderService } = await import('./orderService');
        const targetOrd = orderService.getLocalOrders().find((o) => o.id === params.orderId);
        const alreadyReturned = targetOrd?.orderStatus === 'returned';
        if (!alreadyReturned) {
          const willOrderRestore =
            params.restock &&
            targetOrd?.pipeline?.stockDeducted !== false &&
            !targetOrd?.pipeline?.stockRestored;
          await orderService.transferOrderStage({
            orderId: params.orderId,
            nextStage: 'returned',
            handlerName: params.processedBy || 'Admin',
            note: `Sales Return ${returnNumber}: ${entry.reason}`,
            markPaymentStatus: params.refundMethod !== 'none' ? 'refunded' : undefined,
          });
          if (willOrderRestore) {
            restoredByOrderTransfer = true;
          }
        }
      } catch {
        // fallback below
      }
    }

    if (params.restock && !restoredByOrderTransfer && normalizedItems.length > 0) {
      await productService
        .restoreProductStock(
          normalizedItems.map((it) => ({
            productId: it.productId,
            size: it.size,
            color: it.color,
            quantity: it.quantity,
          }))
        )
        .catch(() => {});
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ returns: nextReturns }), 2500),
      setDoc(doc(db, 'returns', id), sanitizeForFirestore(entry), { merge: true }).catch(() => {}),
    ]);

    return entry;
  },

  async deleteSalesReturn(returnId: string): Promise<void> {
    const next = this.getLocalReturns().filter((r) => r.id !== returnId);
    liveReturns = next;
    returnsListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_RETURNS_KEY, next);
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ returns: next }), 2500),
      deleteDoc(doc(db, 'returns', returnId)).catch(() => {}),
    ]);
  },

  // ======================== AUTO-ARCHIVED TARGET HISTORY ========================
  getInstantTargetArchives(): TargetArchiveRecord[] {
    return liveTargetArchives ?? [];
  },

  getLocalTargetArchives(): TargetArchiveRecord[] {
    if (liveTargetArchives !== null) return liveTargetArchives;
    return readLocalList<TargetArchiveRecord>(LOCAL_TARGET_ARCHIVES_KEY);
  },

  subscribeToTargetArchives(cb: (records: TargetArchiveRecord[]) => void): Unsubscribe {
    targetArchivesListeners.add(cb);
    if (liveTargetArchives !== null) {
      cb(liveTargetArchives);
    }

    if (!sharedArchivesUnsub) {
      try {
        sharedArchivesUnsub = onSnapshot(
          TARGET_ARCHIVES_DOC,
          (snap) => {
            if (snap.exists() && Array.isArray(snap.data()?.records)) {
              const remote = snap.data().records as TargetArchiveRecord[];
              liveTargetArchives = remote;
              writeBackupList(LOCAL_TARGET_ARCHIVES_KEY, remote);
              targetArchivesListeners.forEach((listener) => listener(remote));
            } else if (liveTargetArchives === null) {
              liveTargetArchives = [];
              targetArchivesListeners.forEach((listener) => listener([]));
            }
          },
          () => {
            if (liveTargetArchives === null) {
              const fallback = this.getLocalTargetArchives();
              liveTargetArchives = fallback;
              targetArchivesListeners.forEach((listener) => listener(fallback));
            }
          }
        );
      } catch {
        // ignore
      }
    }

    return () => {
      targetArchivesListeners.delete(cb);
    };
  },

  async saveTargetArchives(records: TargetArchiveRecord[]): Promise<void> {
    if (liveTargetArchives && JSON.stringify(liveTargetArchives) === JSON.stringify(records)) {
      return;
    }
    liveTargetArchives = records;
    targetArchivesListeners.forEach((cb) => cb(records));
    writeBackupList(LOCAL_TARGET_ARCHIVES_KEY, records);
    if (isFirestoreWriteBackedOff()) return;
    try {
      await withTimeout(
        setDoc(
          TARGET_ARCHIVES_DOC,
          sanitizeForFirestore({
            records: records.slice(0, 60),
            updatedAt: serverTimestamp(),
          }),
          { merge: true }
        ),
        2500
      );
    } catch (err) {
      markFirestoreWriteError(err);
    }
  },

  // ======================== POS HELD SALES ========================
  getInstantHeldSales(): HeldPosSale[] {
    return liveHeldSales ?? [];
  },

  getLocalHeldSales(): HeldPosSale[] {
    if (liveHeldSales !== null) return liveHeldSales;
    return readLocalList<HeldPosSale>(LOCAL_HELD_SALES_KEY);
  },

  subscribeToHeldSales(cb: (list: HeldPosSale[]) => void): Unsubscribe {
    heldSalesListeners.add(cb);
    if (liveHeldSales !== null) {
      cb(liveHeldSales);
    }
    ensureSharedLedgerListener();
    return () => {
      heldSalesListeners.delete(cb);
    };
  },

  async saveHeldSale(input: Omit<HeldPosSale, 'id' | 'holdNumber' | 'createdAt'>): Promise<HeldPosSale> {
    const id = `hold_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    const holdNumber = `HOLD-${Math.floor(1000 + Math.random() * 9000)}`;
    const record: HeldPosSale = {
      ...input,
      id,
      holdNumber,
      createdAt: new Date().toISOString(),
    };
    const next = [record, ...this.getLocalHeldSales()].slice(0, 40);
    liveHeldSales = next;
    heldSalesListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_HELD_SALES_KEY, next);
    await Promise.allSettled([withTimeout(syncLedgerMirror({ heldSales: next }), 2500)]);
    return record;
  },

  async deleteHeldSale(holdId: string): Promise<void> {
    const next = this.getLocalHeldSales().filter((h) => h.id !== holdId);
    liveHeldSales = next;
    heldSalesListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_HELD_SALES_KEY, next);
    await Promise.allSettled([withTimeout(syncLedgerMirror({ heldSales: next }), 2500)]);
  },

  // ======================== POS / MANUAL CRM CUSTOMERS & DUE PAYMENTS ========================
  getInstantCrmCustomers(): CustomerProfile[] {
    return liveCrmCustomers ?? [];
  },

  getLocalCrmCustomers(): CustomerProfile[] {
    if (liveCrmCustomers !== null) return liveCrmCustomers;
    return readLocalList<CustomerProfile>(LOCAL_CRM_CUSTOMERS_KEY);
  },

  subscribeToCrmCustomers(cb: (list: CustomerProfile[]) => void): Unsubscribe {
    crmCustomersListeners.add(cb);
    if (liveCrmCustomers !== null) {
      cb(liveCrmCustomers);
    }
    ensureSharedLedgerListener();
    return () => {
      crmCustomersListeners.delete(cb);
    };
  },

  async saveCrmCustomer(input: {
    uid?: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    phone: string;
    email?: string;
    address?: string;
    division?: string;
    district?: string;
    city?: string;
  }): Promise<CustomerProfile> {
    const existing = this.getLocalCrmCustomers();
    const fullName =
      (input.name || `${input.firstName || ''} ${input.lastName || ''}`).trim() || 'Walk-in Customer';
    const uid = input.uid || `CUS-${Math.floor(10000 + Math.random() * 90000)}`;
    const nowIso = new Date().toISOString();

    const record: CustomerProfile = {
      uid,
      name: fullName,
      phone: input.phone.trim(),
      email: input.email?.trim().toLowerCase() || '',
      address: input.address?.trim() || '',
      division: input.division?.trim() || 'Dhaka',
      district: input.district?.trim() || 'Dhaka',
      city: input.city?.trim() || input.district?.trim() || '',
      createdAt: nowIso,
    };

    const next = [record, ...existing.filter((c) => c.uid !== uid)].slice(0, 500);
    liveCrmCustomers = next;
    crmCustomersListeners.forEach((cb) => cb(next));
    writeBackupList(LOCAL_CRM_CUSTOMERS_KEY, next);

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ crmCustomers: next }), 2500),
      setDoc(doc(db, 'users', uid), sanitizeForFirestore(record), { merge: true }).catch(() => {}),
    ]);
    return record;
  },

  async recordCustomerDuePayment(params: {
    orderId: string;
    amount: number;
    method: PaymentMethod;
    trxId?: string;
    senderNumber?: string;
    receivedBy: string;
    note?: string;
  }): Promise<Order | null> {
    const payAmt = Math.max(0, Number(params.amount) || 0);
    if (payAmt <= 0) return null;

    const { orderService } = await import('./orderService');
    const localOrd = orderService.getLocalOrders().find((o) => o.id === params.orderId);
    let baseOrder: Order | null = localOrd || null;

    try {
      const snap = await withTimeout(getDoc(doc(db, 'orders', params.orderId)), 2500);
      if (snap.exists()) {
        baseOrder = { id: snap.id, ...(snap.data() as Omit<Order, 'id'>) };
      }
    } catch {
      // use local
    }
    if (!baseOrder) return null;

    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const total = Math.max(0, Number(baseOrder.total) || 0);
    const currentPaid =
      typeof baseOrder.paidAmount === 'number'
        ? baseOrder.paidAmount
        : baseOrder.paymentStatus === 'paid'
          ? total
          : Math.max(0, Number(baseOrder.advanceAmount ?? baseOrder.paymentDetails?.advanceAmount) || 0);

    const newPaid = Math.min(total, currentPaid + payAmt);
    const newDue = Math.max(0, total - newPaid);
    const nextPayStatus = newDue <= 0 ? 'paid' : baseOrder.paymentStatus;

    const logEntry: CustomerPaymentLog = {
      id: `pay_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      amount: payAmt,
      method: params.method,
      trxId: params.trxId?.trim() || undefined,
      senderNumber: params.senderNumber?.trim() || undefined,
      receivedBy: params.receivedBy || 'Admin',
      note: params.note?.trim() || 'Due payment collection',
      date: `${yyyy}-${mm}-${dd}`,
      timestamp: now.toISOString(),
    };

    const nextHistory = [...(baseOrder.paymentHistory || []), logEntry];
    const nextTimeline = [
      ...(baseOrder.timeline || []),
      {
        status: baseOrder.orderStatus,
        timestamp: now.toISOString(),
        note: `Due payment collected: ৳${payAmt.toLocaleString('en-BD')} via ${params.method.toUpperCase()} (${params.receivedBy})`,
      },
    ];

    const updatedOrder: Order = {
      ...baseOrder,
      paidAmount: newPaid,
      dueAmount: newDue,
      advanceAmount: newPaid,
      dueOnDelivery: newDue,
      paymentStatus: nextPayStatus,
      paymentHistory: nextHistory,
      timeline: nextTimeline,
      updatedAt: now.toISOString(),
    };

    orderService.saveLocalOrder(updatedOrder);

    try {
      await setDoc(
        doc(db, 'orders', baseOrder.id),
        sanitizeForFirestore({
          paidAmount: newPaid,
          dueAmount: newDue,
          advanceAmount: newPaid,
          dueOnDelivery: newDue,
          paymentStatus: nextPayStatus,
          paymentHistory: nextHistory,
          timeline: nextTimeline,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    } catch {
      // queued offline
    }

    return updatedOrder;
  },
};
