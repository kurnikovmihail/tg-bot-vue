import {
  SERVICE_COURSEWORK,
  SERVICE_CUSTOM_WORK,
  SERVICE_ESSAY,
  SERVICE_LAB_WORK,
  SERVICE_PRESENTATION,
  SERVICE_REFERAT,
  SERVICE_RESEARCH_WORK,
  getOffer
} from './catalog'

export const VOLUME_PRICING_RULES = {
  [SERVICE_REFERAT]: ['volume', 4, 4, 35, 120],
  [SERVICE_PRESENTATION]: ['slides_count', 12, 6, 30, 80],
  [SERVICE_ESSAY]: ['volume', 3, 1, 12, 140],
  [SERVICE_COURSEWORK]: ['volume', 20, 20, 90, 110],
  [SERVICE_RESEARCH_WORK]: ['volume', 10, 10, 70, 130],
  [SERVICE_LAB_WORK]: ['volume', 2, 2, 25, 180],
  [SERVICE_CUSTOM_WORK]: ['volume', 5, 1, 120, 100]
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
  return basePrice + extraUnits * pricePerUnit
}
