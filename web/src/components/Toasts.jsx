// Toast stack (design "Toast notifications"): dark success toast, light warning / error / info toasts.
import { Check, Timer, CircleX, Link2, Info, X } from 'lucide-react';
import { useUi } from '../lib/store.jsx';
import { cx } from './ui.jsx';

const TONES = {
  success: { icon: Check, chip: 'bg-accent text-accent-ink', box: 'bg-[#0F110C] text-white', sub: 'text-[#999D92]', act: 'text-accent' },
  warn: { icon: Timer, chip: 'bg-amber-soft text-amber', box: 'bg-surface text-ink', sub: 'text-ink-2', act: 'text-ink' },
  error: { icon: CircleX, chip: 'bg-red-soft text-red', box: 'bg-surface text-ink', sub: 'text-ink-2', act: 'text-ink' },
  link: { icon: Link2, chip: 'bg-blue-soft text-blue', box: 'bg-surface text-ink', sub: 'text-ink-2', act: 'text-ink' },
  info: { icon: Info, chip: 'bg-blue-soft text-blue', box: 'bg-surface text-ink', sub: 'text-ink-2', act: 'text-ink' },
};

export function Toasts() {
  const { toasts, dismiss } = useUi();
  if (!toasts.length) return null;
  return (
    <div className="fixed z-[70] right-4 bottom-24 md:bottom-6 md:right-6 flex flex-col gap-3 w-[min(392px,calc(100vw-32px))]" aria-live="polite">
      {toasts.map((t) => {
        const tone = TONES[t.tone] || TONES.info;
        const Icon = t.icon || tone.icon;
        return (
          <div key={t.id} role="status" className={cx('flex gap-3 p-[14px] rounded-[16px] shadow-[0_8px_24px_rgba(15,17,12,.12)] animate-[toastIn_.18s_ease-out]', tone.box)}>
            <span className={cx('size-8 shrink-0 rounded-[10px] inline-flex items-center justify-center', tone.chip)}><Icon size={16} strokeWidth={2.4} /></span>
            <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
              <div className="text-[13.5px] font-extrabold">{t.title}</div>
              {t.body && <div className={cx('text-[12.5px] leading-[18px] font-medium', tone.sub)}>{t.body}</div>}
            </div>
            {t.action && (
              <button onClick={() => { t.action.onClick?.(); dismiss(t.id); }} className={cx('self-start text-[12.5px] font-extrabold', tone.act)}>{t.action.label}</button>
            )}
            <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className={cx('self-start opacity-60 hover:opacity-100', t.tone === 'success' ? 'text-white' : 'text-ink-2')}><X size={15} /></button>
          </div>
        );
      })}
      <style>{'@keyframes toastIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}'}</style>
    </div>
  );
}
