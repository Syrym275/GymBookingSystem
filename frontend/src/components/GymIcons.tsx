// Small line pictograms of real gym equipment, used as the landing page's brand motif.
// 24x24, stroke = currentColor so they follow the theme.

type IconProps = { className?: string };

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function Barbell({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M2 12h20" />
      <rect x="4.5" y="6.5" width="3" height="11" rx="1" />
      <rect x="16.5" y="6.5" width="3" height="11" rx="1" />
      <path d="M2.5 9.5v5M21.5 9.5v5" />
    </svg>
  );
}

export function Kettlebell({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7.5 11V7a2.5 2.5 0 0 1 2.5-2.5h4A2.5 2.5 0 0 1 16.5 7v4" />
      <path d="M7.2 20.5a6.5 6.5 0 1 1 9.6 0Z" />
    </svg>
  );
}

export function Glove({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M7 15V8a5 5 0 0 1 5-5h1.5A4.5 4.5 0 0 1 18 7.5V13a4 4 0 0 1-4 4H9a2 2 0 0 1-2-2Z" />
      <path d="M7 11.5H5.5a1.5 1.5 0 0 0 0 3H7" />
      <path d="M8 17v3.5h8V17" />
      <path d="M11 9h4" />
    </svg>
  );
}

export function Mat({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="6.5" cy="15" r="4" />
      <circle cx="6.5" cy="15" r="1.5" />
      <path d="M6.5 11H20a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.5" />
    </svg>
  );
}

/** Top-down hall floor with marking tape. */
export function Floor({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="4" width="18" height="16" rx="1.5" />
      <path d="M12 4v16" strokeDasharray="2 2" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/** A small group training together. */
export function Group({ className = 'h-5 w-5' }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="6" r="2.5" />
      <circle cx="5" cy="9" r="2" />
      <circle cx="19" cy="9" r="2" />
      <path d="M8 20v-4a4 4 0 0 1 8 0v4" />
      <path d="M2 20v-2.5A3 3 0 0 1 5 14.5h1M22 20v-2.5a3 3 0 0 0-3-3h-1" />
    </svg>
  );
}

/** Pick the pictogram that matches a trainer specialization or hall name. */
export function EquipmentIcon({ topic, className }: { topic: string; className?: string }) {
  const t = topic.toLowerCase();
  if (t.includes('box')) return <Glove className={className} />;
  if (t.includes('yoga') || t.includes('pilates')) return <Mat className={className} />;
  if (t.includes('functional') || t.includes('crossfit')) return <Kettlebell className={className} />;
  if (t.includes('hall')) return <Floor className={className} />;
  return <Barbell className={className} />;
}
