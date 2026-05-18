const MAX_IMAGE_BYTES = 10 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 15000
const ALLOWED_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif'
])

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 200_000) {
        reject(new Error('Payload too large'))
      }
    })
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {})
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, payload) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function normalizeImageUrl(input) {
  const value = String(input || '').trim()
  if (!value) {
    return ''
  }
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ''
    }
    return url.toString()
  } catch {
    return ''
  }
}

function normalizeSearchQuery(input) {
  return String(input || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

function pickImageMime(contentTypeRaw, url) {
  const contentType = String(contentTypeRaw || '').toLowerCase().split(';')[0].trim()
  if (ALLOWED_IMAGE_MIME.has(contentType)) {
    return contentType
  }
  const pathname = String(url?.pathname || '').toLowerCase()
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (pathname.endsWith('.png')) {
    return 'image/png'
  }
  if (pathname.endsWith('.webp')) {
    return 'image/webp'
  }
  if (pathname.endsWith('.gif')) {
    return 'image/gif'
  }
  if (pathname.endsWith('.avif')) {
    return 'image/avif'
  }
  return ''
}

async function findCommonsImageUrl(query) {
  const safeQuery = normalizeSearchQuery(query)
  if (!safeQuery) {
    return ''
  }

  const apiUrl = new URL('https://commons.wikimedia.org/w/api.php')
  apiUrl.searchParams.set('action', 'query')
  apiUrl.searchParams.set('generator', 'search')
  apiUrl.searchParams.set('gsrnamespace', '6')
  apiUrl.searchParams.set('gsrlimit', '8')
  apiUrl.searchParams.set('gsrsearch', safeQuery)
  apiUrl.searchParams.set('prop', 'imageinfo')
  apiUrl.searchParams.set('iiprop', 'url|mime')
  apiUrl.searchParams.set('iiurlwidth', '1400')
  apiUrl.searchParams.set('format', 'json')
  apiUrl.searchParams.set('origin', '*')

  const response = await fetch(apiUrl, { redirect: 'follow' })
  if (!response.ok) {
    return ''
  }

  const data = await response.json()
  const pages = Object.values(data?.query?.pages || {})
  for (const page of pages) {
    const info = page?.imageinfo?.[0]
    const mime = String(info?.mime || '').toLowerCase()
    const candidate = String(info?.thumburl || info?.url || '').trim()
    if (candidate && ALLOWED_IMAGE_MIME.has(mime)) {
      return candidate
    }
  }
  return ''
}

function buildPicsumFallbackUrl(query) {
  const seed = encodeURIComponent(normalizeSearchQuery(query) || 'presentation-slide')
  return `https://picsum.photos/seed/${seed}/1400/900`
}

async function fetchImageAsDataUrl(imageUrl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`Upstream responded ${response.status}`)
    }

    const lengthHeader = Number.parseInt(String(response.headers.get('content-length') || '0'), 10)
    if (Number.isFinite(lengthHeader) && lengthHeader > MAX_IMAGE_BYTES) {
      throw new Error(`Image is too large (>${MAX_IMAGE_BYTES} bytes)`)
    }

    const mimeType = pickImageMime(response.headers.get('content-type'), new URL(imageUrl))
    if (!mimeType) {
      throw new Error('Unsupported or missing image content-type')
    }

    const arrayBuffer = await response.arrayBuffer()
    if (arrayBuffer.byteLength <= 0) {
      throw new Error('Empty image payload')
    }
    if (arrayBuffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error(`Image is too large (>${MAX_IMAGE_BYTES} bytes)`)
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64')
    return {
      mimeType,
      dataUrl: `data:${mimeType};base64,${base64}`
    }
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'Method not allowed' })
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch (error) {
    sendJson(res, 400, { error: String(error?.message || 'Invalid request body') })
    return
  }

  const requestedUrl = normalizeImageUrl(body?.url)
  const query = normalizeSearchQuery(body?.query)
  if (!requestedUrl && !query) {
    sendJson(res, 400, { error: 'Valid image URL or search query is required.' })
    return
  }

  const candidates = []
  if (requestedUrl) {
    candidates.push(requestedUrl)
  }
  const commonsUrl = await findCommonsImageUrl(query)
  if (commonsUrl) {
    candidates.push(commonsUrl)
  }
  if (query) {
    candidates.push(buildPicsumFallbackUrl(query))
  }

  let lastError = null
  for (const candidate of candidates) {
    try {
      const result = await fetchImageAsDataUrl(candidate)
      sendJson(res, 200, {
        ok: true,
        url: candidate,
        mimeType: result.mimeType,
        dataUrl: result.dataUrl
      })
      return
    } catch (error) {
      lastError = error
    }
  }

  try {
    const result = await fetchImageAsDataUrl(buildPicsumFallbackUrl('presentation-slide'))
    sendJson(res, 200, {
      ok: true,
      url: buildPicsumFallbackUrl('presentation-slide'),
      mimeType: result.mimeType,
      dataUrl: result.dataUrl
    })
  } catch (error) {
    sendJson(res, 422, { error: String(lastError?.message || error?.message || 'Image fetch failed') })
  }
}
