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
import {
  Supplier,
  PurchaseEntry,
  ExpenseEntry,
  PartnerDeskConfig,
  Product,
  SalesTargetsConfig,
} from '../types';
import { sanitizeForFirestore } from '../lib/firestoreSanitizer';
import { productService } from './productService';

const LOCAL_SUPPLIERS_KEY = 'mf_pos_suppliers_v1';
const LOCAL_PURCHASES_KEY = 'mf_pos_purchases_v1';
const LOCAL_EXPENSES_KEY = 'mf_pos_expenses_v1';
const LOCAL_PARTNERS_KEY = 'mf_partner_desks_v1';
const LOCAL_TARGETS_KEY = 'mf_pos_sales_targets_v1';

const LEDGER_DOC = doc(db, 'settings', 'pos_ledger');
const PARTNERS_DOC = doc(db, 'settings', 'partnerPipeline');
const TARGETS_DOC = doc(db, 'settings', 'sales_targets');

export const DEFAULT_SALES_TARGETS: SalesTargetsConfig = {
  dailyAmountTarget: 25000,
  dailyPcsTarget: 20,
  monthlyAmountTarget: 600000,
  monthlyPcsTarget: 500,
  monthlyProfitTarget: 150000,
};

export const DEFAULT_PARTNER_DESKS: PartnerDeskConfig[] = [
  {
    stage: 'order_verification',
    partnerName: 'Order Verifier Desk',
    roleTitle: 'Order Verification',
    partnerEmail: '',
    partnerPhone: '',
  },
  {
    stage: 'payment_verification',
    partnerName: 'Payment Accounts Desk',
    roleTitle: 'Payment Verification',
    partnerEmail: '',
    partnerPhone: '',
  },
  {
    stage: 'inventory_packing',
    partnerName: 'Packaging & Inventory Desk',
    roleTitle: 'Stock & Inventory',
    partnerEmail: '',
    partnerPhone: '',
  },
  {
    stage: 'delivery_dispatch',
    partnerName: 'Delivery & Dispatch Desk',
    roleTitle: 'Delivery & Dispatch',
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

const writeLocalList = <T,>(key: string, list: T[], eventName?: string) => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(list));
    if (eventName) {
      window.dispatchEvent(new CustomEvent(eventName, { detail: list }));
    }
  } catch {
    // ignore
  }
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
}) => {
  ledgerWriteChain = ledgerWriteChain.then(async () => {
    try {
      await setDoc(
        LEDGER_DOC,
        sanitizeForFirestore({
          ...partial,
          updatedAt: serverTimestamp(),
        }),
        { merge: true }
      );
    } catch {
      // ignore if offline
    }
  });
  return ledgerWriteChain;
};

export const posService = {
  // ======================== SALES TARGETS ========================
  getLocalTargets(): SalesTargetsConfig {
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
      monthlyAmountTarget: Math.max(0, Number(targets.monthlyAmountTarget) || 0),
      monthlyPcsTarget: Math.max(0, Number(targets.monthlyPcsTarget) || 0),
      monthlyProfitTarget: Math.max(0, Number(targets.monthlyProfitTarget) || 0),
      updatedAt: new Date().toISOString(),
    };

    try {
      localStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(clean));
      window.dispatchEvent(new CustomEvent('mf_targets_updated', { detail: clean }));
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
    cb(this.getLocalTargets());

    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<SalesTargetsConfig>).detail;
      if (detail) cb({ ...DEFAULT_SALES_TARGETS, ...detail });
    };
    window.addEventListener('mf_targets_updated', handleLocal);

    const unsubTargetsDoc = onSnapshot(
      TARGETS_DOC,
      (snap) => {
        if (snap.exists()) {
          const data = { ...DEFAULT_SALES_TARGETS, ...(snap.data() as SalesTargetsConfig) };
          try {
            localStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(data));
          } catch {
            // ignore
          }
          cb(data);
        }
      },
      () => {}
    );

    const unsubLedger = onSnapshot(
      LEDGER_DOC,
      (snap) => {
        if (snap.exists() && snap.data()?.targets) {
          const data = { ...DEFAULT_SALES_TARGETS, ...(snap.data().targets as SalesTargetsConfig) };
          try {
            localStorage.setItem(LOCAL_TARGETS_KEY, JSON.stringify(data));
          } catch {
            // ignore
          }
          cb(data);
        }
      },
      () => {}
    );

    return () => {
      window.removeEventListener('mf_targets_updated', handleLocal);
      unsubTargetsDoc();
      unsubLedger();
    };
  },
  // ======================== 4 PARTNER DESKS ========================
  getLocalPartnerDesks(): PartnerDeskConfig[] {
    const saved = readLocalList<PartnerDeskConfig>(LOCAL_PARTNERS_KEY);
    if (saved.length === 4) return saved;
    return DEFAULT_PARTNER_DESKS;
  },

  async savePartnerDesks(desks: PartnerDeskConfig[]): Promise<void> {
    writeLocalList(LOCAL_PARTNERS_KEY, desks, 'mf_partners_updated');
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
    cb(this.getLocalPartnerDesks());

    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<PartnerDeskConfig[]>).detail;
      if (Array.isArray(detail) && detail.length > 0) cb(detail);
    };
    window.addEventListener('mf_partners_updated', handleLocal);

    const unsubRemote = onSnapshot(
      PARTNERS_DOC,
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.desks) && snap.data()?.desks.length === 4) {
          const remoteDesks = snap.data().desks as PartnerDeskConfig[];
          writeLocalList(LOCAL_PARTNERS_KEY, remoteDesks);
          cb(remoteDesks);
        }
      },
      () => {}
    );

    return () => {
      window.removeEventListener('mf_partners_updated', handleLocal);
      unsubRemote();
    };
  },

  // ======================== SUPPLIERS ========================
  getLocalSuppliers(): Supplier[] {
    return readLocalList<Supplier>(LOCAL_SUPPLIERS_KEY);
  },

  subscribeToSuppliers(cb: (list: Supplier[]) => void): Unsubscribe {
    cb(this.getLocalSuppliers());

    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<Supplier[]>).detail;
      if (Array.isArray(detail)) cb(detail);
    };
    window.addEventListener('mf_suppliers_updated', handleLocal);

    const unsubLedger = onSnapshot(
      LEDGER_DOC,
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.suppliers)) {
          const remote = snap.data().suppliers as Supplier[];
          writeLocalList(LOCAL_SUPPLIERS_KEY, remote);
          cb(remote);
        }
      },
      () => {}
    );

    // Also try root collection sync once
    getDocs(collection(db, 'suppliers'))
      .then((snap) => {
        if (!snap.empty) {
          const map = new Map<string, Supplier>();
          this.getLocalSuppliers().forEach((s) => map.set(s.id, s));
          snap.forEach((d) => map.set(d.id, { id: d.id, ...(d.data() as Omit<Supplier, 'id'>) }));
          const merged = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
          writeLocalList(LOCAL_SUPPLIERS_KEY, merged);
          cb(merged);
        }
      })
      .catch(() => {});

    return () => {
      window.removeEventListener('mf_suppliers_updated', handleLocal);
      unsubLedger();
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

    writeLocalList(LOCAL_SUPPLIERS_KEY, next, 'mf_suppliers_updated');
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ suppliers: next }), 2500),
      setDoc(doc(db, 'suppliers', id), sanitizeForFirestore(record), { merge: true }).catch(() => {}),
    ]);
    return record;
  },

  async deleteSupplier(supplierId: string): Promise<void> {
    const next = this.getLocalSuppliers().filter((s) => s.id !== supplierId);
    writeLocalList(LOCAL_SUPPLIERS_KEY, next, 'mf_suppliers_updated');
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ suppliers: next }), 2500),
      deleteDoc(doc(db, 'suppliers', supplierId)).catch(() => {}),
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
    writeLocalList(LOCAL_SUPPLIERS_KEY, next, 'mf_suppliers_updated');
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ suppliers: next }), 2500),
      setDoc(doc(db, 'suppliers', supplierId), sanitizeForFirestore(updated), { merge: true }).catch(() => {}),
    ]);
    return updated;
  },

  // ======================== PURCHASES ========================
  getLocalPurchases(): PurchaseEntry[] {
    return readLocalList<PurchaseEntry>(LOCAL_PURCHASES_KEY);
  },

  subscribeToPurchases(cb: (list: PurchaseEntry[]) => void): Unsubscribe {
    cb(this.getLocalPurchases());

    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<PurchaseEntry[]>).detail;
      if (Array.isArray(detail)) cb(detail);
    };
    window.addEventListener('mf_purchases_updated', handleLocal);

    const unsubLedger = onSnapshot(
      LEDGER_DOC,
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.purchases)) {
          const remote = snap.data().purchases as PurchaseEntry[];
          writeLocalList(LOCAL_PURCHASES_KEY, remote);
          cb(remote);
        }
      },
      () => {}
    );

    return () => {
      window.removeEventListener('mf_purchases_updated', handleLocal);
      unsubLedger();
    };
  },

  async addPurchase(params: {
    supplierId: string;
    supplierName: string;
    date: string;
    items: PurchaseEntry['items'];
    paidAmount: number;
    paymentMethod: PurchaseEntry['paymentMethod'];
    syncStock: boolean;
    notes?: string;
    createdBy?: string;
  }): Promise<PurchaseEntry> {
    const nowIso = new Date().toISOString();
    const id = `pur_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const purchaseNumber = `PO-${Math.floor(10000 + Math.random() * 90000)}`;
    const totalAmount = params.items.reduce((sum, i) => sum + (Number(i.totalCost) || 0), 0);
    const paidAmount = Math.min(totalAmount, Math.max(0, Number(params.paidAmount) || 0));
    const dueAmount = Math.max(0, totalAmount - paidAmount);

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
      stockSynced: params.syncStock,
      notes: params.notes?.trim() || '',
      createdBy: params.createdBy || 'Admin',
      createdAt: nowIso,
    };

    const nextPurchases = [entry, ...this.getLocalPurchases()];
    writeLocalList(LOCAL_PURCHASES_KEY, nextPurchases, 'mf_purchases_updated');

    // Update supplier balance if linked to a real supplier
    let nextSuppliers = this.getLocalSuppliers();
    if (params.supplierId) {
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
      writeLocalList(LOCAL_SUPPLIERS_KEY, nextSuppliers, 'mf_suppliers_updated');
    }

    // Optionally increment product stock & update costPrice for linked catalog items
    if (params.syncStock) {
      const localProducts = productService.getLocalProducts();
      for (const item of params.items) {
        if (!item.productId || item.quantity <= 0) continue;
        try {
          const prodSnap = await getDoc(doc(db, 'products', item.productId)).catch(() => null);
          const prodData = prodSnap && prodSnap.exists()
            ? ({ id: prodSnap.id, ...prodSnap.data() } as Product)
            : localProducts.find((p) => p.id === item.productId);

          if (prodData) {
            const newTotalStock = (Number(prodData.totalStock) || 0) + Number(item.quantity);
            await productService
              .updateProduct(item.productId, {
                totalStock: newTotalStock,
                ...(item.unitCost > 0 ? { costPrice: Number(item.unitCost) } : {}),
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
      setDoc(doc(db, 'purchases', id), sanitizeForFirestore(entry), { merge: true }).catch(() => {}),
    ]);

    return entry;
  },

  async deletePurchase(purchaseId: string): Promise<void> {
    const existing = this.getLocalPurchases();
    const target = existing.find((p) => p.id === purchaseId);
    const nextPurchases = existing.filter((p) => p.id !== purchaseId);
    writeLocalList(LOCAL_PURCHASES_KEY, nextPurchases, 'mf_purchases_updated');

    let nextSuppliers = this.getLocalSuppliers();
    if (target?.supplierId) {
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
      writeLocalList(LOCAL_SUPPLIERS_KEY, nextSuppliers, 'mf_suppliers_updated');
    }

    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ purchases: nextPurchases, suppliers: nextSuppliers }), 2500),
      deleteDoc(doc(db, 'purchases', purchaseId)).catch(() => {}),
    ]);
  },

  // ======================== EXPENSES ========================
  getLocalExpenses(): ExpenseEntry[] {
    return readLocalList<ExpenseEntry>(LOCAL_EXPENSES_KEY);
  },

  subscribeToExpenses(cb: (list: ExpenseEntry[]) => void): Unsubscribe {
    cb(this.getLocalExpenses());

    const handleLocal = (e: Event) => {
      const detail = (e as CustomEvent<ExpenseEntry[]>).detail;
      if (Array.isArray(detail)) cb(detail);
    };
    window.addEventListener('mf_expenses_updated', handleLocal);

    const unsubLedger = onSnapshot(
      LEDGER_DOC,
      (snap) => {
        if (snap.exists() && Array.isArray(snap.data()?.expenses)) {
          const remote = snap.data().expenses as ExpenseEntry[];
          writeLocalList(LOCAL_EXPENSES_KEY, remote);
          cb(remote);
        }
      },
      () => {}
    );

    return () => {
      window.removeEventListener('mf_expenses_updated', handleLocal);
      unsubLedger();
    };
  },

  async addExpense(params: {
    title: string;
    category: ExpenseEntry['category'];
    amount: number;
    date: string;
    paymentMethod: ExpenseEntry['paymentMethod'];
    paidBy?: string;
    reference?: string;
    notes?: string;
    createdBy?: string;
  }): Promise<ExpenseEntry> {
    const id = `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const entry: ExpenseEntry = {
      id,
      title: params.title.trim(),
      category: params.category,
      amount: Math.max(0, Number(params.amount) || 0),
      date: params.date,
      paymentMethod: params.paymentMethod,
      paidBy: params.paidBy?.trim() || '',
      reference: params.reference?.trim() || '',
      notes: params.notes?.trim() || '',
      createdBy: params.createdBy || 'Admin',
      createdAt: new Date().toISOString(),
    };

    const next = [entry, ...this.getLocalExpenses()];
    writeLocalList(LOCAL_EXPENSES_KEY, next, 'mf_expenses_updated');
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
    writeLocalList(LOCAL_EXPENSES_KEY, next, 'mf_expenses_updated');
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ expenses: next }), 2500),
      setDoc(doc(db, 'expenses', expenseId), sanitizeForFirestore(updated), { merge: true }).catch(() => {}),
    ]);
    return updated;
  },

  async deleteExpense(expenseId: string): Promise<void> {
    const next = this.getLocalExpenses().filter((e) => e.id !== expenseId);
    writeLocalList(LOCAL_EXPENSES_KEY, next, 'mf_expenses_updated');
    await Promise.allSettled([
      withTimeout(syncLedgerMirror({ expenses: next }), 2500),
      deleteDoc(doc(db, 'expenses', expenseId)).catch(() => {}),
    ]);
  },
};
