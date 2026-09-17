'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { BookingStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import {
  count,
  currency,
  dateOnly,
  fxRate,
  money,
  optionalDateOnly,
  optionalString,
  requiredString,
} from '@/lib/validation';
import { createBooking, updateBookingStatus } from '@/server/services/booking.service';
import { rateSheetInForce } from '@/server/services/supplier.service';
import { storage } from '@/server/storage';
import { parseForm, toActionState, type ActionState } from './types';

const baseBookingSchema = z.object({
  customerId: requiredString('Customer'),
  type: z.enum(['FLIGHT', 'HOTEL', 'PACKAGE', 'VISA', 'TRANSPORT', 'GROUP_ADVENTURE']),
  supplierId: optionalString,
  departureDate: optionalDateOnly,
  returnDate: optionalDateOnly,
  adults: count('Adults', 0),
  children: count('Children', 0),
  infants: count('Infants', 0),

  costAmount: money('Cost price'),
  costCurrency: currency,
  fxRate,
  sellingAmount: money('Selling price'),

  depositType: z.enum(['PERCENT', 'AMOUNT', 'NONE']),
  depositValue: z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .refine((v) => v === null || /^\d+(\.\d{1,3})?$/.test(v), 'Deposit must be a number'),
  balanceDueDate: optionalDateOnly,

  status: z.enum(['INQUIRY', 'CONFIRMED', 'TICKETED', 'COMPLETED', 'CANCELLED']),
  notes: optionalString,

  // Flight
  airline: optionalString,
  pnr: optionalString,
  routeFrom: optionalString,
  routeTo: optionalString,
  cabinClass: optionalString,
  baggageAllowance: optionalString,

  // Hotel
  propertyName: optionalString,
  city: optionalString,
  roomType: optionalString,
  boardBasis: z.enum(['RO', 'BB', 'HB', 'FB']).optional(),
  checkIn: optionalDateOnly,
  checkOut: optionalDateOnly,
  rooms: count('Rooms', 0).optional(),

  // Visa
  destinationCountry: optionalString,
  visaType: optionalString,
  processingStatus: z
    .enum(['NOT_STARTED', 'DOCUMENTS_PENDING', 'SUBMITTED', 'APPROVED', 'REJECTED', 'ISSUED'])
    .optional(),

  // Transport
  transportKind: z.enum(['AIRPORT_TRANSFER', 'CAR_RENTAL', 'INTER_CITY']).optional(),
  pickupLocation: optionalString,
  dropoffLocation: optionalString,
  vehicleType: optionalString,

  // Group adventure
  departureId: optionalString,
  seats: count('Seats', 0).optional(),
  singleSupplementSeats: count('Single supplement seats', 0).optional(),
});

/**
 * Per-type required fields.
 *
 * The shared schema keeps every type-specific field optional so one form can
 * post them all; this narrows it to what the chosen type actually needs.
 */
function validateTypeFields(
  data: z.infer<typeof baseBookingSchema>,
): Record<string, string> | null {
  const errors: Record<string, string> = {};

  switch (data.type) {
    case 'FLIGHT':
      if (!data.airline) errors.airline = 'Airline is required';
      if (!data.routeFrom) errors.routeFrom = 'Origin is required';
      if (!data.routeTo) errors.routeTo = 'Destination is required';
      break;
    case 'HOTEL':
      if (!data.propertyName) errors.propertyName = 'Property name is required';
      if (!data.checkIn) errors.checkIn = 'Check-in date is required';
      if (!data.checkOut) errors.checkOut = 'Check-out date is required';
      if (data.checkIn && data.checkOut && data.checkOut.getTime() <= data.checkIn.getTime()) {
        errors.checkOut = 'Check-out must be after check-in';
      }
      break;
    case 'VISA':
      if (!data.destinationCountry) errors.destinationCountry = 'Destination country is required';
      if (!data.visaType) errors.visaType = 'Visa type is required';
      break;
    case 'TRANSPORT':
      if (!data.transportKind) errors.transportKind = 'Transport type is required';
      if (!data.pickupLocation) errors.pickupLocation = 'Pickup location is required';
      break;
    case 'GROUP_ADVENTURE':
      if (!data.departureId) errors.departureId = 'Choose a departure';
      if (!data.seats || data.seats < 1) errors.seats = 'At least one seat is required';
      if (data.seats && data.singleSupplementSeats && data.singleSupplementSeats > data.seats) {
        errors.singleSupplementSeats = 'Cannot exceed the number of seats booked';
      }
      break;
    case 'PACKAGE':
      // A package bundles components under one price; none is individually
      // mandatory, so there is nothing extra to require here.
      break;
  }

  if (
    data.departureDate &&
    data.returnDate &&
    data.returnDate.getTime() < data.departureDate.getTime()
  ) {
    errors.returnDate = 'Return date cannot be before the departure date';
  }

  if (data.adults + data.children + data.infants < 1) {
    errors.adults = 'A booking needs at least one traveller';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/** Map the flat form into the per-type detail object the service expects. */
function detailFor(data: z.infer<typeof baseBookingSchema>) {
  switch (data.type) {
    case 'FLIGHT':
      return {
        flight: {
          airline: data.airline!,
          pnr: data.pnr,
          routeFrom: data.routeFrom!,
          routeTo: data.routeTo!,
          cabinClass: data.cabinClass,
          baggageAllowance: data.baggageAllowance,
        },
      };
    case 'HOTEL':
      return {
        hotel: {
          propertyName: data.propertyName!,
          city: data.city,
          roomType: data.roomType,
          boardBasis: data.boardBasis ?? 'RO',
          checkIn: data.checkIn!,
          checkOut: data.checkOut!,
          rooms: data.rooms ?? 1,
        },
      };
    case 'VISA':
      return {
        visa: {
          destinationCountry: data.destinationCountry!,
          visaType: data.visaType!,
          processingStatus: data.processingStatus ?? 'NOT_STARTED',
        },
      };
    case 'TRANSPORT':
      return {
        transport: {
          kind: data.transportKind!,
          pickupLocation: data.pickupLocation!,
          dropoffLocation: data.dropoffLocation,
          vehicleType: data.vehicleType,
        },
      };
    case 'GROUP_ADVENTURE':
      return {
        groupAdventure: {
          departureId: data.departureId!,
          seats: data.seats ?? 1,
          singleSupplementSeats: data.singleSupplementSeats ?? 0,
        },
      };
    default:
      return {};
  }
}

export async function createBookingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let bookingId: string;

  try {
    const user = await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(baseBookingSchema, formData);
    if (!parsed.success) return parsed.state;

    const typeErrors = validateTypeFields(parsed.data);
    if (typeErrors) {
      return {
        ok: false,
        error: 'Please correct the highlighted fields.',
        fieldErrors: typeErrors,
      };
    }

    const data = parsed.data;

    // Snapshot the rate sheet in force, so this booking keeps its applicable
    // rate even after the supplier's rates are superseded.
    const rateSheet = data.supplierId
      ? await rateSheetInForce(prisma, data.supplierId, data.departureDate ?? new Date())
      : null;

    const booking = await createBooking({
      customerId: data.customerId,
      type: data.type,
      supplierId: data.supplierId,
      supplierRateSheetId: rateSheet?.id ?? null,
      departureDate: data.departureDate,
      returnDate: data.returnDate,
      adults: data.adults,
      children: data.children,
      infants: data.infants,
      costAmount: data.costAmount,
      costCurrency: data.costCurrency,
      fxRate: data.fxRate,
      sellingAmount: data.sellingAmount,
      depositType: data.depositType === 'NONE' ? null : data.depositType,
      depositValue: data.depositType === 'NONE' ? null : data.depositValue,
      balanceDueDate: data.balanceDueDate,
      status: data.status as BookingStatus,
      notes: data.notes,
      createdById: user.id,
      ...detailFor(data),
    });

    bookingId = booking.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/bookings');
  redirect(`/bookings/${bookingId}`);
}

const statusSchema = z.object({
  bookingId: requiredString('Booking'),
  status: z.enum(['INQUIRY', 'CONFIRMED', 'TICKETED', 'COMPLETED', 'CANCELLED']),
  cancelReason: optionalString,
});

export async function updateBookingStatusAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(statusSchema, formData);
    if (!parsed.success) return parsed.state;

    await updateBookingStatus({
      bookingId: parsed.data.bookingId,
      status: parsed.data.status as BookingStatus,
      cancelReason: parsed.data.cancelReason,
    });

    revalidatePath('/bookings');
    revalidatePath(`/bookings/${parsed.data.bookingId}`);
    return { ok: true, message: 'Booking updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

const travelerSchema = z.object({
  bookingId: requiredString('Booking'),
  fullName: requiredString('Traveller name'),
  type: z.enum(['ADULT', 'CHILD', 'INFANT']),
  passportNumber: optionalString,
  passportExpiry: optionalDateOnly,
  nationality: optionalString,
  phone: optionalString,
});

export async function addTraveler(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(travelerSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.traveler.create({ data: parsed.data });

    revalidatePath(`/bookings/${parsed.data.bookingId}`);
    return { ok: true, message: 'Traveller added.' };
  } catch (error) {
    return toActionState(error);
  }
}

export async function removeTraveler(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const id = String(formData.get('travelerId') ?? '');
    const traveler = await prisma.traveler.delete({
      where: { id },
      select: { bookingId: true },
    });

    revalidatePath(`/bookings/${traveler.bookingId}`);
    return { ok: true, message: 'Traveller removed.' };
  } catch (error) {
    return toActionState(error);
  }
}

/** Attach a ticket, voucher or visa copy to a booking. */
export async function uploadAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const bookingId = String(formData.get('bookingId') ?? '');
    const kindRaw = String(formData.get('kind') ?? 'OTHER');
    const file = formData.get('file');

    if (!bookingId) return { ok: false, error: 'Missing booking.' };
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: 'Choose a file to upload.' };
    }

    const kind = (
      ['TICKET', 'VOUCHER', 'VISA_COPY', 'PASSPORT_COPY', 'INVOICE', 'OTHER'] as const
    ).includes(kindRaw as never)
      ? (kindRaw as 'TICKET' | 'VOUCHER' | 'VISA_COPY' | 'PASSPORT_COPY' | 'INVOICE' | 'OTHER')
      : 'OTHER';

    const stored = await storage().save(file, 'bookings');

    await prisma.bookingAttachment.create({
      data: { bookingId, kind, ...stored, uploadedById: user.id },
    });

    revalidatePath(`/bookings/${bookingId}`);
    return { ok: true, message: 'Attachment uploaded.' };
  } catch (error) {
    return toActionState(error);
  }
}

export async function deleteAttachment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const id = String(formData.get('attachmentId') ?? '');
    const attachment = await prisma.bookingAttachment.delete({ where: { id } });

    // The row is the source of truth; a leftover file on disk is harmless, so
    // a failed unlink must not fail the action.
    await storage()
      .remove(attachment.fileKey)
      .catch((error) => console.error('Failed to remove stored file:', error));

    revalidatePath(`/bookings/${attachment.bookingId}`);
    return { ok: true, message: 'Attachment removed.' };
  } catch (error) {
    return toActionState(error);
  }
}

const scheduleSchema = z.object({
  bookingId: requiredString('Booking'),
  scheduleItemId: requiredString('Instalment'),
  dueDate: dateOnly,
});

/** Reschedule an instalment, e.g. when a customer asks for more time. */
export async function rescheduleInstalment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(scheduleSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.paymentScheduleItem.update({
      where: { id: parsed.data.scheduleItemId },
      data: { dueDate: parsed.data.dueDate },
    });

    revalidatePath(`/bookings/${parsed.data.bookingId}`);
    return { ok: true, message: 'Instalment rescheduled.' };
  } catch (error) {
    return toActionState(error);
  }
}
