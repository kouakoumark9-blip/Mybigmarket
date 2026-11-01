import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  shippingDiscountTiers,
  shippingMethods,
  shippingRates,
  shippingZones,
} from "@/lib/db/schema";
import { quoteShippingOptions, type MethodInput, type ZoneInput } from "@/lib/shipping-quote";

/**
 * Pont entre la fiche produit et le moteur de devis (module 4).
 *
 * Le moteur `lib/shipping-quote.ts` est pur : il ne lit pas la base. Ce module
 * lui fournit les transporteurs, zones et tranches réellement configurés dans
 * l'admin, puis renvoie les options exploitables pour une quantité donnée.
 *
 * Conséquences volontaires :
 *  - aucun transporteur actif = aucune option : on n'affiche pas « port offert »
 *    ni un tarif inventé ;
 *  - un transporteur en `sampleRatesOnly` produit une option NON facturable,
 *    signalée comme telle (les tarifs d'exemple ne servent pas à encaisser).
 */

export type ProductShippingOption = {
  methodCode: string;
  methodName: string;
  mode: "air" | "sea";
  zoneName: string;
  totalXof: number;
  transitDaysMin: number;
  transitDaysMax: number;
  deliveryTimeLabel: string;
  billable: boolean;
  freeShipping: boolean;
};

export type ProductShippingResult = {
  options: ProductShippingOption[];
  zoneName: string | null;
  available: boolean;
};

export async function getProductShippingOptions(params: {
  countryCode: string;
  packages: Array<{ lengthCm: number; widthCm: number; heightCm: number; weightGrams: number; quantity: number }>;
  subtotalXof: number;
  isFragile?: boolean;
  preference?: "air_only" | "sea_only" | "both" | "automatic";
}): Promise<ProductShippingResult> {
  const db = getDb();

  const [methodRows, zoneRows, rateRows, discountRows] = await Promise.all([
    db
      .select()
      .from(shippingMethods)
      .where(and(eq(shippingMethods.isActive, true), isNull(shippingMethods.deletedAt)))
      .orderBy(asc(shippingMethods.mode), asc(shippingMethods.name)),
    db
      .select()
      .from(shippingZones)
      .where(and(eq(shippingZones.isActive, true), isNull(shippingZones.deletedAt)))
      .orderBy(asc(shippingZones.sortOrder)),
    db.select().from(shippingRates).where(isNull(shippingRates.deletedAt)),
    db.select().from(shippingDiscountTiers),
  ]);

  if (methodRows.length === 0) return { options: [], zoneName: null, available: false };

  const methods: MethodInput[] = methodRows.map((method) => ({
    id: method.id,
    code: method.code,
    name: method.name,
    mode: method.mode,
    isActive: method.isActive,
    sampleRatesOnly: method.sampleRatesOnly,
    billableBasis: method.billableBasis,
    volumetricDivisor: method.volumetricDivisor,
    minimumBillableWeightKg: method.minimumBillableWeightKg,
    minimumChargeXof: method.minimumChargeXof,
    insurancePercent: method.insurancePercent,
    customsHandlingXof: method.customsHandlingXof,
    fragileSurchargeXof: method.fragileSurchargeXof,
    transitDaysMin: method.transitDaysMin,
    transitDaysMax: method.transitDaysMax,
    freeAboveXof: method.freeAboveXof,
    freeAboveWeightGrams: method.freeAboveWeightGrams,
    outOfRangeBehavior: method.outOfRangeBehavior as "disable" | "use_highest" | null,
    maxPackageWeightGrams: method.maxPackageWeightGrams,
    maxPackageLengthCm: method.maxPackageLengthCm,
    rates: rateRows
      .filter((rate) => rate.shippingMethodId === method.id)
      .map((rate) => ({
        id: rate.id,
        shippingZoneId: rate.shippingZoneId,
        minimumBillableUnits: rate.minimumBillableUnits,
        maximumBillableUnits: rate.maximumBillableUnits,
        rateXofPerUnit: rate.rateXofPerUnit,
        minimumChargeXof: rate.minimumChargeXof,
        handlingFeeXof: rate.handlingFeeXof,
        customsFeeXof: rate.customsFeeXof,
        transitDaysMin: rate.transitDaysMin,
        transitDaysMax: rate.transitDaysMax,
        label: rate.label,
        isActive: rate.isActive,
        deletedAt: rate.deletedAt,
        validFrom: rate.validFrom,
        validTo: rate.validTo,
      })),
    discounts: discountRows
      .filter((discount) => discount.shippingMethodId === method.id)
      .map((discount) => ({
        shippingZoneId: discount.shippingZoneId,
        minimumBillableUnits: discount.minimumBillableUnits,
        discountPercent: discount.discountPercent,
        isActive: discount.isActive,
        label: discount.label,
      })),
  }));

  const zones: ZoneInput[] = zoneRows.map((zone) => ({
    id: zone.id,
    code: zone.code,
    name: zone.name,
    countryCodes: zone.countryCodes,
    regionCodes: zone.regionCodes,
    cityNames: zone.cityNames,
    isActive: zone.isActive,
    isDefault: zone.isDefault,
    sortOrder: zone.sortOrder,
    deletedAt: zone.deletedAt,
  }));

  const response = quoteShippingOptions(methods, zones, {
    countryCode: params.countryCode,
    packages: params.packages,
    subtotalXof: params.subtotalXof,
    isFragile: params.isFragile,
    preference: params.preference,
  });

  return {
    zoneName: response.zone?.name ?? null,
    available: response.available && response.options.length > 0,
    options: response.options.map((option) => ({
      methodCode: option.methodCode,
      methodName: option.methodName,
      mode: option.mode,
      zoneName: option.zoneName,
      totalXof: option.totalXof,
      transitDaysMin: option.transitDaysMin,
      transitDaysMax: option.transitDaysMax,
      deliveryTimeLabel: option.deliveryTimeLabel,
      billable: option.billable,
      freeShipping: option.freeShipping,
    })),
  };
}
