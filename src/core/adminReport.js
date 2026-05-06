import { publicOrderNo } from './orderNumbers'

export function buildAdminReport(orders, hours = 24) {
  const now = new Date()
  const cutoffMs = now.getTime() - hours * 60 * 60 * 1000
  const recent = (orders || []).filter((order) => {
    const createdMs = new Date(order.created_at).getTime()
    return Number.isFinite(createdMs) && createdMs >= cutoffMs
  })

  const byStatus = new Map()
  const byService = new Map()
  let revenue = 0
  for (const order of recent) {
    const status = order.status || 'unknown'
    const service = order.service_title || 'unknown'
    byStatus.set(status, (byStatus.get(status) || 0) + 1)
    byService.set(service, (byService.get(service) || 0) + 1)
    revenue += Number(order.price_rub || 0)
  }

  const lines = []
  lines.push('ADMIN REPORT (last 24h)')
  lines.push(`Generated UTC: ${now.toISOString().replace('T', ' ').slice(0, 19)}`)
  lines.push('')
  lines.push(`Orders: ${recent.length}`)
  lines.push(`Revenue (planned): ${revenue} RUB`)
  lines.push('')
  lines.push('By status:')
  for (const [status, count] of [...byStatus.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`- ${status}: ${count}`)
  }
  lines.push('')
  lines.push('By service:')
  for (const [service, count] of [...byService.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
    lines.push(`- ${service}: ${count}`)
  }
  lines.push('')
  lines.push('Recent orders:')
  for (const order of [...recent].sort((a, b) => Number(b.id) - Number(a.id))) {
    const publicNo = publicOrderNo(Number(order.id), Number(order.user_id))
    lines.push(
      `- ${publicNo} | user_id=${order.user_id} | ${order.service_title} | ${order.status} | ${order.price_rub} RUB | ${order.created_at}`
    )
  }
  lines.push('')
  lines.push('End of report.')
  return lines.join('\n')
}
