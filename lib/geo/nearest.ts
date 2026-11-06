/**
 * Pays et ville les plus proches d'une position GPS, calculés dans le navigateur à partir d'une liste
 * de villes : aucune coordonnée n'est envoyée à un service externe ni à nos serveurs.
 * Le résultat est une suggestion (approximative près des frontières) que le client peut corriger.
 */
export type Place = { name: string; countryCode: string; lat: number; lon: number };

export const PLACES: Place[] = [
  { name: "Cotonou", countryCode: "BJ", lat: 6.37, lon: 2.39 }, { name: "Porto-Novo", countryCode: "BJ", lat: 6.5, lon: 2.63 }, { name: "Parakou", countryCode: "BJ", lat: 9.34, lon: 2.63 },
  { name: "Ouagadougou", countryCode: "BF", lat: 12.37, lon: -1.52 }, { name: "Bobo-Dioulasso", countryCode: "BF", lat: 11.18, lon: -4.3 },
  { name: "Praia", countryCode: "CV", lat: 14.93, lon: -23.51 }, { name: "Mindelo", countryCode: "CV", lat: 16.89, lon: -24.99 },
  { name: "Abidjan", countryCode: "CI", lat: 5.36, lon: -4.01 }, { name: "Yamoussoukro", countryCode: "CI", lat: 6.82, lon: -5.28 }, { name: "Bouaké", countryCode: "CI", lat: 7.69, lon: -5.03 },
  { name: "Korhogo", countryCode: "CI", lat: 9.46, lon: -5.63 }, { name: "San-Pédro", countryCode: "CI", lat: 4.75, lon: -6.64 }, { name: "Daloa", countryCode: "CI", lat: 6.88, lon: -6.45 },
  { name: "Banjul", countryCode: "GM", lat: 13.45, lon: -16.58 }, { name: "Serekunda", countryCode: "GM", lat: 13.44, lon: -16.68 },
  { name: "Accra", countryCode: "GH", lat: 5.6, lon: -0.19 }, { name: "Kumasi", countryCode: "GH", lat: 6.69, lon: -1.62 }, { name: "Tamale", countryCode: "GH", lat: 9.4, lon: -0.84 },
  { name: "Conakry", countryCode: "GN", lat: 9.64, lon: -13.58 }, { name: "Kankan", countryCode: "GN", lat: 10.38, lon: -9.31 },
  { name: "Bissau", countryCode: "GW", lat: 11.86, lon: -15.6 },
  { name: "Monrovia", countryCode: "LR", lat: 6.3, lon: -10.8 },
  { name: "Bamako", countryCode: "ML", lat: 12.64, lon: -8.0 }, { name: "Sikasso", countryCode: "ML", lat: 11.32, lon: -5.67 }, { name: "Mopti", countryCode: "ML", lat: 14.49, lon: -4.2 },
  { name: "Gao", countryCode: "ML", lat: 16.27, lon: -0.04 }, { name: "Kayes", countryCode: "ML", lat: 14.45, lon: -11.44 },
  { name: "Nouakchott", countryCode: "MR", lat: 18.08, lon: -15.98 }, { name: "Nouadhibou", countryCode: "MR", lat: 20.93, lon: -17.03 },
  { name: "Niamey", countryCode: "NE", lat: 13.51, lon: 2.11 }, { name: "Zinder", countryCode: "NE", lat: 13.8, lon: 8.99 }, { name: "Maradi", countryCode: "NE", lat: 13.5, lon: 7.1 }, { name: "Agadez", countryCode: "NE", lat: 16.97, lon: 7.99 },
  { name: "Lagos", countryCode: "NG", lat: 6.52, lon: 3.38 }, { name: "Abuja", countryCode: "NG", lat: 9.06, lon: 7.49 }, { name: "Kano", countryCode: "NG", lat: 12.0, lon: 8.52 },
  { name: "Port Harcourt", countryCode: "NG", lat: 4.82, lon: 7.05 }, { name: "Ibadan", countryCode: "NG", lat: 7.38, lon: 3.95 },
  { name: "Dakar", countryCode: "SN", lat: 14.72, lon: -17.47 }, { name: "Thiès", countryCode: "SN", lat: 14.79, lon: -16.93 }, { name: "Saint-Louis", countryCode: "SN", lat: 16.02, lon: -16.5 },
  { name: "Touba", countryCode: "SN", lat: 14.85, lon: -15.88 }, { name: "Ziguinchor", countryCode: "SN", lat: 12.56, lon: -16.27 },
  { name: "Freetown", countryCode: "SL", lat: 8.48, lon: -13.23 },
  { name: "Lomé", countryCode: "TG", lat: 6.13, lon: 1.22 }, { name: "Kara", countryCode: "TG", lat: 9.55, lon: 1.19 }, { name: "Sokodé", countryCode: "TG", lat: 8.98, lon: 1.14 },
];

/** Au-delà de cette distance de la ville la plus proche, la position est considérée hors zone de livraison. */
export const MAX_COUNTRY_DISTANCE_KM = 900;
/** En deçà de cette distance, on propose la ville elle-même. */
export const MAX_CITY_DISTANCE_KM = 40;

const toRad = (degrees: number) => (degrees * Math.PI) / 180;

/** Distance en kilomètres entre deux points (formule de haversine). */
export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Located = { countryCode: string; city: string | null; nearestCity: string; distanceKm: number };

/** Pays (et ville si l'on y est) correspondant à une position ; null si elle est hors zone. */
export function locate(lat: number, lon: number): Located | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  let best: Place | null = null;
  let bestDistance = Infinity;
  for (const place of PLACES) {
    const d = distanceKm(lat, lon, place.lat, place.lon);
    if (d < bestDistance) { best = place; bestDistance = d; }
  }
  if (!best || bestDistance > MAX_COUNTRY_DISTANCE_KM) return null;
  return { countryCode: best.countryCode, city: bestDistance <= MAX_CITY_DISTANCE_KM ? best.name : null, nearestCity: best.name, distanceKm: Math.round(bestDistance) };
}
