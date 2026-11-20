import React, { useState, useEffect, useMemo } from 'react';
import { History, Search } from 'lucide-react';
import { AuditLog } from '../types';
import { settingsService } from '../services/settingsService';
import { formatDateTime } from '../lib/dateFormat';
import { AdminPageHeader } from './AdminLayout';

export const AdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  useEffect(() => {
    const unsub = settingsService.subscribeToAuditLogs((res) => {
      setLogs(res);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => {
      if (l.action) set.add(l.action);
    });
    return Array.from(set).sort();
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((log) => {
      if (actionFilter !== 'all' && log.action !== actionFilter) return false;
      if (!q) return true;
      return (
        (log.adminEmail || '').toLowerCase().includes(q) ||
        (log.adminUid || '').toLowerCase().includes(q) ||
        (log.action || '').toLowerCase().includes(q) ||
        (log.target || '').toLowerCase().includes(q) ||
        (log.details || '').toLowerCase().includes(q) ||
        (log.entityType || '').toLowerCase().includes(q)
      );
    });
  }, [logs, search, actionFilter]);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Admin Audit Logs"
        subtitle="Real-time immutable trail of staff & admin actions across store operations."
      />

      {/* Filter Bar */}
      <div className="bg-white border border-neutral-200 rounded-xl p-3.5 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by admin email, action, order #, SKU, or details..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:outline-none focus:border-black"
          />
        </div>
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-2 text-xs bg-neutral-50 border border-neutral-200 rounded-lg font-semibold cursor-pointer"
        >
          <option value="all">All Action Types ({logs.length})</option>
          {uniqueActions.map((act) => (
            <option key={act} value={act}>
              {act}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading audit records...</div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <History className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No audit records match your filter</h4>
            <p className="text-xs text-neutral-500">Actions taken in the admin portal are recorded here automatically.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
                <tr>
                  <th className="p-3.5">Timestamp</th>
                  <th className="p-3.5">Staff / Admin</th>
                  <th className="p-3.5">Action</th>
                  <th className="p-3.5">Target</th>
                  <th className="p-3.5">Details &amp; Diff</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100 font-medium tabular-nums">
                {filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-neutral-50/50">
                    <td className="p-3.5 text-neutral-500 font-mono whitespace-nowrap">
                      {formatDateTime(log.timestamp, 'Recent')}
                    </td>
                    <td className="p-3.5 text-neutral-800">{log.adminEmail || log.adminUid}</td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="bg-neutral-100 text-neutral-900 font-bold px-2 py-0.5 rounded uppercase text-[10px]">
                        {log.action}
                      </span>
                      {log.entityType && (
                        <span className="ml-1.5 text-[10px] font-mono uppercase text-neutral-400">
                          [{log.entityType}]
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-neutral-700 whitespace-nowrap">{log.target}</td>
                    <td className="p-3.5 text-neutral-600">
                      <p>{log.details}</p>
                      {(log.beforeValue || log.afterValue) && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1 font-mono text-[10px]">
                          {log.beforeValue && (
                            <span className="px-1.5 py-0.5 bg-neutral-100 text-neutral-600 rounded border border-neutral-200">
                              Before: {log.beforeValue}
                            </span>
                          )}
                          {log.beforeValue && log.afterValue && (
                            <span className="text-neutral-400">→</span>
                          )}
                          {log.afterValue && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-800 rounded border border-emerald-200 font-bold">
                              After: {log.afterValue}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
