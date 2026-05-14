import { getOffer } from './catalog'

export const VOLUME_PRICING_RULES = {}

export function hasVolumePricing(serviceKey) {
  return Object.prototype.hasOwnProperty.call(VOLUME_PRICING_RULES, serviceKey)
}

export function calculateOrderPrice(serviceKey) {
  const offer = getOffer(serviceKey)
  return Number(offer.priceRub)
}
