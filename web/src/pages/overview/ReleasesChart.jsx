// "Releases & reviews": grouped day bars (submitted | approved + rejected) with hover tooltip. Plain divs, no chart lib.
import { useMemo, useState } from 'react';
import { Card, cx } from '../../components/ui.jsx';
import { useData, LS } from '../../lib/store.jsx';
import { chartSeries } from '../../lib/model.js';
import { date, dateLong, dur } from '../../lib/format.js';

const RANGES = [7, 14, 30];

function niceMax(n) {
  if (n <= 4) return 4;
  if (n <= 8) return 8;
  const step = Math.ceil(n / 4);
  return step * 4;
}

function RangeToggle({ value, onChange }) {
  return (
    <div className="flex gap-[2px] p-1 bg-surface-2 rounded-[12px]" role="tablist" aria-label="Range">
      {RANGES.map((d) => (
        <button key={d} role="tab" aria-selected={value === d} onClick={() => onChange(d)}
          className={cx('px-3 py-[6px] rounded-[9px] text-[12.5px] font-bold', value === d ? 'bg-surface text-ink shadow-[0_1px_3px_rgba(15,17,12,.1)]' : 'text-ink-2 hover:text-ink')}>
          {d}d
        </button>
      ))}
    </div>
  );
}

export function ReleasesChart({ className, compact }) {
  const { M, apps, pending } = useData();
  const [days, setDaysState] = useState(() => (RANGES.includes(LS.get('rr-range', 14)) ? LS.get('rr-range', 14) : 14));
  const setDays = (d) => { setDaysState(d); LS.set('rr-range', d); };
  const [hover, setHover] = useState(null);

  const series = useMemo(() => chartSeries({ apps }, days), [apps, days]);
  const totals = series.reduce((t, d) => ({ submitted: t.submitted + d.submitted, approved: t.approved + d.approved, rejected: t.rejected + d.rejected, ms: [...t.ms, ...d.reviewMs] }), { submitted: 0, approved: 0, rejected: 0, ms: [] });
  const avgMs = totals.ms.length ? totals.ms.reduce((a, b) => a + b, 0) / totals.ms.length : M?.stats?.medianReviewMs?.appstore ?? null;
  // Builds still waiting / in review that were submitted today show as a hatched "pending" bar.
  const today = series[series.length - 1];
  const pendingToday = (pending || []).filter((r) => (r.submittedAt || r.since) >= today.d0).length;
  const max = niceMax(Math.max(1, ...series.map((d, i) => Math.max(d.submitted, d.approved + d.rejected + (i === series.length - 1 ? pendingToday : 0)))));
  const ticks = [4, 3, 2, 1, 0].map((i) => (max / 4) * i);
  const barW = days === 30 ? 'max-w-[6px]' : days === 7 ? 'max-w-[16px]' : 'max-w-[12px]';
  const gap = days === 30 ? 'gap-[2px]' : 'gap-[4px]';
  const labelEvery = days === 30 ? 5 : 1;
  const h = (n) => `${(n / max) * 100}%`;
  const hd = hover != null ? series[hover] : null;

  return (
    <Card className={cx('flex flex-col gap-5 p-6 min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <h2 className="text-[17px] font-extrabold tracking-[-0.2px] text-ink">Releases &amp; reviews</h2>
          <p className="mt-1 text-[13px] font-medium text-ink-3 truncate">Builds submitted vs. review outcomes, last {days} days</p>
        </div>
        <RangeToggle value={days} onChange={setDays} />
      </div>

      <div className="flex flex-wrap items-end gap-x-6 sm:gap-x-8 gap-y-3">
        {[
          ['Submitted', totals.submitted, 'bg-primary'],
          ['Approved', totals.approved, 'bg-accent'],
          ['Rejected', totals.rejected, 'bg-red'],
          ['Avg review time', avgMs != null ? dur(avgMs) : '—', null],
        ].map(([l, v, sw]) => (
          <div key={l} className="flex flex-col gap-[6px]">
            <div className="flex items-center gap-[6px]">
              {sw && <span className={cx('size-[10px] rounded-[3px]', sw)} />}
              <span className="text-[12.5px] font-semibold text-ink-2 whitespace-nowrap">{l}</span>
            </div>
            <div className="text-[24px] leading-none font-extrabold tracking-[-0.5px] text-ink whitespace-nowrap">{v}</div>
          </div>
        ))}
      </div>

      <div className={cx('flex gap-3 min-h-0', compact ? 'h-[170px]' : 'max-md:h-[200px] md:flex-1 md:min-h-[150px]')}>
        <div className="flex flex-col justify-between pb-[26px]">
          {ticks.map((t) => <span key={t} className="text-[11px] font-semibold text-ink-3 leading-none">{Math.round(t)}</span>)}
        </div>
        <div className="relative flex-1 flex gap-[4px] min-w-0" onMouseLeave={() => setHover(null)}>
          {series.map((d, i) => {
            const isToday = i === series.length - 1;
            const on = hover === i;
            const pend = isToday ? pendingToday : 0;
            return (
              <div key={d.d0} onMouseEnter={() => setHover(i)} onClick={() => setHover(on ? null : i)}
                className={cx('flex-1 min-w-0 flex flex-col items-center gap-[10px] rounded-[10px] cursor-default', on && 'bg-surface-2')}>
                <div className={cx('flex-1 w-full flex justify-center items-end', gap)}>
                  <div className={cx('flex-1 min-w-[3px] bg-primary rounded-[4px_4px_2px_2px]', barW)} style={{ height: h(d.submitted) }} />
                  <div className={cx('flex-1 min-w-[3px] flex flex-col justify-end gap-[2px] h-full', barW)}>
                    {pend > 0 && <div className="w-full rounded-[4px_4px_2px_2px] border border-accent hatch text-accent" style={{ height: h(pend) }} />}
                    {d.rejected > 0 && <div className="w-full bg-red rounded-[4px_4px_2px_2px]" style={{ height: h(d.rejected) }} />}
                    {d.approved > 0 && <div className={cx('w-full bg-accent', d.rejected || pend ? 'rounded-[2px]' : 'rounded-[4px_4px_2px_2px]')} style={{ height: h(d.approved) }} />}
                  </div>
                </div>
                <span className={cx('text-[11px] font-semibold whitespace-nowrap leading-none h-4', on ? 'text-ink' : 'text-ink-3', (series.length - 1 - i) % labelEvery !== 0 && 'invisible', days !== 30 && (series.length - 1 - i) % 2 === 1 && 'max-sm:invisible')}>
                  {isToday ? 'Today' : date(d.d0)}
                </span>
              </div>
            );
          })}
          {hd && (
            <div className="pointer-events-none absolute top-[40px] z-30 w-[184px] flex flex-col gap-2 p-[14px] bg-[#0F110C] rounded-[14px] shadow-[0_8px_24px_rgba(15,17,12,.2)] dark:bg-[#F2F3EE]"
              style={hover > series.length / 2
                ? { left: `calc(${((hover + 0) / series.length) * 100}% - 196px)` }
                : { left: `calc(${((hover + 1) / series.length) * 100}% + 12px)` }}>
              <div className="text-[12px] font-bold text-[#999D92] dark:text-[#61655C]">{hover === series.length - 1 ? `Today, ${date(hd.d0)}` : dateLong(hd.d0)}</div>
              {[
                ['Submitted', hd.submitted, 'bg-white dark:bg-[#0F110C]'],
                ['Approved', hd.approved, 'bg-accent'],
                ['Rejected', hd.rejected, 'bg-red'],
                ...(hover === series.length - 1 && pendingToday ? [['In review', pendingToday, 'hatch text-accent border border-accent']] : []),
              ].map(([l, v, sw]) => (
                <div key={l} className="flex items-center gap-2">
                  <span className={cx('size-2 rounded-[2px]', sw)} />
                  <span className="flex-1 text-[13px] font-semibold text-white dark:text-[#0F110C]">{l}</span>
                  <span className="text-[13px] font-extrabold text-white dark:text-[#0F110C]">{v}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-white/15 dark:border-black/10 text-[12px] font-semibold text-[#999D92] dark:text-[#61655C]">
                {hd.avgMs != null ? `Avg review ${dur(hd.avgMs)}` : 'No reviews finished'}
              </div>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}
