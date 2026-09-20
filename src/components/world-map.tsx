import Link from 'next/link';
import { Badge, type BadgeTone } from '@/components/ui';

/**
 * Dashboard world map — change request #1.
 *
 * A lightweight custom SVG rather than a mapping library: a handful of
 * simplified continent silhouettes (rough shapes, not surveyed coastlines —
 * this is a "where in the world" indicator, not a navigation map) in an
 * equirectangular projection, with pins placed from plain lat/lng. The
 * legend list underneath carries the real information (name, flag, seats),
 * so the map stays useful even where a destination doesn't resolve to a pin.
 */

export type WorldMapPoint = {
  id: string;
  label: string;
  flag: string;
  lat: number;
  lng: number;
  href: string;
  detail: string;
  tone: BadgeTone;
  toneLabel: string;
};

const VIEW_W = 1000;
const VIEW_H = 500;

function project(lat: number, lng: number) {
  const x = ((lng + 180) / 360) * VIEW_W;
  const y = ((90 - lat) / 180) * VIEW_H;
  return { x, y };
}

export function WorldMap({ points }: { points: WorldMapPoint[] }) {
  return (
    <div>
      <div className="overflow-hidden rounded-md bg-voya-50">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="w-full" role="img" aria-label="World map">
          <rect x={0} y={0} width={VIEW_W} height={VIEW_H} fill="#EAF5F7" />
          {/* Rough continent silhouettes — decorative context, not surveyed coastlines. */}
          <g fill="#CFE7EA">
            <ellipse cx={190} cy={150} rx={125} ry={85} />
            <ellipse cx={270} cy={330} rx={55} ry={110} />
            <ellipse cx={505} cy={110} rx={65} ry={45} />
            <ellipse cx={525} cy={280} rx={85} ry={130} />
            <ellipse cx={700} cy={160} rx={190} ry={105} />
            <ellipse cx={835} cy={355} rx={70} ry={40} />
          </g>
          {points.map((point) => {
            const { x, y } = project(point.lat, point.lng);
            return (
              <g key={point.id}>
                <circle cx={x} cy={y} r={9} fill="#4CA7BC" fillOpacity={0.25} />
                <circle cx={x} cy={y} r={4.5} fill="#2C6C7D" stroke="white" strokeWidth={1.5} />
                <title>
                  {point.flag} {point.label} — {point.detail}
                </title>
              </g>
            );
          })}
        </svg>
      </div>

      {points.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No upcoming departures with a set destination.</p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100">
          {points.map((point) => (
            <li key={point.id} className="flex items-center justify-between gap-3 py-2">
              <Link
                href={point.href}
                className="flex min-w-0 items-center gap-2 text-sm font-medium text-voya-800 hover:underline"
              >
                <span aria-hidden>{point.flag}</span>
                <span className="truncate">{point.label}</span>
              </Link>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-slate-500">{point.detail}</span>
                <Badge tone={point.tone}>{point.toneLabel}</Badge>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
