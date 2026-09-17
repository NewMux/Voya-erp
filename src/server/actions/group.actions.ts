'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { assertRole } from '@/server/guards';
import {
  count,
  dateOnly,
  money,
  optionalDateOnly,
  optionalMoney,
  optionalString,
  requiredString,
} from '@/lib/validation';
import { toStorage } from '@/lib/money';
import { createDeparture, joinWaitlist } from '@/server/services/group.service';
import { enqueueCapacityAlertIfNeeded } from '@/server/services/notification.service';
import { parseForm, toActionState, type ActionState } from './types';

const templateSchema = z.object({
  name: requiredString('Trip name'),
  destination: optionalString,
  summary: optionalString,
  durationDays: count('Duration', 1),
});

export async function createTripTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let templateId: string;

  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(templateSchema, formData);
    if (!parsed.success) return parsed.state;

    const template = await prisma.groupTripTemplate.create({
      data: {
        ...parsed.data,
        // Seed one itinerary row per day so staff have something to fill in.
        itineraryDays: {
          create: Array.from({ length: parsed.data.durationDays }, (_, index) => ({
            dayNumber: index + 1,
            title: `Day ${index + 1}`,
          })),
        },
      },
    });
    templateId = template.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/group-trips');
  redirect(`/group-trips/${templateId}`);
}

const itineraryDaySchema = z.object({
  templateId: requiredString('Template'),
  dayId: requiredString('Day'),
  title: requiredString('Title'),
  description: optionalString,
});

export async function updateItineraryDay(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(itineraryDaySchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.groupItineraryDay.update({
      where: { id: parsed.data.dayId },
      data: { title: parsed.data.title, description: parsed.data.description },
    });

    revalidatePath(`/group-trips/${parsed.data.templateId}`);
    return { ok: true, message: 'Itinerary updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

const departureSchema = z.object({
  templateId: optionalString,
  name: requiredString('Departure name'),
  destination: optionalString,
  departureDate: dateOnly,
  returnDate: optionalDateOnly,
  capacity: count('Capacity', 1),
  pricePerSeat: money('Price per seat'),
  singleSupplement: optionalMoney('Single supplement'),
  tourLeaderName: optionalString,
  notes: optionalString,
});

export async function createDepartureAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let departureId: string;

  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(departureSchema, formData);
    if (!parsed.success) return parsed.state;

    const departure = await createDeparture({
      templateId: parsed.data.templateId,
      name: parsed.data.name,
      destination: parsed.data.destination,
      departureDate: parsed.data.departureDate,
      returnDate: parsed.data.returnDate,
      capacity: parsed.data.capacity,
      pricePerSeat: toStorage(parsed.data.pricePerSeat),
      singleSupplement: toStorage(parsed.data.singleSupplement ?? 0),
      tourLeaderName: parsed.data.tourLeaderName,
      notes: parsed.data.notes,
      status: 'OPEN',
    });
    departureId = departure.id;
  } catch (error) {
    return toActionState(error);
  }

  revalidatePath('/group-trips');
  redirect(`/group-trips/departures/${departureId}`);
}

const departureStatusSchema = z.object({
  departureId: requiredString('Departure'),
  status: z.enum(['DRAFT', 'OPEN', 'FULL', 'CLOSED', 'COMPLETED', 'CANCELLED']),
});

export async function updateDepartureStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(departureStatusSchema, formData);
    if (!parsed.success) return parsed.state;

    await prisma.groupDeparture.update({
      where: { id: parsed.data.departureId },
      data: { status: parsed.data.status },
    });

    revalidatePath(`/group-trips/departures/${parsed.data.departureId}`);
    return { ok: true, message: 'Departure updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

const capacitySchema = z.object({
  departureId: requiredString('Departure'),
  capacity: count('Capacity', 1),
});

/** Change capacity, e.g. when the DMC releases more seats. */
export async function updateDepartureCapacity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT');

    const parsed = parseForm(capacitySchema, formData);
    if (!parsed.success) return parsed.state;

    const result = await prisma.$transaction(async (tx) => {
      const departure = await tx.groupDeparture.findUnique({
        where: { id: parsed.data.departureId },
        select: { seatsBooked: true, status: true },
      });
      if (!departure) throw new Error('Departure not found.');

      if (parsed.data.capacity < departure.seatsBooked) {
        return {
          ok: false as const,
          error: `${departure.seatsBooked} seats are already booked. Capacity cannot be lower than that.`,
        };
      }

      const isFull = departure.seatsBooked >= parsed.data.capacity;

      await tx.groupDeparture.update({
        where: { id: parsed.data.departureId },
        data: {
          capacity: parsed.data.capacity,
          // Releasing seats reopens a trip that had filled up.
          ...(departure.status === 'FULL' && !isFull ? { status: 'OPEN' } : {}),
          ...(departure.status === 'OPEN' && isFull
            ? { status: 'FULL', waitlistEnabled: true }
            : {}),
        },
      });

      await enqueueCapacityAlertIfNeeded(tx, parsed.data.departureId);
      return { ok: true as const };
    });

    if (!result.ok) return { ok: false, error: result.error };

    revalidatePath(`/group-trips/departures/${parsed.data.departureId}`);
    return { ok: true, message: 'Capacity updated.' };
  } catch (error) {
    return toActionState(error);
  }
}

const waitlistSchema = z.object({
  departureId: requiredString('Departure'),
  customerId: requiredString('Customer'),
  requestedSeats: count('Seats', 1),
  notes: optionalString,
});

export async function joinWaitlistAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(waitlistSchema, formData);
    if (!parsed.success) return parsed.state;

    await joinWaitlist(parsed.data);

    revalidatePath(`/group-trips/departures/${parsed.data.departureId}`);
    return { ok: true, message: 'Added to the waitlist.' };
  } catch (error) {
    return toActionState(error);
  }
}

const waitlistStatusSchema = z.object({
  entryId: requiredString('Waitlist entry'),
  status: z.enum(['WAITING', 'OFFERED', 'CONVERTED', 'CANCELLED']),
});

export async function updateWaitlistEntry(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    await assertRole('ADMIN', 'ACCOUNTANT', 'STAFF');

    const parsed = parseForm(waitlistStatusSchema, formData);
    if (!parsed.success) return parsed.state;

    const entry = await prisma.groupWaitlistEntry.update({
      where: { id: parsed.data.entryId },
      data: {
        status: parsed.data.status,
        offeredAt: parsed.data.status === 'OFFERED' ? new Date() : undefined,
        resolvedAt:
          parsed.data.status === 'CONVERTED' || parsed.data.status === 'CANCELLED'
            ? new Date()
            : null,
      },
      select: { departureId: true },
    });

    revalidatePath(`/group-trips/departures/${entry.departureId}`);
    return { ok: true, message: 'Waitlist updated.' };
  } catch (error) {
    return toActionState(error);
  }
}
