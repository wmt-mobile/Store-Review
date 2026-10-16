// Small pieces for the marketing page (pen.dev "Landing Page — Review Radar").
import { cx } from '../../components/ui.jsx';

/**
 * A crop of a design screenshot, kept proportional at any width.
 * box = the visible frame in design px, img = where the screenshot sits inside it (design px).
 */
export function Shot({ src, box, img, className, alt = '', absolute = false }) {
  const [bw, bh] = box;
  const [l, t, w, h] = img;
  return (
    <div className={cx(absolute ? 'absolute' : 'relative', 'overflow-hidden', className)} style={{ aspectRatio: `${bw} / ${bh}` }}>
      <img src={src} alt={alt} decoding="async" draggable={false}
        className="absolute max-w-none select-none"
        style={{ left: `${(l / bw) * 100}%`, top: `${(t / bh) * 100}%`, width: `${(w / bw) * 100}%`, height: `${(h / bh) * 100}%` }} />
    </div>
  );
}

export const Eyebrow = ({ children, light }) => (
  <div className={cx('text-[13px] font-extrabold tracking-[1.6px] uppercase', light ? 'text-accent' : 'text-[#4F6B00]')}>{children}</div>
);

export const H2 = ({ children, light, className }) => (
  <h2 className={cx('font-extrabold tracking-[-1.8px] text-[36px] leading-[40px] sm:text-[44px] sm:leading-[48px] lg:text-[52px] lg:leading-[55px]', light ? 'text-white' : 'text-[#0F110C]', className)}>{children}</h2>
);
