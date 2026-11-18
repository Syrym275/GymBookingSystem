import { useT } from '../i18n';

/**
 * Drawn portraits of the trainers for the landing page cards. They are illustrations, not photos.
 *
 * To use a real photo instead, put the file in `public/trainers/` and add it to TRAINER_PHOTOS,
 * e.g. `1: '/trainers/aigerim.jpg'` (key = trainer_id from the backend).
 * A trainer without a photo or a drawing (a newly approved one) gets a neutral figure with initials.
 */
export const TRAINER_PHOTOS: Record<number, string> = {};

type Hair = 'ponytail' | 'short' | 'buzz' | 'bun';
type Prop = 'dumbbell' | 'kettlebell' | 'glove' | 'lotus';

interface Look {
  skin: string;
  hair: string;
  style: Hair;
  shirt: string;
  trim: string;
  beard?: boolean;
  prop: Prop;
}

// trainer_id -> look (matches the four trainers in the database seed)
const LOOKS: Record<number, Look> = {
  1: { skin: '#E9B994', hair: '#2B1B14', style: 'ponytail', shirt: '#C6FF3D', trim: '#1A1C22', prop: 'dumbbell' }, // Aigerim, strength
  2: { skin: '#D8A27C', hair: '#1E1A17', style: 'short', shirt: '#2DD4BF', trim: '#0F766E', beard: true, prop: 'kettlebell' }, // Arman, functional
  3: { skin: '#C98F68', hair: '#141210', style: 'buzz', shirt: '#2A2D35', trim: '#C6FF3D', prop: 'glove' }, // Daniyar, boxing
  4: { skin: '#F1C7A5', hair: '#4A2C1E', style: 'bun', shirt: '#C4B5FD', trim: '#6D5BD0', prop: 'lotus' }, // Zhanna, yoga
};
const NAME_TO_ID: Record<string, number> = {
  'aigerim sadykova': 1,
  'arman seitkali': 2,
  'daniyar ospanov': 3,
  'zhanna iskakova': 4,
};

const LINE = '#1A1C22';

/** "Aigerim Sadykova" -> "AS" */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join('')
    .slice(0, 2);

export function TrainerPortrait({ trainerId, name }: { trainerId: number; name: string }) {
  const { t } = useT();
  const photo = TRAINER_PHOTOS[trainerId];
  const look = LOOKS[trainerId] ?? LOOKS[NAME_TO_ID[name.trim().toLowerCase()] ?? -1];
  const alt = t('portrait.alt', { name });

  if (photo) {
    return <img src={photo} alt={alt} className="h-44 w-full object-cover" loading="lazy" />;
  }

  return (
    <div className="relative h-44 overflow-hidden bg-sun-soft">
      <svg viewBox="0 0 240 176" className="h-full w-full" role="img" aria-label={look ? t('portrait.drawn', { name }) : alt}>
        {/* brand chevrons behind the figure */}
        <g fill="none" className="stroke-brand" strokeWidth="18" strokeLinejoin="miter">
          <path d="M-4 190 L52 120 L108 190" />
          <path d="M-4 138 L52 68 L108 138" opacity="0.5" />
        </g>
        {look ? <Person look={look} /> : <Unknown text={initials(name)} />}
      </svg>
    </div>
  );
}

function Person({ look }: { look: Look }) {
  const { skin, hair, style, shirt, trim, beard, prop } = look;
  const cx = 148;
  return (
    <g strokeLinecap="round" strokeLinejoin="round">
      {/* ponytail sits behind the head */}
      {style === 'ponytail' && (
        <path d="M176 58 C204 62 210 102 196 132 C190 110 186 92 174 78 Z" fill={hair} stroke={LINE} strokeWidth="2.5" />
      )}
      {style === 'bun' && <circle cx={cx} cy="30" r="15" fill={hair} stroke={LINE} strokeWidth="2.5" />}

      {/* shoulders + shirt */}
      <path d={`M${cx - 66} 180 C${cx - 62} 140 ${cx - 36} 124 ${cx} 124 C${cx + 36} 124 ${cx + 62} 140 ${cx + 66} 180 Z`} fill={shirt} stroke={LINE} strokeWidth="2.5" />
      {/* neck */}
      <path d={`M${cx - 11} 104 L${cx - 11} 128 Q${cx} 138 ${cx + 11} 128 L${cx + 11} 104 Z`} fill={skin} stroke={LINE} strokeWidth="2.5" />
      {/* collar / straps */}
      {style === 'ponytail' ? (
        <>
          <path d={`M${cx - 30} 127 L${cx - 22} 176`} stroke={trim} strokeWidth="6" />
          <path d={`M${cx + 30} 127 L${cx + 22} 176`} stroke={trim} strokeWidth="6" />
        </>
      ) : (
        <path d={`M${cx - 18} 126 Q${cx} 146 ${cx + 18} 126`} fill="none" stroke={trim} strokeWidth="5" />
      )}

      {/* ears */}
      <ellipse cx={cx - 30} cy="80" rx="6" ry="9" fill={skin} stroke={LINE} strokeWidth="2.5" />
      <ellipse cx={cx + 30} cy="80" rx="6" ry="9" fill={skin} stroke={LINE} strokeWidth="2.5" />
      {/* head */}
      <ellipse cx={cx} cy="76" rx="30" ry="35" fill={skin} stroke={LINE} strokeWidth="2.5" />

      {beard && (
        <path d={`M${cx - 28} 84 C${cx - 26} 108 ${cx - 12} 114 ${cx} 114 C${cx + 12} 114 ${cx + 26} 108 ${cx + 28} 84 C${cx + 22} 98 ${cx + 12} 102 ${cx} 102 C${cx - 12} 102 ${cx - 22} 98 ${cx - 28} 84 Z`} fill={hair} />
      )}

      {/* hair on top */}
      {style === 'short' && (
        <path d={`M${cx - 31} 74 C${cx - 34} 44 ${cx - 14} 34 ${cx + 2} 36 C${cx + 22} 36 ${cx + 36} 48 ${cx + 31} 74 C${cx + 26} 60 ${cx + 16} 52 ${cx} 54 C${cx - 16} 54 ${cx - 26} 60 ${cx - 31} 74 Z`} fill={hair} stroke={LINE} strokeWidth="2.5" />
      )}
      {style === 'buzz' && (
        <path d={`M${cx - 29} 66 C${cx - 26} 46 ${cx - 12} 40 ${cx} 40 C${cx + 14} 40 ${cx + 28} 46 ${cx + 29} 66 C${cx + 20} 56 ${cx + 10} 52 ${cx} 52 C${cx - 10} 52 ${cx - 20} 56 ${cx - 29} 66 Z`} fill={hair} opacity="0.85" />
      )}
      {(style === 'ponytail' || style === 'bun') && (
        <>
          <path d={`M${cx - 33} 84 C${cx - 38} 46 ${cx - 12} 34 ${cx + 4} 36 C${cx + 28} 38 ${cx + 40} 56 ${cx + 33} 84 C${cx + 30} 64 ${cx + 18} 54 ${cx} 54 C${cx - 18} 54 ${cx - 30} 64 ${cx - 33} 84 Z`} fill={hair} stroke={LINE} strokeWidth="2.5" />
          {style === 'ponytail' && <rect x={cx + 24} y="54" width="10" height="7" rx="2" fill={trim} transform={`rotate(35 ${cx + 29} 57)`} />}
        </>
      )}

      {/* face */}
      <path d={`M${cx - 18} 67 q7 -4 13 0 M${cx + 5} 67 q7 -4 13 0`} fill="none" stroke={hair} strokeWidth="3" />
      <circle cx={cx - 11} cy="77" r="3" fill={LINE} />
      <circle cx={cx + 11} cy="77" r="3" fill={LINE} />
      <path d={`M${cx} 79 q-4 9 2 11`} fill="none" stroke={LINE} strokeOpacity="0.45" strokeWidth="2" />
      <path d={`M${cx - 10} 96 q10 8 20 0`} fill="none" stroke={beard ? '#F3E3D3' : '#8A3B2E'} strokeWidth="3" />
      {!beard && (
        <>
          <circle cx={cx - 19} cy="89" r="4.5" fill="#F28B82" opacity="0.35" />
          <circle cx={cx + 19} cy="89" r="4.5" fill="#F28B82" opacity="0.35" />
        </>
      )}

      {/* specialization badge */}
      <g transform="translate(210 140)">
        <circle r="20" fill="#FFFFFF" stroke={LINE} strokeWidth="2.5" />
        <PropIcon prop={prop} />
      </g>
    </g>
  );
}

function PropIcon({ prop }: { prop: Prop }) {
  if (prop === 'dumbbell')
    return (
      <g stroke={LINE} strokeWidth="2.5" fill="#C6FF3D">
        <path d="M-9 0 H9" fill="none" strokeWidth="3.5" />
        <rect x="-14" y="-7" width="6" height="14" rx="1.5" />
        <rect x="8" y="-7" width="6" height="14" rx="1.5" />
      </g>
    );
  if (prop === 'kettlebell')
    return (
      <g stroke={LINE} strokeWidth="2.5">
        <path d="M-6 -4 V-8 a6 6 0 0 1 12 0 V-4" fill="none" strokeWidth="3" />
        <path d="M-9 10 a10 10 0 1 1 18 0 Z" fill="#2DD4BF" />
      </g>
    );
  if (prop === 'glove')
    return (
      <g stroke={LINE} strokeWidth="2.5" fill="#E5484D">
        <rect x="-8" y="-11" width="16" height="17" rx="7" />
        <ellipse cx="-9" cy="-1" rx="4" ry="6" />
        <rect x="-7" y="5" width="14" height="7" rx="2" fill="#FFFFFF" />
      </g>
    );
  return (
    <g stroke={LINE} strokeWidth="2.2" fill="#C4B5FD">
      <path d="M0 8 C-4 2 -4 -6 0 -11 C4 -6 4 2 0 8 Z" />
      <path d="M0 8 C-7 6 -11 0 -12 -6 C-6 -5 -2 0 0 8 Z" />
      <path d="M0 8 C7 6 11 0 12 -6 C6 -5 2 0 0 8 Z" />
    </g>
  );
}

function Unknown({ text }: { text: string }) {
  const cx = 148;
  return (
    <g>
      <path d={`M${cx - 66} 180 C${cx - 62} 140 ${cx - 36} 124 ${cx} 124 C${cx + 36} 124 ${cx + 62} 140 ${cx + 66} 180 Z`} className="fill-ink/15" />
      <circle cx={cx} cy="76" r="34" className="fill-ink/15" />
      <text x={cx} y="88" textAnchor="middle" className="fill-ink/70 font-display" fontSize="32" fontWeight="700">
        {text}
      </text>
    </g>
  );
}
