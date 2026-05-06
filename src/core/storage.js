import {
  ORDER_STATUS_AWAITING_PAYMENT,
  ORDER_STATUS_CANCELED,
  ORDER_STATUS_COMPLETED,
  ORDER_STATUS_IN_PROGRESS,
  ORDER_STATUS_IN_REVISION,
  ORDER_STATUS_READY,
  getOffer
} from './catalog'
import { publicOrderNo } from './orderNumbers'

const ORDERS_KEY = 'mgdi_orders_v2'
const REVISIONS_KEY = 'mgdi_revisions_v2'
const META_KEY = 'mgdi_meta_v2'
const FEEDBACK_KEY = 'mgdi_feedback_v1'

function nowIso() {
  return new Date().toISOString()
}

function parseJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) {
      return fallback
    }
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

function saveJson(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value))
}

function loadOrders() {
  return parseJson(ORDERS_KEY, [])
}

function saveOrders(orders) {
  saveJson(ORDERS_KEY, orders)
}

function loadRevisions() {
  return parseJson(REVISIONS_KEY, [])
}

function saveRevisions(revisions) {
  saveJson(REVISIONS_KEY, revisions)
}

function loadMeta() {
  return parseJson(META_KEY, { nextOrderId: 1, nextRevisionId: 1 })
}

function saveMeta(meta) {
  saveJson(META_KEY, meta)
}

function enrichOrder(order) {
  const offer = getOffer(order.service_type)
  return {
    ...order,
    service_title: offer.shortTitle
  }
}

function mapOrders(orders) {
  return orders.map((order) => enrichOrder(order))
}

export function purgeExpiredOrders(ttlHours = 72) {
  const cutoffMs = Date.now() - ttlHours * 60 * 60 * 1000
  const orders = loadOrders()
  const activeOrders = orders.filter((order) => {
    const createdMs = new Date(order.created_at).getTime()
    return Number.isFinite(createdMs) && createdMs >= cutoffMs
  })
  const removedIds = new Set(orders.filter((order) => !activeOrders.includes(order)).map((order) => order.id))
  if (removedIds.size > 0) {
    const revisions = loadRevisions().filter((revision) => !removedIds.has(revision.order_id))
    saveRevisions(revisions)
  }
  saveOrders(activeOrders)
  return removedIds.size
}

function updateOrder(orderId, updater) {
  const orders = loadOrders()
  const idx = orders.findIndex((order) => Number(order.id) === Number(orderId))
  if (idx < 0) {
    return null
  }
  const current = orders[idx]
  const next = updater({ ...current })
  if (!next) {
    return null
  }
  orders[idx] = next
  saveOrders(orders)
  return enrichOrder(next)
}

export function createOrder(payload) {
  purgeExpiredOrders()
  const meta = loadMeta()
  const orderId = Number(meta.nextOrderId || 1)
  meta.nextOrderId = orderId + 1
  saveMeta(meta)

  const createdAt = nowIso()
  const requirements = { ...(payload.requirements || {}) }
  const frozenRequirements = { ...requirements }

  const order = {
    id: orderId,
    user_id: Number(payload.userId),
    service_type: payload.serviceKey,
    status: ORDER_STATUS_AWAITING_PAYMENT,
    topic: requirements.topic || '—',
    subject: requirements.subject || '—',
    requirements,
    frozen_requirements: frozenRequirements,
    price_rub: Number(payload.priceRub),
    revision_limit: Number(payload.revisionLimit),
    revision_used: 0,
    revision_window_until: null,
    result_text: null,
    result_version: 0,
    created_at: createdAt,
    updated_at: createdAt,
    paid_at: null,
    ready_at: null,
    closed_at: null
  }

  const orders = loadOrders()
  orders.push(order)
  saveOrders(orders)
  return enrichOrder(order)
}

export function getOrder(orderId) {
  purgeExpiredOrders()
  const order = loadOrders().find((item) => Number(item.id) === Number(orderId))
  return order ? enrichOrder(order) : null
}

export function getOrderForUser(orderId, userId) {
  const order = getOrder(orderId)
  if (!order || Number(order.user_id) !== Number(userId)) {
    return null
  }
  return order
}

export function listUserOrders(userId, limit = 20) {
  purgeExpiredOrders()
  const orders = loadOrders()
    .filter((order) => Number(order.user_id) === Number(userId))
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, limit)
  return mapOrders(orders)
}

export function listRecentOrders(limit = 200) {
  purgeExpiredOrders()
  const orders = loadOrders()
    .sort((a, b) => Number(b.id) - Number(a.id))
    .slice(0, limit)
  return mapOrders(orders)
}

export function cancelOrder(orderId) {
  purgeExpiredOrders()
  return updateOrder(orderId, (order) => {
    if (order.status !== ORDER_STATUS_AWAITING_PAYMENT) {
      return order
    }
    const stamp = nowIso()
    return {
      ...order,
      status: ORDER_STATUS_CANCELED,
      updated_at: stamp,
      closed_at: stamp
    }
  })
}

export function markPaidAndStart(orderId) {
  purgeExpiredOrders()
  return updateOrder(orderId, (order) => {
    if (order.status !== ORDER_STATUS_AWAITING_PAYMENT) {
      return null
    }
    const stamp = nowIso()
    return {
      ...order,
      status: ORDER_STATUS_IN_PROGRESS,
      paid_at: stamp,
      updated_at: stamp
    }
  })
}

export function setReady(orderId, resultText, revisionWindowHours = 48) {
  purgeExpiredOrders()
  return updateOrder(orderId, (order) => {
    const now = new Date()
    const stamp = now.toISOString()
    const windowUntil = new Date(now.getTime() + revisionWindowHours * 60 * 60 * 1000).toISOString()
    return {
      ...order,
      status: ORDER_STATUS_READY,
      result_text: String(resultText || ''),
      result_version: Number(order.result_version || 0) + 1,
      ready_at: order.ready_at || stamp,
      revision_window_until: order.revision_window_until || windowUntil,
      updated_at: stamp
    }
  })
}

export function acceptOrder(orderId) {
  purgeExpiredOrders()
  return updateOrder(orderId, (order) => {
    if (![ORDER_STATUS_READY, ORDER_STATUS_IN_REVISION].includes(order.status)) {
      return order
    }
    const stamp = nowIso()
    return {
      ...order,
      status: ORDER_STATUS_COMPLETED,
      updated_at: stamp,
      closed_at: stamp
    }
  })
}

export function closeOrder(orderId) {
  purgeExpiredOrders()
  return updateOrder(orderId, (order) => {
    const stamp = nowIso()
    return {
      ...order,
      status: ORDER_STATUS_COMPLETED,
      updated_at: stamp,
      closed_at: stamp
    }
  })
}

export function setInRevision(orderId) {
  purgeExpiredOrders()
  return updateOrder(orderId, (order) => ({
    ...order,
    status: ORDER_STATUS_IN_REVISION,
    updated_at: nowIso()
  }))
}

export function applyRevisionResult(orderId, requestText, responseText, closeOrderFlag) {
  purgeExpiredOrders()
  const updated = updateOrder(orderId, (order) => {
    const stamp = nowIso()
    const nextStatus = closeOrderFlag ? ORDER_STATUS_COMPLETED : ORDER_STATUS_READY
    return {
      ...order,
      status: nextStatus,
      result_text: String(responseText || ''),
      result_version: Number(order.result_version || 0) + 1,
      revision_used: Number(order.revision_used || 0) + 1,
      updated_at: stamp,
      closed_at: closeOrderFlag ? stamp : order.closed_at
    }
  })
  if (!updated) {
    return null
  }

  const revisions = loadRevisions()
  const meta = loadMeta()
  const revisionId = Number(meta.nextRevisionId || 1)
  meta.nextRevisionId = revisionId + 1
  saveMeta(meta)
  revisions.push({
    id: revisionId,
    order_id: Number(orderId),
    request_text: String(requestText || ''),
    response_text: String(responseText || ''),
    created_at: nowIso()
  })
  saveRevisions(revisions)
  return updated
}

export function listOrderRevisions(orderId) {
  purgeExpiredOrders()
  return loadRevisions()
    .filter((revision) => Number(revision.order_id) === Number(orderId))
    .sort((a, b) => Number(a.id) - Number(b.id))
}

export function resolveOrderInput(rawValue) {
  purgeExpiredOrders()
  const token = String(rawValue || '').trim()
  if (!token) {
    return null
  }
  if (/^\d+$/.test(token)) {
    return getOrder(Number.parseInt(token, 10))
  }
  const normalized = token.toUpperCase()
  if (!normalized.startsWith('ORD-')) {
    return null
  }
  const orders = listRecentOrders(5000)
  return orders.find((order) => publicOrderNo(Number(order.id), Number(order.user_id)).toUpperCase() === normalized) || null
}

export function exportOrderResultAsFile(order) {
  const safeText = String(order?.result_text || '').trim() || 'Результат временно пуст. Попробуйте запросить правку.'
  const filename = `order_${order.id}_v${order.result_version}.txt`
  const blob = new Blob([safeText], { type: 'text/plain;charset=utf-8' })
  return { blob, filename }
}

export function clearAllOrders() {
  saveOrders([])
  saveRevisions([])
  saveMeta({ nextOrderId: 1, nextRevisionId: 1 })
}

export function saveFeedback(entry) {
  const list = parseJson(FEEDBACK_KEY, [])
  list.push({
    id: Date.now(),
    text: String(entry.text || ''),
    user_id: Number(entry.userId),
    created_at: nowIso()
  })
  saveJson(FEEDBACK_KEY, list)
}
