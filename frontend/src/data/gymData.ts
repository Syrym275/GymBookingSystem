// Demo content for the public landing page. Everything here is placeholder data:
// replace it with the real gym's details before going live.
// Live trainer/hall availability on the landing page still comes from the API (publicApi.ts).

import type { MembershipPlan } from '../types';

export const GYM_NAME = 'PulseGym'; // placeholder brand name

// Example booking shown on the hero illustration (illustrative, not a real booking).
export const HERO_TICKET = {
  time: 'Today · 18:00',
  session: 'Strength training · 60 min',
  coach: 'Coach Aigerim S.',
};

export type ServiceIcon = 'barbell' | 'group' | 'mat' | 'glove' | 'kettlebell';

export interface Service {
  title: string;
  icon: ServiceIcon;
  text: string;
  duration: string;
}

export const SERVICES: Service[] = [
  { title: 'Personal training', icon: 'barbell', text: 'One-on-one with a coach who plans every set around your goal.', duration: '60 min' },
  { title: 'Group classes', icon: 'group', text: 'Bring your team or class: rent a hall and train together.', duration: '60 min per hall hour' },
  { title: 'Yoga & Pilates', icon: 'mat', text: 'Mobility, balance and breathing on the mat, at your pace.', duration: '60 min' },
  { title: 'Boxing', icon: 'glove', text: 'Pads, bags and footwork with a boxing coach.', duration: '60 min' },
  { title: 'CrossFit', icon: 'kettlebell', text: 'Short, hard circuits with kettlebells, rowers and bodyweight.', duration: '60 min' },
];

export interface DemoHall {
  name: string;
  capacity: number; // people
  sizeM2: number; // demo value
  pricePerHourKzt: number;
}

// Names, capacity and price match the mock database seed; size is demo-only.
export const HALLS: DemoHall[] = [
  { name: 'Main Hall', capacity: 40, sizeM2: 250, pricePerHourKzt: 12000 },
  { name: 'Yoga Studio', capacity: 20, sizeM2: 90, pricePerHourKzt: 8000 },
  { name: 'Boxing Studio', capacity: 15, sizeM2: 70, pricePerHourKzt: 9000 },
];

// Trainers shown on the landing page. Names, specialization and price match the mock database seed.
// TODO: experienceYears are example values - replace them with each trainer's real experience.
export interface DemoTrainer {
  name: string;
  specialization: string;
  priceKzt: number;
  experienceYears: number;
}

export const TRAINERS: DemoTrainer[] = [
  { name: 'Aigerim Sadykova', specialization: 'Strength training', priceKzt: 8000, experienceYears: 7 },
  { name: 'Arman Seitkali', specialization: 'Functional training', priceKzt: 6500, experienceYears: 4 },
  { name: 'Daniyar Ospanov', specialization: 'Boxing', priceKzt: 7000, experienceYears: 9 },
  { name: 'Zhanna Iskakova', specialization: 'Yoga / Pilates', priceKzt: 6000, experienceYears: 5 },
];

export const STEPS = [
  { title: 'Create account', text: 'Your name, e-mail and a membership plan. You are signed in straight away.' },
  { title: 'Choose a session or a hall', text: 'Pick a coach for personal training, or a hall for your group.' },
  { title: 'Pick a time and confirm', text: 'Choose a free hour, pay online and show your QR code at the desk.' },
];

export interface Plan {
  plan: MembershipPlan; // must match the sign-up form's plans
  name: string;
  priceKzt: number; // DEMO price
  period: string;
  perks: string[];
  featured?: boolean;
}

export const PLANS: Plan[] = [
  {
    plan: 'monthly',
    name: 'Monthly',
    priceKzt: 15000,
    period: 'per month',
    perks: ['Book trainers and halls for 1 month', 'QR check-in at the desk', 'Pay per session or hall hour'],
  },
  {
    plan: 'quarterly',
    name: 'Quarterly',
    priceKzt: 40000,
    period: 'per 3 months',
    perks: ['Book trainers and halls for 3 months', 'QR check-in at the desk', 'Pay per session or hall hour'],
    featured: true,
  },
  {
    plan: 'annual',
    name: 'Annual',
    priceKzt: 140000,
    period: 'per 12 months',
    perks: ['Book trainers and halls for a full year', 'QR check-in at the desk', 'Pay per session or hall hour'],
  },
];

// Fictional sample reviews for the demo - not real customers.
export const TESTIMONIALS = [
  { name: 'Ayana Adil', role: 'Member, 6 months', text: 'I book my 7 a.m. strength session the night before and just show my QR code. No phone calls, no waiting.' },
  { name: 'Bolat Madi', role: 'Football coach', text: 'We rent the Main Hall for team practice twice a week. Seeing the free hours before booking saves a lot of back and forth.' },
  { name: 'Sultan Bimaganbet', role: 'Member, 1 year', text: 'Yoga after work is finally a habit. If I cannot pay right away, the slot waits for me for 15 minutes.' },
];

// Contact details.
export const CONTACT = {
  address: 'ЖК Амаль, Алматы',
  phone: '+7 (700) 255-85-47',
  email: 'hello@pulsegym.example',
  whatsapp: 'https://wa.me/77002558547',
  // Our place in 2GIS (used by the "Get directions" button).
  twoGisUrl: 'https://go.2gis.com/GZIOY',
  // What the embedded map searches for and pins.
  mapQuery: 'ЖК Амаль, Алматы',
};

// Only Instagram for now. TODO: put the real profile link here.
export const INSTAGRAM = { href: 'https://www.instagram.com/', label: 'Instagram' };
