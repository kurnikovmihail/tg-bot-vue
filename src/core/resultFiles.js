import { SERVICE_PRESENTATION } from './catalog'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const PDF_MIME = 'application/pdf'

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
    'Готовая работа',
    topic ? `Тема: ${topic}` : '',
    subject ? `Предмет: ${subject}` : '',
    '',
    'Содержимое исходного ответа не удалось восстановить из поврежденного бинарного payload. Обратитесь в поддержку и сообщите номер заказа.'
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

function drawSlideToCanvas(slideText, index, total) {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 900
  const ctx = canvas.getContext('2d')

  ctx.fillStyle = '#f7f8f2'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#143d3a'
  ctx.fillRect(0, 0, canvas.width, 118)
  ctx.fillStyle = '#d99f45'
  ctx.fillRect(0, 118, canvas.width, 10)

  const lines = String(slideText || '').split(/\r?\n/).map(cleanMarkdownLine).filter(Boolean)
  const first = lines[0] || `Slide ${index + 1}`
  const title = first.replace(/^(slide|слайд)\s*\d+\s*[:.-]?\s*/i, '') || first
  const body = lines.slice(1).join(' ')

  ctx.fillStyle = '#ffffff'
  ctx.font = '700 54px Arial, sans-serif'
  for (const line of wrapCanvasText(ctx, title, 1340, 1)) {
    ctx.fillText(line, 90, 78)
  }

  ctx.fillStyle = '#1b2423'
  ctx.font = '400 37px Arial, sans-serif'
  const bodyLines = wrapCanvasText(ctx, body || lines.join(' '), 1340, 12)
  let y = 210
  for (const line of bodyLines) {
    ctx.fillText(line, 120, y)
    y += 54
  }

  ctx.fillStyle = '#143d3a'
  ctx.font = '700 28px Arial, sans-serif'
  ctx.fillText(`${index + 1} / ${total}`, 90, 835)
  return canvas
}

async function buildPresentationPdfBlob(order, text) {
  const { jsPDF } = await import('jspdf')
  const slides = splitPresentationSlides(text, order)
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4', compress: true })
  const width = pdf.internal.pageSize.getWidth()
  const height = pdf.internal.pageSize.getHeight()

  slides.forEach((slide, index) => {
    if (index > 0) {
      pdf.addPage('a4', 'landscape')
    }
    const canvas = drawSlideToCanvas(slide, index, slides.length)
    const image = canvas.toDataURL('image/jpeg', 0.92)
    pdf.addImage(image, 'JPEG', 0, 0, width, height)
  })

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
