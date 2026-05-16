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
import { buildGeneratedResultFile, getRenderableResultText } from './resultFiles'

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
    last_revision_request: '',
    result_version: 0,
    created_at: createdAt,
    updated_at: createdAt,
    paid_at: null,
    ready_at: null,
    closed_at: null,
    last_error: null,
    last_error_at: null
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
      updated_at: stamp,
      last_error: null,
      last_error_at: null
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
      updated_at: stamp,
      last_error: null,
      last_error_at: null
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
    updated_at: nowIso(),
    last_error: null,
    last_error_at: null
  }))
}

export function setOrderError(orderId, message) {
  purgeExpiredOrders()
  return updateOrder(orderId, (order) => ({
    ...order,
    status: ORDER_STATUS_IN_PROGRESS,
    updated_at: nowIso(),
    last_error: String(message || 'Неизвестная ошибка генерации.'),
    last_error_at: nowIso()
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
      last_revision_request: String(requestText || ''),
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


function sanitizeFilename(value, fallbackName) {
  const raw = String(value || '').trim()
  if (!raw) {
    return fallbackName
  }
  return raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120) || fallbackName
}

function decodeBase64ToBytes(base64Text) {
  let cleaned = String(base64Text || '').replace(/\s+/g, '')
  cleaned = cleaned.replace(/-/g, '+').replace(/_/g, '/')
  while (cleaned.length % 4 !== 0) {
    cleaned += '='
  }
  const binary = window.atob(cleaned)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function hasAsciiMarker(bytes, marker, from = 0, to = bytes.length) {
  if (!bytes || !marker || marker.length === 0) {
    return false
  }
  const start = Math.max(0, from)
  const end = Math.min(bytes.length, to)
  if (end - start < marker.length) {
    return false
  }
  for (let i = start; i <= end - marker.length; i += 1) {
    let ok = true
    for (let j = 0; j < marker.length; j += 1) {
      if (bytes[i + j] !== marker.charCodeAt(j)) {
        ok = false
        break
      }
    }
    if (ok) {
      return true
    }
  }
  return false
}

function isLikelyZipContainer(bytes) {
  if (!bytes || bytes.length < 22) {
    return false
  }
  const startsWithZipHeader =
    (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x05 && bytes[3] === 0x06) ||
    (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x07 && bytes[3] === 0x08)
  if (!startsWithZipHeader) {
    return false
  }
  const tailStart = Math.max(0, bytes.length - 70_000)
  return hasAsciiMarker(bytes, 'PK\u0005\u0006', tailStart, bytes.length)
}

function isLikelyPdf(bytes) {
  if (!bytes || bytes.length < 8) {
    return false
  }
  if (!hasAsciiMarker(bytes, '%PDF-', 0, Math.min(bytes.length, 1024))) {
    return false
  }
  const tailStart = Math.max(0, bytes.length - 4096)
  return hasAsciiMarker(bytes, '%%EOF', tailStart, bytes.length)
}

function isBinaryPayloadValid(bytes, mimeType, filename) {
  const mime = String(mimeType || '').toLowerCase()
  const name = String(filename || '').toLowerCase()
  const expectPdf = mime.includes('application/pdf') || name.endsWith('.pdf')
  const expectZipOffice =
    mime.includes('officedocument') ||
    mime.includes('application/zip') ||
    name.endsWith('.docx') ||
    name.endsWith('.pptx') ||
    name.endsWith('.xlsx')

  if (expectPdf) {
    return isLikelyPdf(bytes)
  }
  if (expectZipOffice) {
    return isLikelyZipContainer(bytes)
  }
  return true
}

function getFilenameFromUrl(url, fallback = 'work_file') {
  try {
    const parsed = new URL(String(url || ''))
    const last = decodeURIComponent(parsed.pathname.split('/').pop() || '').trim()
    return sanitizeFilename(last, fallback)
  } catch {
    return sanitizeFilename('', fallback)
  }
}

function pickRemoteFileUrl(text) {
  const source = String(text || '')
  const markdownMatch = source.match(/\[[^\]]*]\((https?:\/\/[^\s)]+)\)/i)
  if (markdownMatch?.[1]) {
    return markdownMatch[1]
  }
  const directMatch = source.match(/https?:\/\/[^\s"'`<>]+/i)
  return directMatch?.[0] || ''
}

async function fetchRemoteFile(url, fallbackName = 'work_file') {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Remote file download failed: ${response.status}`)
  }
  const blob = await response.blob()
  const filename = getFilenameFromUrl(url, fallbackName)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  if (!isBinaryPayloadValid(bytes, blob.type, filename)) {
    throw new Error('Remote file payload is incomplete or corrupted')
  }
  return { blob, filename }
}

function extractCandidateJsonBlocks(text) {
  const source = String(text || '')
  if (!source.trim()) {
    return []
  }
  const candidates = [source]
  const fencedBlockRegex = /```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/gi
  let match
  while ((match = fencedBlockRegex.exec(source)) !== null) {
    const body = String(match[1] || '')
    if (body.trim()) {
      candidates.push(body)
    }
  }
  return candidates
}

function parseJsonLoose(block) {
  const raw = String(block || '').trim()
  if (!raw) {
    return null
  }
  try {
    return JSON.parse(raw)
  } catch {
    const firstBrace = raw.indexOf('{')
    const lastBrace = raw.lastIndexOf('}')
    if (firstBrace < 0 || lastBrace <= firstBrace) {
      return null
    }
    const jsonSlice = raw.slice(firstBrace, lastBrace + 1).trim()
    try {
      return JSON.parse(jsonSlice)
    } catch {
      return null
    }
  }
}

function parseEmbeddedLlmFile(resultText) {
  const blocks = extractCandidateJsonBlocks(resultText)
  for (const block of blocks) {
    const parsed = parseJsonLoose(block)
    if (!parsed) {
      continue
    }

    if (!parsed || typeof parsed !== 'object') {
      continue
    }

    const base64 = String(parsed.base64 || parsed.contentBase64 || parsed.content || '').trim()
    const dataUrl = String(parsed.dataUrl || parsed.url || '').trim()
    if (!base64 && !dataUrl) {
      continue
    }

    let mimeType = String(parsed.mimeType || parsed.contentType || '').trim()
    let payloadBase64 = base64
    if (dataUrl && !payloadBase64) {
      const dataUrlMatch = dataUrl.match(/^data:([^;]+);base64,(.+)$/i)
      if (dataUrlMatch) {
        mimeType = mimeType || String(dataUrlMatch[1] || '').trim()
        payloadBase64 = String(dataUrlMatch[2] || '').trim()
      }
    }

    if (!payloadBase64) {
      continue
    }

    let bytes
    try {
      bytes = decodeBase64ToBytes(payloadBase64)
    } catch {
      continue
    }

    const fallbackName = mimeType.includes('presentationml')
      ? 'work.pptx'
      : mimeType.includes('application/pdf')
        ? 'work.pdf'
        : 'work.docx'
    const filename = sanitizeFilename(parsed.filename || parsed.name, fallbackName)
    if (!isBinaryPayloadValid(bytes, mimeType, filename)) {
      continue
    }
    const blob = new Blob([bytes], {
      type: mimeType || 'application/octet-stream'
    })
    return { blob, filename }
  }
  return null
}

export async function exportOrderResultAsFile(order) {
  const safeText = String(order?.result_text || '')
  const embeddedFile = parseEmbeddedLlmFile(safeText)
  if (embeddedFile) {
    return embeddedFile
  }
  const remoteUrl = pickRemoteFileUrl(safeText)
  if (remoteUrl) {
    try {
      return await fetchRemoteFile(remoteUrl, sanitizeFilename(`order_${order?.id || 'result'}_file`, 'order_result_file'))
    } catch {
      // Ignore and fall back to raw text file.
    }
  }
  return buildGeneratedResultFile(order, safeText)
}

export function inspectOrderResult(order) {
  const raw = String(order?.result_text || '')
  const embeddedFile = parseEmbeddedLlmFile(raw)
  if (embeddedFile) {
    return {
      kind: 'file',
      raw,
      blob: embeddedFile.blob,
      filename: embeddedFile.filename
    }
  }
  return {
    kind: 'text',
    raw,
    text: getRenderableResultText(raw, order)
  }
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

