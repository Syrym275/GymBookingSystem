import type { BookingType } from '../types';
import { t } from '../i18n';

/** What a booking is, in the current language. A "combined" booking holds a hall AND a trainer. */
export function bookingTypeLabel(type: BookingType): string {
  if (type === 'combined') return t('type.combined');
  return type === 'training' ? t('type.training') : t('type.hall');
}

/** Name(s) shown for a booking: "Hall A + Aigerim S." for a combined one, the single resource otherwise. */
export function bookingWhat(b: { hall_name?: string | null; trainer_name?: string | null }): string {
  return [b.hall_name, b.trainer_name].filter(Boolean).join(' + ');
}

/** True when a trainer takes part (a training session or a combined booking). */
export const hasTrainer = (type: BookingType) => type === 'training' || type === 'combined';
/** True when a hall is used (a hall rental or a combined booking). */
export const hasHall = (type: BookingType) => type === 'hall_rental' || type === 'combined';
