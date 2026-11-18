// Content for the public landing page. Texts are dictionary keys (see src/i18n), so the page
// switches between RU / KZ / EN. Live trainer/hall data on the landing page comes from the API.

import type { Key } from '../i18n';
import { t } from '../i18n';
import type { MembershipPlan } from '../types';

export const GYM_NAME = 'PulseGym'; // placeholder brand name

export type ServiceIcon = 'barbell' | 'group' | 'mat' | 'glove' | 'kettlebell';

export interface Service {
  id: 'personal' | 'group' | 'yoga' | 'boxing' | 'crossfit';
  icon: ServiceIcon;
}

// Text: service.<id>.title / .text / .duration
export const SERVICES: Service[] = [
  { id: 'personal', icon: 'barbell' },
  { id: 'group', icon: 'group' },
  { id: 'yoga', icon: 'mat' },
  { id: 'boxing', icon: 'glove' },
  { id: 'crossfit', icon: 'kettlebell' },
];

// Text: step.<n>.title / .text
export const STEPS = [1, 2, 3] as const;

export interface Plan {
  plan: MembershipPlan; // must match the sign-up form's plans
  priceKzt: number; // DEMO price
  featured?: boolean;
}

// Text: plan.<plan>, landing.plan.<plan>.period / .perk1
export const PLANS: Plan[] = [
  { plan: 'monthly', priceKzt: 15000 },
  { plan: 'quarterly', priceKzt: 40000, featured: true },
  { plan: 'annual', priceKzt: 140000 },
];

// Fictional sample reviews for the demo - not real customers. Text: review.<n>.role / .text
export const TESTIMONIALS = [
  { n: 1, name: 'Ayana Adil' },
  { n: 2, name: 'Bolat Madi' },
  { n: 3, name: 'Sultan Bimaganbet' },
] as const;

// Contact details.
export const CONTACT = {
  address: 'ЖК Амаль, Алматы',
  phone: '+7 (700) 255-85-47',
  email: 'pulsegym@gmail.com',
  whatsapp: 'https://wa.me/77002558547',
  // Our place in 2GIS (used by the "Get directions" button).
  twoGisUrl: 'https://go.2gis.com/GZIOY',
  // What the embedded map searches for and pins.
  mapQuery: 'ЖК Амаль, Алматы',
};

// Only Instagram for now. TODO: put the real profile link here.
export const INSTAGRAM = { href: 'https://www.instagram.com/', label: 'Instagram' };

/** Address in the current language (the map still searches with CONTACT.mapQuery). */
export const address = () => t('contact.address');

// Trainer specializations come from the backend in English. Known ones are translated;
// anything else (a new trainer's own wording) is shown as typed.
const SPECIALIZATIONS: Record<string, Key> = {
  'strength training': 'spec.strength',
  'functional training': 'spec.functional',
  boxing: 'spec.boxing',
  'yoga / pilates': 'spec.yoga',
  'yoga & pilates': 'spec.yoga',
  yoga: 'spec.yoga',
  crossfit: 'spec.crossfit',
};
export const specializationLabel = (s: string) => {
  const key = SPECIALIZATIONS[s.trim().toLowerCase()];
  return key ? t(key) : s;
};
