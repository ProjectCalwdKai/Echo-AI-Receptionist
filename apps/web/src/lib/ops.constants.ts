export const LEAD_STATUSES = ['new', 'contacted', 'qualified', 'won', 'lost'] as const;
export const BOOKING_STATUSES = ['confirmed', 'completed', 'cancelled', 'no_show'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
