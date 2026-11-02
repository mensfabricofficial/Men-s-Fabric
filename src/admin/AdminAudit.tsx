import React, { useState, useEffect } from 'react';
import { History, Shield, Clock } from 'lucide-react';
import { AuditLog } from '../types';
import { settingsService } from '../services/settingsService';

export const AdminAudit: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    settingsService.getAuditLogs().then((res) => {
      setLogs(res);
      setLoading(false);
    });
  }, []);

  return (
    <div className="space-y-6">
      
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-neutral-900">
          Admin Audit Logs
        </h1>
        <p className="text-xs text-neutral-500 mt-0.5">
          Immutable historical trail of administrator actions (product edits, status changes, settings updates).
        </p>
      </div>

      <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden shadow-xs">
        {loading ? (
          <div className="p-8 text-center text-xs text-neutral-500">Loading audit records...</div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-neutral-500">
            <History className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
            <h4 className="text-sm font-bold text-neutral-900 mb-1">No administrative actions logged yet</h4>
            <p className="text-xs text-neutral-500">Actions taken in the admin portal will be recorded here automatically.</p>
          </div>
        ) : (
          <table className="w-full text-xs text-left">
            <thead className="bg-neutral-50 text-neutral-500 uppercase tracking-wider font-bold border-b border-neutral-200">
              <tr>
                <th className="p-3.5">Timestamp</th>
                <th className="p-3.5">Admin</th>
                <th className="p-3.5">Action</th>
                <th className="p-3.5">Target</th>
                <th className="p-3.5">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 font-medium">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-neutral-50/50">
                  <td className="p-3.5 text-neutral-500 font-mono">
                    {log.timestamp?.toDate ? log.timestamp.toDate().toLocaleString('en-BD') : 'Recent'}
                  </td>
                  <td className="p-3.5 text-neutral-800">{log.adminEmail || log.adminUid}</td>
                  <td className="p-3.5">
                    <span className="bg-neutral-100 text-neutral-900 font-bold px-2 py-0.5 rounded uppercase text-[10px]">
                      {log.action}
                    </span>
                  </td>
                  <td className="p-3.5 font-mono text-neutral-600">{log.target}</td>
                  <td className="p-3.5 text-neutral-600">{log.details}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
};
