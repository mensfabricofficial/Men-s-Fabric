import React, { useState } from 'react';
import { DailySeriesPoint, MonthlySeriesPoint } from '../../lib/accountingUtils';

interface TargetProgressRowProps {
  label: string;
  subLabel?: string;
  currentValue: number;
  targetValue: number;
  unitPrefix?: string;
  unitSuffix?: string;
  accentColor?: 'emerald' | 'blue' | 'amber' | 'neutral';
}

export const TargetProgressRow: React.FC<TargetProgressRowProps> = ({
  label,
  subLabel,
  currentValue,
  targetValue,
  unitPrefix = '',
  unitSuffix = '',
  accentColor = 'neutral',
}) => {
  const safeTarget = Math.max(0, targetValue);
  const rawPct = safeTarget > 0 ? (currentValue / safeTarget) * 100 : 0;
  const clampedPct = Math.max(0, Math.min(100, rawPct));
  const achieved = safeTarget > 0 && currentValue >= safeTarget;
  const remaining = Math.max(0, safeTarget - currentValue);
  const surplus = Math.max(0, currentValue - safeTarget);

  const barColors: Record<NonNullable<TargetProgressRowProps['accentColor']>, string> = {
    emerald: achieved ? 'bg-emerald-600' : 'bg-emerald-500',
    blue: achieved ? 'bg-emerald-600' : 'bg-blue-600',
    amber: achieved ? 'bg-emerald-600' : 'bg-amber-500',
    neutral: achieved ? 'bg-emerald-600' : 'bg-neutral-900',
  };

  const formatVal = (v: number) => `${unitPrefix}${Math.round(v).toLocaleString('en-BD')}${unitSuffix}`;

  return (
    <div className="space-y-1.5 tabular-nums">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <div className="min-w-0">
          <span className="font-bold text-neutral-900">{label}</span>
          {subLabel && <span className="text-[11px] text-neutral-500 ml-1.5">· {subLabel}</span>}
        </div>
        <div className="flex items-center gap-2 shrink-0 font-mono">
          <span className="font-bold text-neutral-900">{formatVal(currentValue)}</span>
          <span className="text-neutral-400">/ {formatVal(safeTarget)}</span>
          <span
            className={`font-bold text-[11px] px-1.5 py-0.5 rounded ${
              achieved
                ? 'bg-emerald-100 text-emerald-800'
                : rawPct >= 50
                  ? 'bg-neutral-100 text-neutral-800'
                  : 'bg-amber-50 text-amber-800'
            }`}
          >
            {rawPct.toFixed(1)}%
          </span>
        </div>
      </div>

      <div className="h-2.5 w-full bg-neutral-100 rounded-full overflow-hidden border border-neutral-200/70">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barColors[accentColor]}`}
          style={{ width: `${clampedPct}%` }}
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-neutral-500">
        {safeTarget <= 0 ? (
          <span>No target configured yet</span>
        ) : achieved ? (
          <span className="text-emerald-700 font-semibold">
            Target Achieved! Surplus: +{formatVal(surplus)}
          </span>
        ) : (
          <span>Remaining to target: {formatVal(remaining)}</span>
        )}
        <span className="font-mono">{clampedPct.toFixed(0)}% complete</span>
      </div>
    </div>
  );
};

interface DailyPerformanceChartProps {
  data: DailySeriesPoint[];
  dailyAmountTarget: number;
  dailyPcsTarget: number;
}

export const DailyPerformanceChart: React.FC<DailyPerformanceChartProps> = ({
  data,
  dailyAmountTarget,
  dailyPcsTarget,
}) => {
  const [metric, setMetric] = useState<'sales' | 'pcs' | 'netProfit'>('sales');
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const values = data.map((d) =>
    metric === 'sales' ? d.sales : metric === 'pcs' ? d.pcs : d.netProfit
  );
  const targetVal =
    metric === 'sales' ? dailyAmountTarget : metric === 'pcs' ? dailyPcsTarget : 0;

  const maxAbs = Math.max(
    1,
    targetVal,
    ...values.map((v) => Math.abs(v))
  );

  const activePoint = hoveredIdx !== null ? data[hoveredIdx] : data[data.length - 1];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
            Daily Performance Trend (Last {data.length} Days)
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Automatic daily midnight tracking · Hover or tap any bar to inspect daily numbers
          </p>
        </div>

        <div className="inline-flex items-center gap-1 p-1 bg-neutral-100 rounded-lg self-start sm:self-auto">
          {([
            { id: 'sales', label: 'Sales (৳)' },
            { id: 'pcs', label: 'Pieces (Pcs)' },
            { id: 'netProfit', label: 'Net Profit / Loss' },
          ] as const).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMetric(tab.id)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                metric === tab.id
                  ? 'bg-white text-neutral-900 shadow-xs'
                  : 'text-neutral-600 hover:text-neutral-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Highlight Readout */}
      {activePoint && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-neutral-50 border border-neutral-200/80 rounded-lg text-xs tabular-nums">
          <div className="font-semibold text-neutral-800">
            {activePoint.fullLabel}{' '}
            <span className="text-neutral-400 font-mono">({activePoint.dateKey})</span>
          </div>
          <div className="flex flex-wrap items-center gap-4 font-mono">
            <span>
              Orders: <b>{activePoint.orderCount}</b>
            </span>
            <span>
              Sold: <b>{activePoint.pcs} pcs</b>
            </span>
            <span>
              Sales: <b>৳{activePoint.sales.toLocaleString('en-BD')}</b>
            </span>
            <span>
              Expenses: <b className="text-red-700">৳{activePoint.expenses.toLocaleString('en-BD')}</b>
            </span>
            <span>
              Net:{' '}
              <b className={activePoint.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                {activePoint.netProfit < 0 ? '-' : ''}৳{Math.abs(activePoint.netProfit).toLocaleString('en-BD')}
              </b>
            </span>
          </div>
        </div>
      )}

      {/* Bar Chart */}
      <div className="relative pt-5 pb-1">
        {targetVal > 0 && metric !== 'netProfit' && (
          <div
            className="absolute left-0 right-0 border-t border-dashed border-amber-500/80 pointer-events-none z-10 flex justify-end"
            style={{
              bottom: `${Math.min(164, Math.round((targetVal / maxAbs) * 136) + 28)}px`,
            }}
          >
            <span className="bg-amber-50 text-amber-800 border border-amber-200 px-1.5 py-0.5 text-[10px] font-mono font-bold rounded -translate-y-1/2">
              Target: {metric === 'sales' ? `৳${targetVal.toLocaleString('en-BD')}` : `${targetVal} pcs`}
            </span>
          </div>
        )}

        <div className="flex items-end gap-1.5 sm:gap-2 h-44 pt-4">
          {data.map((pt, idx) => {
            const val = metric === 'sales' ? pt.sales : metric === 'pcs' ? pt.pcs : pt.netProfit;
            const heightPct = Math.max(val === 0 ? 3 : 8, Math.round((Math.abs(val) / maxAbs) * 100));
            const isNegative = val < 0;
            const isHovered = hoveredIdx === idx;
            const hitTarget = targetVal > 0 && val >= targetVal;

            let barColor = 'bg-neutral-900';
            if (metric === 'netProfit') {
              barColor = isNegative ? 'bg-red-600' : 'bg-emerald-600';
            } else if (metric === 'pcs') {
              barColor = hitTarget ? 'bg-emerald-600' : 'bg-blue-600';
            } else {
              barColor = hitTarget ? 'bg-emerald-600' : 'bg-neutral-900';
            }

            return (
              <button
                key={pt.dateKey}
                type="button"
                onMouseEnter={() => setHoveredIdx(idx)}
                onMouseLeave={() => setHoveredIdx(null)}
                onClick={() => setHoveredIdx(idx)}
                className="flex-1 min-w-0 flex flex-col items-center justify-end h-full group cursor-pointer focus:outline-none"
              >
                <div className="w-full flex-1 flex items-end justify-center">
                  <div
                    className={`w-full max-w-[26px] rounded-t transition-opacity ${barColor} ${
                      isHovered ? 'opacity-100 ring-2 ring-black/20' : 'opacity-85 group-hover:opacity-100'
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className="mt-2 text-[9px] sm:text-[10px] font-mono text-neutral-500 whitespace-nowrap">
                  {pt.shortLabel.split(' ')[0]}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface MonthlyPerformanceChartProps {
  data: MonthlySeriesPoint[];
  monthlyAmountTarget: number;
  monthlyProfitTarget: number;
}

export const MonthlyPerformanceChart: React.FC<MonthlyPerformanceChartProps> = ({
  data,
  monthlyAmountTarget,
  monthlyProfitTarget,
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const maxVal = Math.max(
    1,
    monthlyAmountTarget,
    monthlyProfitTarget,
    ...data.map((m) => Math.max(m.sales, m.totalCostAndExp, Math.abs(m.netProfit)))
  );

  const activeMonth = hoveredIdx !== null ? data[hoveredIdx] : data[data.length - 1];

  return (
    <div className="bg-white border border-neutral-200 rounded-xl p-5 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-900">
            Monthly Sales, Costs &amp; Net Profit / Loss ({data.length} Months)
          </h3>
          <p className="text-xs text-neutral-500 mt-0.5">
            Automatically groups and resets each calendar month · Compare revenue, total costs, and bottom-line profit
          </p>
        </div>

        <div className="flex items-center gap-3 text-[11px] font-semibold text-neutral-600 shrink-0">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-neutral-900 inline-block" /> Sales
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" /> Cost + Exp
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 inline-block" /> Net Profit
          </span>
        </div>
      </div>

      {activeMonth && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 bg-neutral-50 border border-neutral-200/80 rounded-lg text-xs tabular-nums">
          <span className="font-bold text-neutral-900">{activeMonth.fullLabel}</span>
          <div className="flex flex-wrap items-center gap-4 font-mono">
            <span>
              Orders: <b>{activeMonth.orderCount}</b> ({activeMonth.pcs} pcs)
            </span>
            <span>
              Sales: <b>৳{activeMonth.sales.toLocaleString('en-BD')}</b>
            </span>
            <span>
              COGS+Exp: <b className="text-amber-700">৳{activeMonth.totalCostAndExp.toLocaleString('en-BD')}</b>
            </span>
            <span>
              Purchases: <b>৳{activeMonth.purchases.toLocaleString('en-BD')}</b>
            </span>
            <span>
              Net:{' '}
              <b className={activeMonth.netProfit >= 0 ? 'text-emerald-700' : 'text-red-700'}>
                {activeMonth.netProfit < 0 ? '-' : ''}৳{Math.abs(activeMonth.netProfit).toLocaleString('en-BD')}
              </b>
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-6 gap-3 items-end h-48 pt-4">
        {data.map((m, idx) => {
          const salesH = Math.max(m.sales === 0 ? 4 : 8, Math.round((m.sales / maxVal) * 100));
          const costH = Math.max(m.totalCostAndExp === 0 ? 4 : 8, Math.round((m.totalCostAndExp / maxVal) * 100));
          const profitH = Math.max(m.netProfit === 0 ? 4 : 8, Math.round((Math.abs(m.netProfit) / maxVal) * 100));
          const isLoss = m.netProfit < 0;

          return (
            <button
              key={m.monthKey}
              type="button"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
              onClick={() => setHoveredIdx(idx)}
              className={`flex flex-col items-center justify-end h-full p-1 rounded-lg transition-colors cursor-pointer ${
                hoveredIdx === idx ? 'bg-neutral-50' : ''
              }`}
            >
              <div className="w-full flex-1 flex items-end justify-center gap-1">
                <div
                  className="w-2.5 sm:w-3.5 bg-neutral-900 rounded-t"
                  style={{ height: `${salesH}%` }}
                  title={`Sales: ৳${m.sales.toLocaleString('en-BD')}`}
                />
                <div
                  className="w-2.5 sm:w-3.5 bg-amber-500 rounded-t"
                  style={{ height: `${costH}%` }}
                  title={`COGS + Expenses: ৳${m.totalCostAndExp.toLocaleString('en-BD')}`}
                />
                <div
                  className={`w-2.5 sm:w-3.5 rounded-t ${isLoss ? 'bg-red-600' : 'bg-emerald-600'}`}
                  style={{ height: `${profitH}%` }}
                  title={`${isLoss ? 'Loss' : 'Net Profit'}: ৳${Math.abs(m.netProfit).toLocaleString('en-BD')}`}
                />
              </div>
              <span className="mt-2 text-[11px] font-bold text-neutral-700">{m.shortLabel}</span>
              <span className="text-[10px] font-mono text-neutral-400">{m.pcs} pcs</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
