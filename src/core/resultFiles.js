import { SERVICE_PRESENTATION } from './catalog'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF_MIME = 'application/pdf'
const IMAGE_PROXY_ENDPOINT = '/api/image-proxy'
const IMAGE_PROXY_TIMEOUT_MS = 12000

function sanitizeFilename(value, fallbackName) {
  const raw = String(value || '').trim()
  if (!raw) {
    return fallbackName
  }
  return raw.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 120) || fallbackName
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
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1))
    } catch {
      return null
    }
  }
}

function extractTextFromJsonPayload(value) {
  if (!value || typeof value !== 'object') {
    return ''
  }
  const direct = [
    value.markdown,
    value.text,
    value.contentText,
    value.documentText,
    value.presentationText,
    value.result
  ].find((item) => typeof item === 'string' && item.trim())
  if (direct) {
    return direct.trim()
  }
  if (Array.isArray(value.slides)) {
    return value.slides
      .map((slide, index) => {
        if (typeof slide === 'string') {
          return `Slide ${index + 1}\n${slide}`
        }
        if (!slide || typeof slide !== 'object') {
          return ''
        }
        const title = String(slide.title || `Slide ${index + 1}`).trim()
        const body = Array.isArray(slide.points)
          ? slide.points.join('\n')
          : String(slide.body || slide.text || '').trim()
        return [title, body].filter(Boolean).join('\n')
      })
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
}

export function getRenderableResultText(resultText, order) {
  const raw = String(resultText || '').trim()
  if (!raw) {
    return buildEmptyResultText(order)
  }

  const fencedBlockRegex = /```(?:[a-z0-9_-]+)?\s*([\s\S]*?)```/gi
  let extracted = ''
  let stripped = raw
  let match

  while ((match = fencedBlockRegex.exec(raw)) !== null) {
    const block = String(match[1] || '').trim()
    const parsed = parseJsonLoose(block)
    const fromJson = extractTextFromJsonPayload(parsed)
    if (fromJson) {
      extracted += `${fromJson}\n\n`
    }
    if (parsed?.base64 || parsed?.contentBase64 || parsed?.dataUrl) {
      stripped = stripped.replace(match[0], '')
    }
  }

  const parsedWhole = parseJsonLoose(raw)
  const wholeJsonText = extractTextFromJsonPayload(parsedWhole)
  if (wholeJsonText) {
    extracted += `${wholeJsonText}\n\n`
  }
  if (parsedWhole?.base64 || parsedWhole?.contentBase64 || parsedWhole?.dataUrl) {
    stripped = ''
  }

  const cleaned = (extracted || stripped)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/"base64"\s*:\s*"[^"]*"/gi, '')
    .replace(/"contentBase64"\s*:\s*"[^"]*"/gi, '')
    .replace(/"dataUrl"\s*:\s*"[^"]*"/gi, '')
    .trim()

  return cleaned || buildEmptyResultText(order)
}

function buildEmptyResultText(order) {
  const req = order?.frozen_requirements || order?.requirements || {}
  const topic = String(req.topic || order?.topic || '').trim()
  const subject = String(req.subject || '').trim()
  return [
    'Completed work',
    topic ? `Topic: ${topic}` : '',
    subject ? `Subject: ${subject}` : '',
    '',
    'The source answer could not be restored from a corrupted binary payload. Contact support and provide the order number.'
  ].filter((line) => line !== '').join('\n')
}

function cleanMarkdownLine(line) {
  return String(line || '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/^\s*[-*]\s+/, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .trim()
}

function createDocxParagraph(docx, line, index) {
  const { AlignmentType, HeadingLevel, Paragraph, TextRun } = docx
  const raw = String(line || '').trim()
  if (!raw) {
    return new Paragraph({ text: '' })
  }
  const headingMatch = raw.match(/^(#{1,3})\s+(.+)$/)
  if (headingMatch) {
    return new Paragraph({
      text: cleanMarkdownLine(headingMatch[2]),
      heading: headingMatch[1].length === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
      spacing: { before: index === 0 ? 0 : 240, after: 120 }
    })
  }
  const bulletMatch = raw.match(/^\s*[-*]\s+(.+)$/)
  if (bulletMatch) {
    return new Paragraph({
      children: [new TextRun(cleanMarkdownLine(bulletMatch[1]))],
      bullet: { level: 0 },
      spacing: { after: 80 }
    })
  }
  return new Paragraph({
    children: [new TextRun(cleanMarkdownLine(raw))],
    alignment: index === 0 ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    spacing: { after: 120 },
    indent: index === 0 ? undefined : { firstLine: 567 }
  })
}

async function buildDocxBlob(order, text) {
  const docx = await import('docx')
  const { Document, Packer } = docx
  const lines = String(text || '').split(/\r?\n/)
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: lines.map((line, index) => createDocxParagraph(docx, line, index))
      }
    ]
  })
  return Packer.toBlob(doc)
}

function wrapCanvasText(ctx, text, maxWidth, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean)
  const lines = []
  let current = ''
  for (const word of words) {
    const next = current ? `${current} ${word}` : word
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
    } else {
      if (current) {
        lines.push(current)
      }
      current = word
    }
    if (lines.length >= maxLines) {
      break
    }
  }
  if (current && lines.length < maxLines) {
    lines.push(current)
  }
  return lines
}

const PRESENTATION_PALETTES = {
  green: {
    background: '#f7f8f2',
    header: '#143d3a',
    accent: '#d99f45',
    text: '#1b2423',
    panel: '#e7efe9',
    panelStroke: '#b7c8bc'
  },
  red: {
    background: '#fff6f6',
    header: '#7a1010',
    accent: '#e05353',
    text: '#2b1b1b',
    panel: '#ffe9e9',
    panelStroke: '#efb4b4'
  },
  blue: {
    background: '#f5f9ff',
    header: '#103b6d',
    accent: '#58a1ff',
    text: '#172233',
    panel: '#e8f2ff',
    panelStroke: '#b8d4ff'
  },
  dark: {
    background: '#f3f3f3',
    header: '#1f1f1f',
    accent: '#8f8f8f',
    text: '#1f1f1f',
    panel: '#e6e6e6',
    panelStroke: '#bfbfbf'
  },
  amber: {
    background: '#fffaf0',
    header: '#6f3a12',
    accent: '#e8a142',
    text: '#33261a',
    panel: '#fff0d8',
    panelStroke: '#e6c79d'
  }
}

function normalizeText(value) {
  return String(value || '').toLowerCase()
}

function parseBooleanLike(value) {
  const raw = normalizeText(value).trim()
  if (!raw) {
    return false
  }
  return ['yes', 'true', '1', 'on', 'required', 'да', 'нужно', 'требуется'].some((token) => raw.includes(token))
}

function pickPaletteByText(text) {
  const source = normalizeText(text)
  if (!source) {
    return null
  }
  if (/(red|crimson|scarlet|burgundy|maroon|красн|бордов|алый)/i.test(source)) {
    return PRESENTATION_PALETTES.red
  }
  if (/(blue|navy|azure|cyan|син|голуб)/i.test(source)) {
    return PRESENTATION_PALETTES.blue
  }
  if (/(dark|black|graphite|charcoal|черн|темн)/i.test(source)) {
    return PRESENTATION_PALETTES.dark
  }
  if (/(amber|orange|yellow|gold|оранж|желт|золот)/i.test(source)) {
    return PRESENTATION_PALETTES.amber
  }
  if (/(green|emerald|teal|зелен)/i.test(source)) {
    return PRESENTATION_PALETTES.green
  }
  return null
}

function extractThemeColorLine(text) {
  const match = String(text || '').match(/theme color\s*:\s*([^\n\r]+)/i)
  return String(match?.[1] || '').trim()
}

function detectPresentationPalette(order, text) {
  const req = order?.frozen_requirements || {}
  const style = normalizeText(req.style)
  const themeFromResult = pickPaletteByText(extractThemeColorLine(text))
  if (themeFromResult) {
    return themeFromResult
  }

  const mergedHints = [
    order?.last_revision_request,
    req.teacher_requirements,
    req.special_requirements,
    text.slice(0, 1800)
  ].join('\n')
  const themeFromHints = pickPaletteByText(mergedHints)
  if (themeFromHints) {
    return themeFromHints
  }

  if (style.includes('strict')) {
    return PRESENTATION_PALETTES.blue
  }
  if (style.includes('visual')) {
    return PRESENTATION_PALETTES.amber
  }
  return PRESENTATION_PALETTES.green
}

function arePresentationImagesRequested(order, text) {
  const req = order?.frozen_requirements || {}
  if (parseBooleanLike(req.images_required)) {
    return true
  }
  const revisionHint = normalizeText(order?.last_revision_request)
  if (/(image|images|illustration|photo|picture|картин|изображени|иллюстрац|фото)/i.test(revisionHint)) {
    return !/(without\s+images|no\s+images|без\s+картин|без\s+изображени|без\s+фото)/i.test(revisionHint)
  }
  return /(image url|image idea|illustration|photo|картин|изображени|иллюстрац|фото)/i.test(String(text || ''))
}

function splitPresentationSlides(text, order) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').trim()
  const wanted = Number.parseInt(String(order?.frozen_requirements?.slides_count || ''), 10)
  const marked = normalized
    .replace(/\n(?=\s*(?:#{1,3}\s*)?(?:slide|слайд)\s*\d+)/gi, '\n---SLIDE---\n')
    .split('---SLIDE---')
    .map((part) => part.trim())
    .filter(Boolean)

  if (marked.length > 1) {
    return marked
  }

  const paragraphs = normalized.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)
  const count = Number.isFinite(wanted) && wanted > 1 ? wanted : Math.min(12, Math.max(1, paragraphs.length))
  const slides = []
  const perSlide = Math.max(1, Math.ceil(paragraphs.length / count))
  for (let i = 0; i < paragraphs.length; i += perSlide) {
    slides.push(paragraphs.slice(i, i + perSlide).join('\n\n'))
  }
  return slides.length ? slides : [normalized]
}

function extractSlideParts(slideText, index) {
  const lines = String(slideText || '')
    .split(/\r?\n/)
    .map(cleanMarkdownLine)
    .filter(Boolean)

  const first = lines[0] || `Slide ${index + 1}`
  const title = first.replace(/^(slide|слайд)\s*\d+\s*[:.-]?\s*/i, '') || first
  const imageHints = []
  const imageUrls = []
  const bodyLines = []

  for (const line of lines.slice(1)) {
    const urlMatch = line.match(/^(?:image\s*url|image\s*link|url|ссылка\s*на\s*изображение|ссылка\s*на\s*фото)\s*[:\-]\s*(https?:\/\/\S+)/i)
    if (urlMatch?.[1]) {
      imageUrls.push(urlMatch[1].trim().replace(/[),.;]+$/, ''))
      continue
    }
    const imageMatch = line.match(/^(?:image idea|image|illustration|photo|изображение|картинка|иллюстрация|фото)\s*[:\-]\s*(.+)$/i)
    if (imageMatch?.[1]) {
      imageHints.push(imageMatch[1].trim())
      continue
    }
    bodyLines.push(line)
  }

  return {
    title,
    body: bodyLines.join(' '),
    imageHint: imageHints.join('. ').trim(),
    imageUrl: imageUrls[0] || ''
  }
}

async function resolveImageDataUrlFromProxy(imageUrl, query) {
  const clean = String(imageUrl || '').trim()
  const safeQuery = String(query || '').trim()
  if (!/^https?:\/\//i.test(clean) && !safeQuery) {
    return ''
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), IMAGE_PROXY_TIMEOUT_MS)
  try {
    const response = await fetch(IMAGE_PROXY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: clean, query: safeQuery }),
      signal: controller.signal
    })
    if (!response.ok) {
      return ''
    }
    const data = await response.json()
    const dataUrl = String(data?.dataUrl || '').trim()
    if (!/^data:image\/[a-z0-9.+-]+;base64,/i.test(dataUrl)) {
      return ''
    }
    return dataUrl
  } catch {
    return ''
  } finally {
    clearTimeout(timer)
  }
}

async function loadImageElement(dataUrl) {
  const source = String(dataUrl || '').trim()
  if (!source) {
    return null
  }
  return new Promise((resolve) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => resolve(null)
    image.src = source
  })
}

function drawImageCover(ctx, image, x, y, width, height) {
  const sourceWidth = image?.naturalWidth || image?.width || 0
  const sourceHeight = image?.naturalHeight || image?.height || 0
  if (!sourceWidth || !sourceHeight) {
    return
  }
  const scale = Math.max(width / sourceWidth, height / sourceHeight)
  const drawWidth = sourceWidth * scale
  const drawHeight = sourceHeight * scale
  const drawX = x + (width - drawWidth) / 2
  const drawY = y + (height - drawHeight) / 2
  ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight)
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  const r = Math.max(0, Math.min(radius, Math.min(width, height) / 2))
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + r)
  ctx.lineTo(x + width, y + height - r)
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height)
  ctx.lineTo(x + r, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

function drawIllustrationCard(ctx, x, y, width, height, palette, hint, index, imageElement = null) {
  drawRoundedRect(ctx, x, y, width, height, 26)
  ctx.fillStyle = palette.panel
  ctx.fill()
  ctx.strokeStyle = palette.panelStroke
  ctx.lineWidth = 2
  ctx.stroke()

  if (imageElement) {
    ctx.save()
    drawRoundedRect(ctx, x + 18, y + 58, width - 36, height - 76, 18)
    ctx.clip()
    drawImageCover(ctx, imageElement, x + 18, y + 58, width - 36, height - 76)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.fillRect(x + 18, y + height - 82, width - 36, 64)
    ctx.restore()
  } else {
    ctx.fillStyle = palette.accent
    ctx.globalAlpha = 0.18
    ctx.beginPath()
    ctx.arc(x + width * 0.72, y + height * 0.3, 90, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(x + width * 0.32, y + height * 0.68, 120, 0, Math.PI * 2)
    ctx.fill()
    ctx.globalAlpha = 1
  }

  ctx.fillStyle = palette.header
  ctx.font = '700 26px Arial, sans-serif'
  ctx.fillText(`Illustration ${index + 1}`, x + 26, y + 42)

  ctx.fillStyle = palette.text
  ctx.font = '500 22px Arial, sans-serif'
  const safeHint = String(hint || 'Visual support for this slide').slice(0, 240)
  const hintLines = wrapCanvasText(ctx, safeHint, width - 52, 8)
  let cursorY = y + 92
  for (const line of hintLines) {
    ctx.fillText(line, x + 26, cursorY)
    cursorY += 34
  }
}

function drawSlideToCanvas(slideText, index, total, options = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 900
  const ctx = canvas.getContext('2d')
  const palette = options.palette || PRESENTATION_PALETTES.green
  const withIllustration = Boolean(options.withIllustration)

  ctx.fillStyle = palette.background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = palette.header
  ctx.fillRect(0, 0, canvas.width, 118)
  ctx.fillStyle = palette.accent
  ctx.fillRect(0, 118, canvas.width, 10)

  const { title, body, imageHint } = extractSlideParts(slideText, index)
  const textMaxWidth = withIllustration ? 860 : 1340
  const isCover = index === 0

  ctx.save()
  ctx.globalAlpha = 0.1
  ctx.fillStyle = palette.accent
  ctx.beginPath()
  ctx.arc(1390, 70, 250, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = palette.header
  ctx.beginPath()
  ctx.arc(70, 830, 300, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  if (isCover) {
    ctx.fillStyle = '#ffffff'
    ctx.font = '700 64px Arial, sans-serif'
    for (const line of wrapCanvasText(ctx, title, 980, 2)) {
      ctx.fillText(line, 90, 76)
    }

    ctx.fillStyle = palette.text
    ctx.font = '400 38px Arial, sans-serif'
    const introLines = wrapCanvasText(ctx, body || imageHint || title, 820, 8)
    let introY = 250
    for (const line of introLines) {
      ctx.fillText(line, 115, introY)
      introY += 56
    }

    if (withIllustration) {
      drawIllustrationCard(ctx, 1010, 170, 500, 560, palette, imageHint || title, index, options.imageElement || null)
    }

    ctx.fillStyle = palette.accent
    ctx.fillRect(115, 760, 220, 10)
    ctx.fillStyle = palette.header
    ctx.font = '700 28px Arial, sans-serif'
    ctx.fillText(`${index + 1} / ${total}`, 90, 835)
    return canvas
  }

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 50px Arial, sans-serif'
  for (const line of wrapCanvasText(ctx, title, textMaxWidth, 1)) {
    ctx.fillText(line, 90, 76)
  }

  drawRoundedRect(ctx, 90, 175, withIllustration ? 900 : 1420, 585, 24)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.78)'
  ctx.fill()
  ctx.strokeStyle = palette.panelStroke
  ctx.lineWidth = 2
  ctx.stroke()

  ctx.fillStyle = palette.accent
  ctx.fillRect(125, 220, 10, 480)

  ctx.fillStyle = palette.text
  ctx.font = '400 35px Arial, sans-serif'
  const bodyLines = wrapCanvasText(ctx, body || title, withIllustration ? 760 : 1250, 10)
  let y = 250
  for (const line of bodyLines) {
    ctx.fillText(line, 165, y)
    y += 52
  }

  if (withIllustration) {
    drawIllustrationCard(ctx, 1040, 176, 470, 560, palette, imageHint || title, index, options.imageElement || null)
  }

  ctx.fillStyle = palette.header
  ctx.font = '700 28px Arial, sans-serif'
  ctx.fillText(`${index + 1} / ${total}`, 90, 835)
  return canvas
}

async function buildPresentationPdfBlob(order, text) {
  const { jsPDF } = await import('jspdf')
  const slides = splitPresentationSlides(text, order)
  const palette = detectPresentationPalette(order, text)
  const withIllustration = arePresentationImagesRequested(order, text)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()

  for (let index = 0; index < slides.length; index += 1) {
    const slide = slides[index]
    if (index > 0) {
      pdf.addPage('a4', 'landscape')
    }

    const slideParts = extractSlideParts(slide, index)
    let imageElement = null
    if (withIllustration) {
      const req = order?.frozen_requirements || {}
      const query = [slideParts.imageHint, slideParts.title, req.topic, req.subject]
        .map((item) => String(item || '').trim())
        .filter(Boolean)
        .join(' ')
      const proxiedDataUrl = await resolveImageDataUrlFromProxy(slideParts.imageUrl, query)
      imageElement = await loadImageElement(proxiedDataUrl)
    }

    const canvas = drawSlideToCanvas(slide, index, slides.length, { palette, withIllustration, imageElement })
    const image = canvas.toDataURL('image/jpeg', 0.92)
    pdf.addImage(image, 'JPEG', 0, 0, width, height)
  }

  return pdf.output('blob')
}

export async function buildGeneratedResultFile(order, resultText) {
  const text = getRenderableResultText(resultText, order)
  if (order?.service_type === SERVICE_PRESENTATION) {
    const blob = await buildPresentationPdfBlob(order, text)
    return {
      blob: new Blob([blob], { type: PDF_MIME }),
      filename: sanitizeFilename(`presentation_${order?.id || 'result'}.pdf`, 'presentation.pdf')
    }
  }

  const blob = await buildDocxBlob(order, text)
  return {
    blob: new Blob([blob], { type: DOCX_MIME }),
    filename: sanitizeFilename(`work_${order?.id || 'result'}.docx`, 'work.docx')
  }
}
