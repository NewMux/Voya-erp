/**
 * Approximate country centroids + flag emoji for the dashboard's Group
 * Adventure world map (change request #1).
 *
 * Deliberately a curated list of countries Voya actually runs trips to/near,
 * not the full ~195-country list in countries.ts — a hand-picked lat/lng per
 * country is only worth maintaining for places that show up in
 * `GroupDeparture.destination`. `resolveDestination` degrades gracefully
 * (returns null) for anything not in the list, so an unmatched destination
 * simply doesn't get a pin rather than breaking the widget.
 */

export type DestinationPoint = { name: string; lat: number; lng: number; flag: string };

const KNOWN_DESTINATIONS: readonly DestinationPoint[] = [
  { name: 'Bahrain', lat: 26.07, lng: 50.56, flag: '🇧🇭' },
  { name: 'Saudi Arabia', lat: 23.89, lng: 45.08, flag: '🇸🇦' },
  { name: 'United Arab Emirates', lat: 23.42, lng: 53.85, flag: '🇦🇪' },
  { name: 'Kuwait', lat: 29.31, lng: 47.48, flag: '🇰🇼' },
  { name: 'Qatar', lat: 25.35, lng: 51.18, flag: '🇶🇦' },
  { name: 'Oman', lat: 21.51, lng: 55.92, flag: '🇴🇲' },
  { name: 'Egypt', lat: 26.82, lng: 30.8, flag: '🇪🇬' },
  { name: 'Jordan', lat: 30.59, lng: 36.24, flag: '🇯🇴' },
  { name: 'Lebanon', lat: 33.85, lng: 35.86, flag: '🇱🇧' },
  { name: 'Morocco', lat: 31.79, lng: -7.09, flag: '🇲🇦' },
  { name: 'Turkey', lat: 38.96, lng: 35.24, flag: '🇹🇷' },
  { name: 'Georgia', lat: 42.32, lng: 43.36, flag: '🇬🇪' },
  { name: 'Azerbaijan', lat: 40.14, lng: 47.58, flag: '🇦🇿' },
  { name: 'Armenia', lat: 40.07, lng: 45.04, flag: '🇦🇲' },
  { name: 'Uzbekistan', lat: 41.38, lng: 64.59, flag: '🇺🇿' },
  { name: 'Kazakhstan', lat: 48.02, lng: 66.92, flag: '🇰🇿' },
  { name: 'India', lat: 20.59, lng: 78.96, flag: '🇮🇳' },
  { name: 'Sri Lanka', lat: 7.87, lng: 80.77, flag: '🇱🇰' },
  { name: 'Maldives', lat: 3.2, lng: 73.22, flag: '🇲🇻' },
  { name: 'Nepal', lat: 28.39, lng: 84.12, flag: '🇳🇵' },
  { name: 'Thailand', lat: 15.87, lng: 100.99, flag: '🇹🇭' },
  { name: 'Indonesia', lat: -0.79, lng: 113.92, flag: '🇮🇩' },
  { name: 'Malaysia', lat: 4.21, lng: 101.98, flag: '🇲🇾' },
  { name: 'Singapore', lat: 1.35, lng: 103.82, flag: '🇸🇬' },
  { name: 'Vietnam', lat: 14.06, lng: 108.28, flag: '🇻🇳' },
  { name: 'Philippines', lat: 12.88, lng: 121.77, flag: '🇵🇭' },
  { name: 'Japan', lat: 36.2, lng: 138.25, flag: '🇯🇵' },
  { name: 'South Korea', lat: 35.91, lng: 127.77, flag: '🇰🇷' },
  { name: 'China', lat: 35.86, lng: 104.2, flag: '🇨🇳' },
  { name: 'United Kingdom', lat: 55.38, lng: -3.44, flag: '🇬🇧' },
  { name: 'France', lat: 46.23, lng: 2.21, flag: '🇫🇷' },
  { name: 'Italy', lat: 41.87, lng: 12.57, flag: '🇮🇹' },
  { name: 'Spain', lat: 40.46, lng: -3.75, flag: '🇪🇸' },
  { name: 'Portugal', lat: 39.4, lng: -8.22, flag: '🇵🇹' },
  { name: 'Switzerland', lat: 46.82, lng: 8.23, flag: '🇨🇭' },
  { name: 'Germany', lat: 51.17, lng: 10.45, flag: '🇩🇪' },
  { name: 'Austria', lat: 47.52, lng: 14.55, flag: '🇦🇹' },
  { name: 'Greece', lat: 39.07, lng: 21.82, flag: '🇬🇷' },
  { name: 'Netherlands', lat: 52.13, lng: 5.29, flag: '🇳🇱' },
  { name: 'Czechia', lat: 49.82, lng: 15.47, flag: '🇨🇿' },
  { name: 'Iceland', lat: 64.96, lng: -19.02, flag: '🇮🇸' },
  { name: 'South Africa', lat: -30.56, lng: 22.94, flag: '🇿🇦' },
  { name: 'Kenya', lat: -0.02, lng: 37.91, flag: '🇰🇪' },
  { name: 'Tanzania', lat: -6.37, lng: 34.89, flag: '🇹🇿' },
  { name: 'United States', lat: 37.09, lng: -95.71, flag: '🇺🇸' },
  { name: 'Canada', lat: 56.13, lng: -106.35, flag: '🇨🇦' },
  { name: 'Brazil', lat: -14.24, lng: -51.93, flag: '🇧🇷' },
  { name: 'Australia', lat: -25.27, lng: 133.78, flag: '🇦🇺' },
  { name: 'New Zealand', lat: -40.9, lng: 174.89, flag: '🇳🇿' },
];

/**
 * Matches a known country name as a substring of the trip's destination
 * (case-insensitive) — destinations are typically written "City, Country"
 * (e.g. "Bali, Indonesia"), so a substring match against the country list is
 * enough without needing full geocoding.
 */
export function resolveDestination(text: string | null | undefined): DestinationPoint | null {
  if (!text) return null;
  const lower = text.toLowerCase();
  return KNOWN_DESTINATIONS.find((d) => lower.includes(d.name.toLowerCase())) ?? null;
}
