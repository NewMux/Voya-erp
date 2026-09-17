import type {
  BookingPaymentStatus,
  BookingStatus,
  DepartureStatus,
  InvoiceStatus,
  MembershipStatus,
  NotificationStatus,
  ScheduleItemStatus,
  SupplierInvoiceStatus,
} from '@prisma/client';
import { Badge, type BadgeTone } from './ui';

/**
 * Status badges.
 *
 * Tone is consistent across every module: green means settled, amber means
 * action is pending, red means a problem, and gold is reserved for membership.
 */

function humanise(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

const bookingTones: Record<BookingStatus, BadgeTone> = {
  INQUIRY: 'neutral',
  CONFIRMED: 'info',
  TICKETED: 'info',
  COMPLETED: 'success',
  CANCELLED: 'danger',
};

export function BookingStatusBadge({ status }: { status: BookingStatus }) {
  return <Badge tone={bookingTones[status]}>{humanise(status)}</Badge>;
}

const paymentTones: Record<BookingPaymentStatus, BadgeTone> = {
  UNPAID: 'danger',
  DEPOSIT_PAID: 'warning',
  FULLY_PAID: 'success',
};

export function PaymentStatusBadge({ status }: { status: BookingPaymentStatus }) {
  return <Badge tone={paymentTones[status]}>{humanise(status)}</Badge>;
}

const scheduleTones: Record<ScheduleItemStatus, BadgeTone> = {
  PENDING: 'warning',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  WAIVED: 'neutral',
  CANCELLED: 'neutral',
};

export function ScheduleStatusBadge({ status }: { status: ScheduleItemStatus }) {
  return <Badge tone={scheduleTones[status]}>{humanise(status)}</Badge>;
}

const invoiceTones: Record<InvoiceStatus, BadgeTone> = {
  DRAFT: 'neutral',
  SENT: 'info',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  OVERDUE: 'danger',
  CANCELLED: 'neutral',
};

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge tone={invoiceTones[status]}>{humanise(status)}</Badge>;
}

const supplierInvoiceTones: Record<SupplierInvoiceStatus, BadgeTone> = {
  UNPAID: 'danger',
  PARTIALLY_PAID: 'warning',
  PAID: 'success',
  DISPUTED: 'warning',
};

export function SupplierInvoiceStatusBadge({ status }: { status: SupplierInvoiceStatus }) {
  return <Badge tone={supplierInvoiceTones[status]}>{humanise(status)}</Badge>;
}

const membershipTones: Record<MembershipStatus, BadgeTone> = {
  ACTIVE: 'gold',
  EXPIRED: 'neutral',
  CANCELLED: 'neutral',
};

export function MembershipStatusBadge({ status }: { status: MembershipStatus }) {
  return <Badge tone={membershipTones[status]}>{humanise(status)}</Badge>;
}

const departureTones: Record<DepartureStatus, BadgeTone> = {
  DRAFT: 'neutral',
  OPEN: 'success',
  FULL: 'warning',
  CLOSED: 'neutral',
  COMPLETED: 'neutral',
  CANCELLED: 'danger',
};

export function DepartureStatusBadge({ status }: { status: DepartureStatus }) {
  return <Badge tone={departureTones[status]}>{humanise(status)}</Badge>;
}

const notificationTones: Record<NotificationStatus, BadgeTone> = {
  PENDING: 'warning',
  SENDING: 'info',
  SENT: 'success',
  FAILED: 'danger',
  CANCELLED: 'neutral',
};

export function NotificationStatusBadge({ status }: { status: NotificationStatus }) {
  return <Badge tone={notificationTones[status]}>{humanise(status)}</Badge>;
}

export function BookingTypeLabel({ type }: { type: string }) {
  return <span>{humanise(type)}</span>;
}

export { humanise };
