import { CalendarCheck, QrCode } from 'lucide-react';
import { HERO_TICKET } from '../data/gymData';

// Line-art gym floor for the landing hero: squat rack with a loaded barbell, bench,
// punching bag, plates, kettlebell and a yoga mat on rubber flooring with marking tape.
// Theme-aware: strokes use `ink`, fills use the surface color and the lime brand accent.

const S = 'stroke-ink';
const W = 3; // line weight

export default function HeroScene({ ticket = true }: { ticket?: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-xl">
      <svg viewBox="0 0 560 440" className="h-auto w-full" role="img" aria-label="Illustration of a gym floor: squat rack with a barbell, bench, punching bag, weight plates, kettlebell and yoga mat">
        <g strokeLinecap="round" strokeLinejoin="round">
          {/* Rubber floor + marking tape */}
          <rect x="0" y="360" width="560" height="80" rx="6" className="fill-ink/[0.06]" />
          <rect x="16" y="368" width="528" height="6" rx="3" className="fill-brand" />
          {[60, 140, 220, 300, 380, 460].map((x) => (
            <path key={x} d={`M${x} 392v40`} className="stroke-ink/10" strokeWidth={2} />
          ))}

          {/* Squat rack */}
          <rect x="150" y="104" width="14" height="256" rx="3" className={`fill-white ${S}`} strokeWidth={W} />
          <rect x="290" y="104" width="14" height="256" rx="3" className={`fill-white ${S}`} strokeWidth={W} />
          <rect x="146" y="96" width="162" height="14" rx="3" className={`fill-white ${S}`} strokeWidth={W} />
          {[140, 164, 188, 236, 260, 284, 308, 332].map((y) => (
            <g key={y} className="fill-ink/30">
              <circle cx="157" cy={y} r="2.5" />
              <circle cx="297" cy={y} r="2.5" />
            </g>
          ))}
          {/* J-hooks */}
          <path d="M164 206h10v-10" className={S} strokeWidth={W} fill="none" />
          <path d="M290 206h-10v-10" className={S} strokeWidth={W} fill="none" />

          {/* Barbell resting on the hooks */}
          <rect x="84" y="197" width="292" height="6" rx="3" className={`fill-white ${S}`} strokeWidth={2} />
          {/* left plates */}
          <rect x="102" y="146" width="20" height="108" rx="5" className={`fill-white ${S}`} strokeWidth={W} />
          <rect x="122" y="160" width="14" height="80" rx="4" className={`fill-white ${S}`} strokeWidth={W} />
          <rect x="138" y="190" width="7" height="20" rx="2" className="fill-brand stroke-ink" strokeWidth={2} />
          {/* right plates */}
          <rect x="338" y="146" width="20" height="108" rx="5" className={`fill-white ${S}`} strokeWidth={W} />
          <rect x="324" y="160" width="14" height="80" rx="4" className={`fill-white ${S}`} strokeWidth={W} />
          <rect x="315" y="190" width="7" height="20" rx="2" className="fill-brand stroke-ink" strokeWidth={2} />

          {/* Flat bench */}
          <rect x="168" y="296" width="118" height="16" rx="7" className={`fill-white ${S}`} strokeWidth={W} />
          <path d="M186 312v48M268 312v48M176 360h22M258 360h22" className={S} strokeWidth={W} fill="none" />

          {/* Punching bag */}
          <path d="M448 0v28M436 28l12 22 12-22" className={S} strokeWidth={W} fill="none" />
          <rect x="414" y="50" width="68" height="190" rx="26" className={`fill-white ${S}`} strokeWidth={W} />
          <rect x="414" y="84" width="68" height="12" className="fill-brand stroke-ink" strokeWidth={2} />
          <rect x="414" y="196" width="68" height="12" className="fill-brand stroke-ink" strokeWidth={2} />
          <path d="M432 120v56" className="stroke-ink/25" strokeWidth={W} fill="none" />

          {/* Plates leaning on the floor (front view) */}
          <circle cx="62" cy="322" r="38" className={`fill-white ${S}`} strokeWidth={W} />
          <circle cx="62" cy="322" r="24" className="fill-none stroke-ink/25" strokeWidth={2} />
          <circle cx="62" cy="322" r="7" className={`fill-brand ${S}`} strokeWidth={2} />
          <circle cx="104" cy="336" r="24" className={`fill-white ${S}`} strokeWidth={W} />
          <circle cx="104" cy="336" r="5" className="fill-ink/30" />

          {/* Yoga mat, rolled */}
          <rect x="336" y="332" width="54" height="26" rx="4" className="fill-brand stroke-ink" strokeWidth={W} />
          <circle cx="336" cy="345" r="15" className="fill-brand stroke-ink" strokeWidth={W} />
          <circle cx="336" cy="345" r="5" className="fill-none stroke-ink" strokeWidth={2} />

          {/* Kettlebell */}
          <path d="M452 322v-18a10 10 0 0 1 10-10h20a10 10 0 0 1 10 10v18" className={S} strokeWidth={W + 2} fill="none" />
          <path d="M452 358a26 26 0 1 1 40 0Z" className={`fill-white ${S}`} strokeWidth={W} />
          <path d="M462 334a12 12 0 0 1 8-8" className="stroke-ink/30" strokeWidth={2} fill="none" />
        </g>
      </svg>

      {/* Booking ticket pinned over the scene */}
      {ticket && (
      <div className="relative -mt-14 ml-auto w-60 rounded-xl border border-line bg-white p-4 shadow-hard sm:-mt-16 sm:mr-6 sm:w-64">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-mint-soft px-2.5 py-1 text-xs font-semibold text-mint-dark">
          <CalendarCheck className="h-3.5 w-3.5" aria-hidden="true" /> Booking confirmed
        </p>
        <p className="mt-2 font-display text-2xl font-bold uppercase leading-none">{HERO_TICKET.time}</p>
        <p className="mt-1 text-sm font-semibold">{HERO_TICKET.session}</p>
        <p className="text-sm text-ink/70">{HERO_TICKET.coach}</p>
        <p className="mt-3 flex items-center gap-2 border-t border-dashed border-line pt-3 text-xs text-ink/70">
          <QrCode className="h-6 w-6 shrink-0 text-ink" aria-hidden="true" /> Show this code at the front desk
        </p>
      </div>
      )}
    </div>
  );
}
