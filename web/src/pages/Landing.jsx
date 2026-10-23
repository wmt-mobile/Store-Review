// Public marketing page at "/" (pen.dev "Landing Page — Review Radar"). Every CTA opens /login
// (signed-in visitors go straight on to the dashboard). Sample apps only, never real app names.
import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, Timer, CodeXml, Check, CircleCheck, MessageSquare, Sparkles, BellRing, Terminal, Plus, Minus, Menu, X } from 'lucide-react';
import { AppleLogo, GooglePlayLogo, PhoneCall, TShirt, Question, HouseLine, PawPrint, GoogleChromeLogo } from '@phosphor-icons/react';
import { LogoTile, Mark, Pill, cx } from '../components/ui.jsx';
import { Shot, Eyebrow, H2 } from './landing/bits.jsx';

const GO = '/login';
const IMG = (f) => `/landing/${f}.webp`;
const GRAD = {
  orbit: ['#4F8BFF', '#1D4ED8', PhoneCall],
  closet: ['#B57CFF', '#7C3AED', TShirt],
  quiz: ['#FF9A4D', '#EA580C', Question],
  nest: ['#2BB59A', '#0F766E', HouseLine],
  pawly: ['#FFB547', '#D97706', PawPrint],
};
function Glyph({ app, size = 32, r = 9, muted }) {
  const [a, b, I] = GRAD[app];
  return (
    <span className="inline-flex items-center justify-center text-white shrink-0" style={{ width: size, height: size, borderRadius: r, background: muted ? '#E7E9E2' : `linear-gradient(180deg,${a},${b})`, color: muted ? '#999D92' : '#fff' }}>
      <I size={size * 0.55} />
    </span>
  );
}

const NAV = [['Product', '#product'], ['How it works', '#how'], ['Google Chat', '#chat'], ['Notifications', '#chat'], ['FAQ', '#faq']];

function Nav() {
  const [open, setOpen] = useState(false);
  return (
    <nav className="relative w-full max-w-[1440px] mx-auto flex items-center gap-10 px-5 sm:px-10 lg:px-16 py-6">
      <a href="/" className="flex items-center gap-[10px]"><LogoTile size={36} /><span className="text-[18px] font-extrabold tracking-[-0.4px] text-white">Review Radar</span></a>
      <div className="hidden lg:flex flex-1 justify-center gap-8">
        {NAV.map(([l, h]) => <a key={l} href={h} className="text-[14.5px] font-semibold text-white/70 hover:text-white">{l}</a>)}
      </div>
      <div className="flex-1 lg:hidden" />
            <a href={GO} className="hidden sm:inline-flex h-[42px] items-center gap-2 px-[18px] rounded-[12px] bg-accent text-[#0F110C] text-[14.5px] font-extrabold">Sign in <ArrowRight size={16} /></a>
      <button className="lg:hidden text-white" aria-label="Menu" onClick={() => setOpen((o) => !o)}>{open ? <X size={24} /> : <Menu size={24} />}</button>
      {open && (
        <div className="lg:hidden absolute top-[84px] inset-x-4 z-20 flex flex-col gap-1 p-3 rounded-[18px] bg-[#1A1C16] ring-1 ring-white/10">
          {NAV.map(([l, h]) => <a key={l} href={h} onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-[10px] text-[15px] font-semibold text-white/80 hover:bg-white/5">{l}</a>)}
          <a href={GO} className="mt-1 h-11 inline-flex items-center justify-center rounded-[12px] bg-accent text-[#0F110C] text-[15px] font-extrabold">Sign in</a>
        </div>
      )}
    </nav>
  );
}

function WebPush({ className }) {
  return (
    <div className={cx('flex items-center gap-3 px-[14px] py-3 rounded-[18px] bg-[#EDEDF0]/90 backdrop-blur-[15px] shadow-[0_10px_30px_rgba(0,0,0,.25)] font-[Inter,system-ui,sans-serif]', className)}>
      <span className="size-[34px] shrink-0 rounded-full bg-white inline-flex items-center justify-center text-[#4285F4]"><GoogleChromeLogo size={22} /></span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2"><span className="flex-1 text-[13.5px] font-bold text-[#1D1D1F]">✅ Orbit Notes approved</span><span className="text-[12px] text-[#3C3C43]/60">now</span></div>
        <div className="text-[12px] font-medium text-[#3C3C43]/60">reviewradar.app</div>
        <div className="text-[13px] leading-[17px] text-[#1D1D1F]">Android 2.4.0 (128) is ready to publish on Google Play · review took 6h 40m</div>
      </div>
      <Glyph app="orbit" size={40} r={10} />
    </div>
  );
}

function Hero() {
  return (
    <header className="relative overflow-hidden bg-[#0F110C]" style={{ backgroundImage: 'radial-gradient(70% 55% at 50% 0%, rgba(198,244,50,.16), transparent 70%)' }}>
      <Nav />
      <div className="w-full max-w-[920px] mx-auto flex flex-col items-center gap-6 px-5 pt-12 sm:pt-[72px] pb-12 text-center">
        <div className="inline-flex items-center gap-2 py-1.5 pl-1.5 pr-[14px] rounded-full bg-white/[.07] ring-1 ring-inset ring-white/[.12] max-w-full">
          <span className="px-[9px] py-[3px] rounded-full bg-accent text-[11px] font-extrabold tracking-[0.6px] text-[#0F110C]">NEW</span>
          <span className="text-[13.5px] font-semibold text-white/80 truncate">AI summaries for every App Store &amp; Play rejection</span>
        </div>
        <h1 className="text-[44px] leading-[48px] sm:text-[60px] sm:leading-[64px] lg:text-[76px] lg:leading-[78px] font-extrabold tracking-[-2px] lg:tracking-[-3px] text-white">Know the minute your <br className="hidden sm:block" />app is approved.</h1>
        <p className="max-w-[700px] text-[16px] leading-[25px] sm:text-[19px] sm:leading-[29px] font-medium text-white/65">Review Radar watches every build in App Store Connect and Google Play Console, posts each status change to Google Chat, and explains rejections in plain English — so nobody on your team refreshes a console again.</p>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-2 w-full sm:w-auto">
          <a href={GO} className="h-14 inline-flex items-center justify-center gap-[10px] px-[26px] rounded-[16px] bg-accent text-[16.5px] font-extrabold text-[#0F110C] shadow-[0_10px_30px_rgba(198,244,50,.25)]">Open Review Radar <ArrowRight size={18} /></a>
          <a href="#product" className="h-14 inline-flex items-center justify-center gap-[10px] px-[22px] rounded-[16px] ring-[1.5px] ring-inset ring-white/20 text-[16.5px] font-bold text-white">See what it does</a>
        </div>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-2">
          {[[ShieldCheck, 'Read-only API keys'], [Timer, '4-minute setup'], [CodeXml, 'No SDK, no code']].map(([I, l]) => (
            <span key={l} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-white/60"><I size={15} className="text-accent" />{l}</span>
          ))}
        </div>
      </div>
      <div className="relative w-full max-w-[1440px] mx-auto" style={{ aspectRatio: '1440 / 640' }}>
        <div className="absolute left-[4%] lg:left-[9.72%] right-[4%] lg:right-[9.72%] top-0 bottom-0 overflow-hidden rounded-t-[20px] outline outline-[6px] outline-white/15 shadow-[0_-20px_80px_rgba(198,244,50,.12)] bg-[#EDEFE9]">
          <img src={IMG('d0Si1')} alt="Review Radar overview dashboard" className="w-full h-auto block" />
        </div>
        <div className="hidden lg:flex absolute left-[2.8%] top-[51.5%] w-[330px] flex-col gap-[10px] p-4 rounded-[18px] bg-white shadow-[0_20px_50px_rgba(15,17,12,.35)]">
          <div className="flex items-center gap-2"><span className="size-6 rounded-full bg-[#1E8E3E] inline-flex items-center justify-center text-white"><MessageSquare size={13} /></span><span className="text-[12.5px] font-bold text-[#61655C]">Google Chat · app-reviews</span></div>
          <div className="flex gap-[10px]">
            <span className="size-[30px] shrink-0 rounded-full bg-accent inline-flex items-center justify-center"><Mark size={18} /></span>
            <div className="flex-1 min-w-0 flex flex-col gap-[3px]">
              <div className="text-[13px] font-extrabold text-[#0F110C]">app_review_bot</div>
              <div className="text-[13px] leading-[19px] font-medium text-[#3A3D35]">🚫 Nestly Home · Android 1.0.0 (3) rejected — Policy action. AI summary + fix steps inside.</div>
            </div>
          </div>
        </div>
        <WebPush className="hidden lg:flex absolute left-[71.5%] top-[17%] w-[372px]" />
      </div>
    </header>
  );
}

function Stats() {
  const S = [['‹ 5 min', 'from a store status change to a Google Chat post'], ['2 stores', 'App Store Connect + Google Play in one pipeline'], ['24h', 'stuck-in-review limit, configurable per team'], ['0', 'consoles to refresh. Ever.']];
  return (
    <section className="bg-white">
      <div className="max-w-[1440px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-y-10 px-5 sm:px-10 lg:px-[146px] py-14">
        {S.map(([v, d], i) => (
          <div key={v} className={cx('flex flex-col gap-3 pr-6 sm:pr-10', i % 2 === 1 && 'pl-6 border-l border-[#E3E5DD] lg:pl-7', i > 1 && 'lg:pl-7 lg:border-l', i === 2 && 'lg:border-l border-[#E3E5DD]')}>
            <div className="text-[34px] sm:text-[44px] leading-none font-extrabold tracking-[-1.5px] text-[#0F110C]">{v.replace('‹', '<')}</div>
            <div className="text-[14.5px] leading-[22px] font-medium text-[#61655C] max-w-[230px]">{d}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function How() {
  const cards = [
    {
      n: 1, t: 'Connect your stores', d: 'Upload an Apple .p8 API key or a Google Play service-account JSON. Keys are encrypted and read-only.',
      v: (
        <div className="flex flex-col gap-[10px] w-full">
          {[[AppleLogo, 'App Store Connect', 'AuthKey_7KQ2X9.p8'], [GooglePlayLogo, 'Google Play Console', 'review-bot.json']].map(([I, t, f]) => (
            <div key={t} className="flex items-center gap-3 p-[14px] rounded-[14px] bg-white">
              <span className="size-9 rounded-[10px] bg-[#0F110C] text-white inline-flex items-center justify-center"><I size={18} weight="fill" /></span>
              <span className="flex-1 min-w-0"><span className="block text-[14px] font-bold text-[#0F110C]">{t}</span><span className="block font-mono text-[12px] text-[#999D92]">{f}</span></span>
              <CircleCheck size={18} className="text-[#15803D]" />
            </div>
          ))}
        </div>
      ),
    },
    {
      n: 2, t: 'Pick apps to watch', d: 'Review Radar finds every app on the account. Tick the ones your team ships — mute the rest.',
      v: (
        <div className="flex justify-center gap-[10px]">
          {['orbit', 'closet', 'quiz', 'nest', 'pawly'].map((a) => {
            const on = a !== 'nest';
            return (
              <div key={a} className={cx('flex flex-col items-center gap-[10px] p-[6px] pb-2 rounded-[12px] bg-white', on ? 'ring-[1.5px] ring-[#0F110C]' : 'opacity-70')}>
                <Glyph app={a} size={30} r={8} />
                <span className={cx('size-[18px] rounded-[5px] inline-flex items-center justify-center', on ? 'bg-[#0F110C] text-accent' : 'ring-[1.5px] ring-inset ring-[#E3E5DD]')}>{on && <Check size={11} strokeWidth={3} />}</span>
              </div>
            );
          })}
        </div>
      ),
    },
    {
      n: 3, t: 'Get it in Google Chat', d: 'app_review_bot posts every change — submitted, in review, approved, rejected — to one shared space.',
      v: (
        <div className="w-full flex flex-col gap-2 p-[14px] rounded-[12px] bg-white">
          <div className="text-[14px] font-extrabold text-[#0F110C]">☑️ Approved · ready to publish</div>
          <div className="text-[12.5px] font-semibold text-[#61655C]">Orbit Notes - Notes &amp; Tasks · Google Play</div>
          <div className="text-[12px] text-[#999D92]">Production 2.4.0 (128) · from In review · review took 6h 40m</div>
          <span className="w-fit px-2.5 py-1 rounded-[8px] ring-1 ring-inset ring-[#E3E5DD] text-[12px] font-bold text-[#2563EB]">Open in Review Radar</span>
        </div>
      ),
    },
  ];
  return (
    <section id="how" className="bg-[#EDEFE9] scroll-mt-4">
      <div className="max-w-[1440px] mx-auto px-5 sm:px-10 lg:px-[120px] pt-20 lg:pt-[120px] pb-16 lg:pb-[120px] flex flex-col gap-12">
        <div className="flex flex-col lg:flex-row lg:items-end gap-6 lg:gap-16">
          <div className="flex-1 flex flex-col gap-4"><Eyebrow>How it works</Eyebrow><H2>Set up in four minutes.<br />Then forget the consoles.</H2></div>
          <p className="lg:w-[440px] text-[17px] leading-[27px] font-medium text-[#61655C] pb-2">Connect read-only keys, pick the apps that matter, and choose one Google Chat space. Review Radar does the checking every five minutes, around the clock.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {cards.map((c) => (
            <div key={c.n} className="flex flex-col gap-6 p-8 rounded-[28px] bg-white">
              <div className="h-[200px] flex items-center justify-center p-5 rounded-[18px] bg-[#F4F5F0]">{c.v}</div>
              <span className="size-8 rounded-full bg-[#0F110C] text-accent inline-flex items-center justify-center text-[13px] font-extrabold">{c.n}</span>
              <div className="flex flex-col gap-3 -mt-2">
                <h3 className="text-[23px] font-extrabold tracking-[-0.5px] text-[#0F110C]">{c.t}</h3>
                <p className="text-[15.5px] leading-[24px] font-medium text-[#61655C]">{c.d}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const Card = ({ className, children, dark }) => <div className={cx('flex flex-col gap-6 p-6 sm:p-8 rounded-[28px] min-w-0', dark ? 'bg-[#0F110C]' : 'bg-white', className)}>{children}</div>;
const CardCopy = ({ t, d, dark }) => (
  <div className="flex flex-col gap-[10px]">
    <h3 className={cx('text-[23px] sm:text-[26px] font-extrabold tracking-[-0.6px]', dark ? 'text-white' : 'text-[#0F110C]')}>{t}</h3>
    <p className={cx('text-[15.5px] leading-[24px] font-medium', dark ? 'text-white/60' : 'text-[#61655C]')}>{d}</p>
  </div>
);

function Features() {
  const ai = [
    ['🚫', 'ISSUE', 'Permissions declaration missing for QUERY_ALL_PACKAGES', 'font-bold'],
    ['🔎', 'WHAT’S WRONG', 'The build requests QUERY_ALL_PACKAGES, but no Permissions Declaration Form was submitted, so Google treats it as undeclared high-risk access.'],
    ['🛠️', 'HOW TO FIX', 'Drop the permission if it isn’t core, or complete Play Console → App content → Sensitive permissions. Then upload a new build (versionCode 4+).'],
    ['⏰', 'DEADLINE', 'Oct 23, 2026 · 7 days left', 'text-[#D92D20]'],
  ];
  return (
    <section id="product" className="bg-[#EDEFE9] scroll-mt-4">
      <div className="max-w-[1440px] mx-auto px-5 sm:px-10 lg:px-[120px] pb-20 lg:pb-[120px] flex flex-col gap-5">
        <div className="flex flex-col gap-4 pb-9"><Eyebrow>Product</Eyebrow><H2>Everything a release manager <br className="hidden sm:block" />used to keep in their head.</H2></div>
        <div className="flex flex-col lg:flex-row gap-5">
          <Card className="flex-1 lg:h-[620px]">
            <CardCopy t="Every build, one pipeline" d="Waiting → In review → Approved → Live, across both stores. See who's stuck and for how long, without opening a console." />
            <Shot className="rounded-[16px] bg-[#EDEFE9] ring-1 ring-[#E3E5DD]" src={IMG('EaGox')} box={[676, 430]} img={[-193.44, -70.2, 1123.2, 798.72]} alt="In review pipeline" />
          </Card>
          <Card className="lg:w-[440px] lg:h-[620px]">
            <CardCopy t="Rejections, translated" d="Apple and Google rejection emails become a clear summary: what’s wrong, how to fix it, and the deadline." />
            <div className="flex flex-col gap-[14px] p-[18px] rounded-[16px] bg-[#F4F5F0]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-[9px] py-[3px] rounded-full bg-[#0F110C] text-[11.5px] font-extrabold text-white"><Sparkles size={12} className="text-accent" />AI summary</span>
                <span className="text-[12px] font-semibold text-[#999D92]">Generated from the rejection email</span>
              </div>
              {ai.map(([e, l, t, c]) => (
                <div key={l} className="flex gap-3">
                  <span className="w-[22px] text-[16px]">{e}</span>
                  <div className="flex-1 flex flex-col gap-[3px]">
                    <div className="text-[11px] font-extrabold tracking-[1px] text-[#999D92]">{l}</div>
                    <div className={cx('text-[13.5px] leading-5 font-medium text-[#0F110C]', c)}>{t}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="flex flex-col lg:flex-row gap-5">
          <Card dark className="lg:w-[420px] lg:h-[480px]">
            <CardCopy dark t="Stuck-in-review alerts" d="Set a limit. When a build sits in review too long, the team hears about it first." />
            <div className="flex flex-col gap-3 p-5 rounded-[18px] bg-white/[.06]">
              <div className="flex items-center gap-[10px]"><Glyph app="pawly" size={32} /><span className="flex-1 text-[14px] font-bold text-white">Pawly · iOS 2.4.0</span><span className="text-[18px] font-extrabold text-[#FF6B5E]">26h 12m</span></div>
              <div className="h-2 rounded-full bg-white/10"><div className="h-2 rounded-full bg-[#FF6B5E] w-full" /></div>
              <div className="text-[12.5px] font-semibold text-white/50">2h 12m over your 24h limit · alert posted</div>
            </div>
          </Card>
          <Card className="flex-1 lg:h-[480px]">
            <CardCopy t="Full history for every release" d="Open any app to see exactly when it was submitted, picked up, approved, and released — grouped by build." />
            <Shot className="rounded-[16px] bg-[#EDEFE9] ring-1 ring-[#E3E5DD]" src={IMG('AmKza')} box={[556, 250]} img={[-545.6, 0, 892.8, 634.88]} alt="App history drawer" />
          </Card>
          <Card className="lg:w-[360px] lg:h-[480px]">
            <CardCopy t="One status language" d="Both stores map onto six clear states, colour-coded everywhere." />
            <div className="flex flex-col items-start gap-[10px]">
              <Pill tone="blue">Waiting for review</Pill>
              <Pill tone="amber">In review</Pill>
              <Pill tone="approved">Approved · ready to publish</Pill>
              <Pill tone="live">Live / Staged rollout</Pill>
              <Pill tone="red">Rejected / Policy action</Pill>
              <Pill tone="grey">Prepare for submission</Pill>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}

function ChatSection() {
  const F = [
    [MessageSquare, 'Rich Chat cards', 'Status, version, review time and one-click buttons — right in the space.'],
    [Sparkles, 'Rejections, explained', 'AI summary, fix steps and deadline on every rejection card.'],
    [BellRing, 'Desktop alerts', 'Native macOS & Windows notifications via your browser.'],
    [Terminal, '/review commands', 'Ask the bot for status, stuck builds or today’s digest.'],
  ];
  return (
    <section id="chat" className="bg-[#0F110C] scroll-mt-4" style={{ backgroundImage: 'radial-gradient(60% 50% at 100% 30%, rgba(198,244,50,.10), transparent 70%)' }}>
      <div className="max-w-[1440px] mx-auto px-5 sm:px-10 lg:px-[120px] py-20 lg:py-[120px] flex flex-col gap-16">
        <div className="flex flex-col lg:flex-row lg:items-end gap-6 lg:gap-16">
          <div className="flex-1 flex flex-col gap-5"><Eyebrow light>Google Chat + desktop alerts</Eyebrow><H2 light className="lg:text-[54px] lg:leading-[57px]">Approvals that find you — <br className="hidden sm:block" />wherever your team works.</H2></div>
          <p className="lg:w-[440px] text-[17px] leading-[27px] font-medium text-white/65">app_review_bot posts a rich card to your Google Chat space for every status change. Browser notifications on macOS and Windows catch the ones that matter, even when the tab is in the background.</p>
        </div>
        <div className="relative w-full" style={{ aspectRatio: '1200 / 640' }}>
          <Shot absolute className="left-0 top-0 w-[75%] rounded-[18px] outline outline-[6px] outline-white/15 bg-white" src={IMG('E3pZ8')} box={[900, 600]} img={[0, 0, 960, 600]} alt="Google Chat space with app_review_bot cards" />
          <Shot absolute className="left-[65%] top-[6.25%] w-[35%] rounded-[20px] shadow-[0_20px_60px_rgba(0,0,0,.5)] bg-white" src={IMG('iJAVm')} box={[420, 540]} img={[-988, -78, 1440, 1024]} alt="Notification centre" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {F.map(([I, t, d]) => (
            <div key={t} className="flex flex-col gap-3 p-6 rounded-[20px] bg-white/5 ring-1 ring-inset ring-white/[.06]">
              <span className="size-10 rounded-[12px] bg-accent inline-flex items-center justify-center text-[#0F110C]"><I size={19} /></span>
              <h3 className="mt-2 text-[17px] font-extrabold text-white">{t}</h3>
              <p className="text-[14px] leading-[21px] font-medium text-white/60">{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const QA = [
  ['Can Review Radar change or publish my apps?', 'No. It only uses read-only access: an App Store Connect API key with the Developer role and a Play service account with “View app information”. Publishing stays in your hands.'],
  ['How fast are status changes detected?', 'The stores are checked every few minutes (five by default, down to one), and every change is posted to Google Chat as soon as it’s seen — usually within five minutes of it happening.'],
  ['Where do the AI rejection summaries come from?', 'From the rejection email Google sends to your shared mailbox. Review Radar reads it and turns it into the issue, what’s wrong, how to fix it and the deadline — using only facts in the email.'],
  ['What happens to the keys when an account is removed?', 'Removing an account deletes its encrypted key and its apps from Review Radar straight away. You can also revoke the key in App Store Connect or Google Cloud at any time.'],
];

function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="bg-white scroll-mt-4">
      <div className="max-w-[1440px] mx-auto flex flex-col lg:flex-row gap-10 lg:gap-20 px-5 sm:px-10 lg:px-[120px] py-20 lg:py-[120px]">
        <div className="lg:w-[380px] flex flex-col gap-4">
          <Eyebrow>FAQ</Eyebrow>
          <H2 className="lg:text-[48px] lg:leading-[50px]">Questions, <br className="hidden lg:block" />answered.</H2>
        </div>
        <div className="flex-1 flex flex-col">
          {QA.map(([q, a], i) => {
            const on = open === i;
            return (
              <div key={q} className={cx('flex flex-col gap-3 py-6', i < QA.length - 1 && 'border-b border-[#E3E5DD]')}>
                <button type="button" onClick={() => setOpen(on ? -1 : i)} aria-expanded={on} className="flex items-center gap-4 text-left">
                  <span className="flex-1 text-[17px] sm:text-[19px] font-bold text-[#0F110C]">{q}</span>
                  <span className={cx('size-8 shrink-0 rounded-full inline-flex items-center justify-center', on ? 'bg-[#0F110C] text-accent' : 'bg-[#F4F5F0] text-[#0F110C]')}>{on ? <Minus size={16} /> : <Plus size={16} />}</span>
                </button>
                {on && <p className="max-w-[640px] text-[16px] leading-[26px] font-medium text-[#61655C]">{a}</p>}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function FinalCta() {
  return (
    <section className="bg-[#EDEFE9]">
      <div className="max-w-[1440px] mx-auto px-5 sm:px-10 lg:px-[120px] py-16 lg:py-[100px]">
        <div className="relative overflow-hidden flex flex-col items-center gap-7 px-6 sm:px-16 py-16 sm:py-20 rounded-[36px] bg-accent text-center">
          <Mark size={440} className="absolute -right-[10%] lg:left-[73%] -top-[60px] text-[#0F110C]/[.09] pointer-events-none" />
          <h2 className="relative text-[36px] leading-[40px] sm:text-[60px] sm:leading-[61px] font-extrabold tracking-[-2px] text-[#0F110C]">Stop refreshing consoles. <br className="hidden sm:block" />Start shipping.</h2>
          <p className="relative text-[16px] sm:text-[18px] font-semibold text-[#0F110C]/70">Every App Store and Google Play review for the team, in one place.</p>
          <div className="relative flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <a href={GO} className="h-14 inline-flex items-center justify-center gap-[10px] px-[26px] rounded-[16px] bg-[#0F110C] text-[16.5px] font-extrabold text-white">Open Review Radar <ArrowRight size={17} className="text-accent" /></a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const cols = [
    ['Product', [['Overview', GO], ['Pipeline', '/dashboard/review'], ['AI summaries', '/dashboard/attention'], ['Mobile app', '#chat']]],
    ['Integrations', [['App Store Connect', '#how'], ['Google Play Console', '#how'], ['Google Chat', '#chat'], ['Gmail', '#faq']]],
  ];
  return (
    <footer className="bg-[#0F110C]">
      <div className="max-w-[1440px] mx-auto flex flex-col gap-12 px-5 sm:px-10 lg:px-[120px] pt-[72px] pb-10">
        <div className="flex flex-col lg:flex-row gap-12 lg:gap-16">
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex items-center gap-[10px]"><LogoTile size={36} /><span className="text-[18px] font-extrabold text-white">Review Radar</span></div>
            <p className="text-[15px] font-medium text-white/50">Every app review, in one place.</p>
          </div>
          <div className="grid grid-cols-2 gap-10 lg:gap-16">
            {cols.map(([h, ls]) => (
              <div key={h} className="lg:w-[180px] flex flex-col gap-[14px]">
                <div className="text-[13px] font-extrabold text-white">{h}</div>
                {ls.map(([l, href]) => <a key={l} href={href} className="text-[14.5px] font-medium text-white/60 hover:text-white">{l}</a>)}
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-between pt-8 border-t border-white/10 text-[13.5px] font-medium text-white/45">
          <span>© {new Date().getFullYear()} Review Radar · Built by WebMobTechnologies</span>
          <a href="/health" className="hover:text-white">Status</a>
        </div>
      </div>
    </footer>
  );
}

export default function Landing() {
  useEffect(() => { document.title = 'Review Radar — every app review, in one place'; }, []);
  return (
    <div className="min-h-screen bg-[#EDEFE9] text-[#0F110C] overflow-x-hidden">
      <Hero />
      <Stats />
      <How />
      <Features />
      <ChatSection />
      <Faq />
      <FinalCta />
      <Footer />
    </div>
  );
}
