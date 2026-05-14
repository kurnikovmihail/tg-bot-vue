import {
  SERVICE_CUSTOM_WORK,
  SERVICE_ESSAY,
  SERVICE_PRESENTATION,
  SERVICE_REFERAT,
  getOffer
} from './catalog'

export const VOLUME_PRICING_RULES = {
  [SERVICE_REFERAT]: ['volume', 4, 4, 35, 40],
  [SERVICE_PRESENTATION]: ['slides_count', 12, 6, 30, 26.67],
  [SERVICE_ESSAY]: ['volume', 50, 1, 120, 46.67],
  [SERVICE_CUSTOM_WORK]: ['volume', 5, 1, 120, 33.33]
}

export function hasVolumePricing(serviceKey) {
  return Object.prototype.hasOwnProperty.call(VOLUME_PRICING_RULES, serviceKey)
}

function extractFirstInt(rawValue) {
  const match = String(rawValue || '').match(/\d+/)
  if (!match) {
    return null
  }
  const parsed = Number.parseInt(match[0], 10)
  return Number.isNaN(parsed) ? null : parsed
}

export function calculateOrderPrice(serviceKey, requirements) {
  const offer = getOffer(serviceKey)
  const basePrice = Number(offer.priceRub)
  const rule = VOLUME_PRICING_RULES[serviceKey]
  if (!rule) {
    return basePrice
  }

  const [fieldKey, includedUnits, minUnits, maxUnits, pricePerUnit] = rule
  const rawValue = String(requirements?.[fieldKey] || '').trim()
  let units = extractFirstInt(rawValue)
  if (units === null) {
    units = includedUnits
  }
  units = Math.max(minUnits, Math.min(maxUnits, units))
  const extraUnits = Math.max(0, units - includedUnits)
  // Keep final prices in whole rubles for UI and stored orders.
  return Math.round(basePrice + extraUnits * pricePerUnit)
}
