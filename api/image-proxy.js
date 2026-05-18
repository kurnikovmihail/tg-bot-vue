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

async function fetchImageAsDataUrl(imageUrl) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(imageUrl, {
      method: 'GET',
      headers: {
        Accept: 'image/avif,image/webp,image/png,image/jpeg,image/*,*/*;q=0.8',
        'User-Agent': 'GTm-presentation-image-proxy/1.0'
      },
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

  const imageUrl = normalizeImageUrl(body?.url)
  if (!imageUrl) {
    sendJson(res, 400, { error: 'Valid http/https image URL is required.' })
    return
  }

  try {
    const result = await fetchImageAsDataUrl(imageUrl)
    sendJson(res, 200, {
      ok: true,
      url: imageUrl,
      mimeType: result.mimeType,
      dataUrl: result.dataUrl
    })
  } catch (error) {
    sendJson(res, 422, { error: String(error?.message || 'Image fetch failed') })
  }
}
