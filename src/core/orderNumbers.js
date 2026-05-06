function base36(value) {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (value === 0) {
    return '0'
  }
  let n = Math.abs(value)
  const chars = []
  while (n > 0) {
    const rem = n % 36
    chars.unshift(alphabet[rem])
    n = Math.floor(n / 36)
  }
  return chars.join('')
}

export function publicOrderNo(orderId, userId) {
  const hiddenPart = base36((userId ^ 0x5f3759df) >>> 0).slice(-6)
  return `ORD-${String(orderId).padStart(5, '0')}-${hiddenPart}`
}
