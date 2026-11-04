export type ApiErrorCode =
  | '23P01' // slot overlap (exclusion constraint)
  | 'GB001' // more than 2 unpaid bookings
  | 'GB002' // membership not valid on booking date
  | 'GB003' // booking no longer pending when paying
  | 'NOT_FOUND'
  | 'FORBIDDEN'
  | 'VALIDATION'
  | 'AUTH';

export interface Suggestion {
  start_time: string;
  end_time: string;
}

export class ApiError extends Error {
  code: ApiErrorCode;
  suggestions: Suggestion[];

  constructor(code: ApiErrorCode, message: string, suggestions: Suggestion[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.suggestions = suggestions;
  }
}
