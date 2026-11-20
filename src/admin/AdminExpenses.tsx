import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, Search, Wallet, X, Pencil, Tag } from 'lucide-react';
import { ExpenseEntry, ExpenseCategory } from '../types';
import { posService } from '../services/posService';
import { useAuth } from '../context/AuthContext';
import {
  EXPENSE_CATEGORY_META,
  EXPENSE_QUICK_PRESETS,
  getLocalDateKey,
  getLocalMonthKey,
  normalizeEntryDateKey,
} from '../lib/accountingUtils';
import { AdminPageHeader } from './AdminLayout';

export const AdminExpenses: React.FC = () => {
  const { currentUser, staffProfile } = useAuth();
  const [expenses, setExpenses] = useState<ExpenseEntry[]>(() => posService.getInstantExpenses());
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState<string>('all');
  const [dateScope, setDateScope] = useState<'all' | 'today' | 'month'>('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [todayKey, setTodayKey] = useState(() => getLocalDateKey());
  const [monthKey, setMonthKey] = useState(() => getLocalMonthKey());

  // Form fields
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('packaging_courier');
  const [amount, setAmount] = useState<number>(0);
  const [date, setDate] = useState(() => getLocalDateKey());
  const [time, setTime] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });
  const [paymentMethod, setPaymentMethod] = useState<ExpenseEntry['paymentMethod']>('cash');
  const [paidBy, setPaidBy] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    const unsub = posService.subscribeToExpenses(setExpenses);
    const interval = setInterval(() => {
      const nextDay = getLocalDateKey();
      const nextMonth = getLocalMonthKey();
      setTodayKey((prev) => (prev !== nextDay ? nextDay : prev));
      setMonthKey((prev) => (prev !== nextMonth ? nextMonth : prev));
    }, 30000);
    return () => {
      unsub();
      clearInterval(interval);
    };
  }, []);

  const todayTotal = useMemo(
    () =>
      expenses
        .filter((e) => normalizeEntryDateKey(e.date) === todayKey)
        .reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses, todayKey]
  );

  const monthExpenses = useMemo(
    () => expenses.filter((e) => normalizeEntryDateKey(e.date).startsWith(monthKey)),
    [expenses, monthKey]
  );

  const monthTotal = useMemo(
    () => monthExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [monthExpenses]
  );

  const allTimeTotal = useMemo(
    () => expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
    [expenses]
  );

  const categoryTotalsMonth = useMemo(() => {
    const map: Partial<Record<ExpenseCategory, number>> = {};
    monthExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + (Number(e.amount) || 0);
    });
    return (Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[])
      .map((cat) => ({ cat, amount: map[cat] || 0 }))
      .filter((x) => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  const openCreateModal = () => {
    const now = new Date();
    setEditingId(null);
    setTitle('');
    setCategory('packaging_courier');
    setAmount(0);
    setDate(getLocalDateKey());
    setTime(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    setPaymentMethod('cash');
    setPaidBy(staffProfile?.name || currentUser?.displayName || '');
    setReference('');
    setNotes('');
    setModalOpen(true);
  };

  const openEditModal = (exp: ExpenseEntry) => {
    setEditingId(exp.id);
    setTitle(exp.title);
    setCategory(exp.category);
    setAmount(exp.amount);
    setDate(normalizeEntryDateKey(exp.date) || getLocalDateKey());
    setTime(exp.time || '');
    setPaymentMethod(exp.paymentMethod || 'cash');
    setPaidBy(exp.paidBy || '');
    setReference(exp.reference || '');
    setNotes(exp.notes || '');
    setModalOpen(true);
  };

  const handleApplyPreset = (preset: (typeof EXPENSE_QUICK_PRESETS)[number]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    setPaymentMethod(preset.paymentMethod);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || amount <= 0) return;
    setSaving(true);
    try {
      const actorName = staffProfile?.name || currentUser?.email || 'Admin';
      if (editingId) {
        await posService.updateExpense(editingId, {
          title: title.trim(),
          category,
          amount,
          date,
          time: time.trim() || undefined,
          paymentMethod,
          paidBy: paidBy.trim() || actorName,
          reference: reference.trim(),
          notes: notes.trim(),
        });
      } else {
        await posService.addExpense({
          title,
          category,
          amount,
          date,
          time: time.trim() || undefined,
          paymentMethod,
          paidBy: paidBy.trim() || actorName,
          reference,
          notes,
          createdBy: actorName,
        });
      }
      setModalOpen(false);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const filtered = expenses.filter((exp) => {
    const dk = normalizeEntryDateKey(exp.date);
    if (dateScope === 'today' && dk !== todayKey) return false;
    if (dateScope === 'month' && !dk.startsWith(monthKey)) return false;
    if (catFilter !== 'all' && exp.category !== catFilter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        exp.title.toLowerCase().includes(q) ||
        exp.paidBy?.toLowerCase().includes(q) ||
        exp.reference?.toLowerCase().includes(q) ||
        exp.notes?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const filteredSum = filtered.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Expenses & Operating Costs"
        subtitle="Rent, salaries, ads, courier/COD & operating charges"
        actions={
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-black text-white text-xs font-bold uppercase tracking-wider rounded-lg hover:bg-neutral-800 cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Add Expense / Charge</span>
          </button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 tabular-nums">
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            Today&apos;s Expenses ({todayKey})
          </span>
          <p className="text-2xl font-black font-mono text-red-700 mt-1">
            ৳{todayTotal.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
            This Month Expenses ({monthKey})
          </span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{monthTotal.toLocaleString('en-BD')}
          </p>
        </div>
        <div className="bg-white border border-neutral-200 rounded-xl p-4">
          <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">All-Time Expenses</span>
          <p className="text-2xl font-black font-mono text-neutral-900 mt-1">
            ৳{allTimeTotal.toLocaleString('en-BD')}
          </p>
        </div>
      </div>

      {/* Category Breakdown Strip for Current Month */}
      {categoryTotalsMonth.length > 0 && (
        <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-2.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold uppercase tracking-wider text-neutral-600 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" /> This Month Category Breakdown
            </span>
            <span className="text-[11px] text-neutral-400 font-mono">
              Total: ৳{monthTotal.toLocaleString('en-BD')}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 tabular-nums">
            {categoryTotalsMonth.map(({ cat, amount: catAmt }) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCatFilter((prev) => (prev === cat ? 'all' : cat))}
                className={`text-left p-2.5 rounded-lg border transition-colors cursor-pointer ${
                  catFilter === cat
                    ? 'border-black bg-neutral-900 text-white'
                    : 'border-neutral-200 bg-neutral-50/70 hover:border-neutral-400'
                }`}
              >
                <p className={`text-[10px] font-semibold truncate ${catFilter === cat ? 'text-neutral-300' : 'text-neutral-500'}`}>
                  {EXPENSE_CATEGORY_META[cat].label}
                </p>
                <p className="text-sm font-black font-mono mt-0.5">
                  ৳{catAmt.toLocaleString('en-BD')}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 flex flex-col lg:flex-row gap-3 items-stretch lg:items-center">
        <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start">
          {([
            { id: 'all', label: 'All Dates' },
            { id: 'today', label: 'Today' },
            { id: 'month', label: 'This Month' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setDateScope(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                dateScope === tab.id ? 'bg-white text-neutral-900 shadow-xs' : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search description, voucher/ref #, staff, or notes..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
        >
          <option value="all">All Expense &amp; Charge Categories</option>
          {(Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[]).map((k) => (
            <option key={k} value={k}>
              {EXPENSE_CATEGORY_META[k].label} ({EXPENSE_CATEGORY_META[k].bnLabel})
            </option>
          ))}
        </select>
      </div>

      {/* Expense Ledger Table */}
      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-xs text-neutral-500 space-y-2">
            <Wallet className="w-9 h-9 text-neutral-300 mx-auto" />
            <p className="font-bold text-neutral-900 text-sm">No expenses match this filter</p>
            <p className="text-neutral-400">
              Add ad spend, rent, courier charges, MFS cashout fees, packaging, transport, or salary entries for accurate P&amp;L.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Date</th>
                  <th className="p-3.5">Description &amp; Notes</th>
                  <th className="p-3.5">Category</th>
                  <th className="p-3.5">Paid By / Method</th>
                  <th className="p-3.5 text-right">Amount</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                {filtered.map((exp) => {
                  const meta = EXPENSE_CATEGORY_META[exp.category];
                  return (
                    <tr key={exp.id} className="hover:bg-neutral-50/50">
                      <td className="p-3.5 font-mono text-neutral-600 whitespace-nowrap">
                        <span className="block">{normalizeEntryDateKey(exp.date)}</span>
                        {exp.time && <span className="text-[10px] text-neutral-400">{exp.time}</span>}
                      </td>
                      <td className="p-3.5">
                        <p className="font-semibold text-neutral-900">{exp.title}</p>
                        {(exp.reference || exp.notes) && (
                          <p className="text-[11px] text-neutral-400">
                            {exp.reference ? `Ref: ${exp.reference}` : ''}
                            {exp.reference && exp.notes ? ' · ' : ''}
                            {exp.notes || ''}
                          </p>
                        )}
                      </td>
                      <td className="p-3.5 text-neutral-700">
                        <span className="block">{meta ? meta.label : exp.category}</span>
                        {meta && <span className="text-[10px] text-neutral-400">{meta.bnLabel}</span>}
                      </td>
                      <td className="p-3.5 text-neutral-600">
                        <span>{exp.paidBy || 'Store Cash'}</span>
                        <span className="text-neutral-400"> · {(exp.paymentMethod || 'cash').toUpperCase()}</span>
                      </td>
                      <td className="p-3.5 text-right font-mono font-bold text-red-700">
                        ৳{(Number(exp.amount) || 0).toLocaleString('en-BD')}
                      </td>
                      <td className="p-3.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => openEditModal(exp)}
                          className="p-1.5 text-neutral-400 hover:text-black cursor-pointer mr-1"
                          title="Edit Expense"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => posService.deleteExpense(exp.id)}
                          className="p-1.5 text-neutral-400 hover:text-red-600 cursor-pointer"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-neutral-50 border-t border-neutral-200 font-bold text-xs tabular-nums">
                <tr>
                  <td colSpan={4} className="p-3.5 text-neutral-700">
                    Showing {filtered.length} entries
                  </td>
                  <td className="p-3.5 text-right font-mono text-red-800">
                    ৳{filteredSum.toLocaleString('en-BD')}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-xl border border-neutral-200 max-w-lg w-full p-5 space-y-4 my-6">
            <div className="flex items-center justify-between border-b border-neutral-200 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
                {editingId ? 'Edit Expense / Charge Entry' : 'Add Expense or Charge Entry'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1 text-neutral-400 hover:text-black cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!editingId && (
              <div className="space-y-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 block">
                  Quick-Fill Common Expenses &amp; Charges
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {EXPENSE_QUICK_PRESETS.map((preset) => (
                    <button
                      key={preset.title}
                      type="button"
                      onClick={() => handleApplyPreset(preset)}
                      className="px-2 py-1 text-[11px] font-medium bg-neutral-100 hover:bg-neutral-200 text-neutral-800 rounded-md transition-colors cursor-pointer"
                    >
                      {preset.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSave} className="space-y-3.5 text-xs">
              <div>
                <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                  Expense / Charge Description <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Facebook Boost Ads / Steadfast COD Charge / Store Rent"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold"
                  >
                    {(Object.keys(EXPENSE_CATEGORY_META) as ExpenseCategory[]).map((k) => (
                      <option key={k} value={k}>
                        {EXPENSE_CATEGORY_META[k].label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Amount (৳) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    required
                    value={amount || ''}
                    onChange={(e) => setAmount(Number(e.target.value) || 0)}
                    placeholder="500"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Time</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as ExpenseEntry['paymentMethod'])}
                    className="w-full px-2.5 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-semibold"
                  >
                    <option value="cash">Cash</option>
                    <option value="bkash">bKash</option>
                    <option value="nagad">Nagad</option>
                    <option value="rocket">Rocket</option>
                    <option value="bank">Bank Transfer</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Paid By Staff / Account
                  </label>
                  <input
                    type="text"
                    value={paidBy}
                    onChange={(e) => setPaidBy(e.target.value)}
                    placeholder="e.g. Store Petty Cash / Accounts"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">
                    Voucher / TrxID / Ref #
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="Optional receipt or TrxID"
                    className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase text-neutral-600 block mb-1">Notes</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional details about this expense or charge"
                  className="w-full px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg"
                />
              </div>

              <div className="flex gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="flex-1 py-2.5 border border-neutral-300 text-neutral-700 font-bold uppercase rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 bg-black text-white font-bold uppercase rounded-lg hover:bg-neutral-800 disabled:opacity-50 cursor-pointer"
                >
                  {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Save Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
