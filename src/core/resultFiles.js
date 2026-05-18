import { SERVICE_PRESENTATION } from './catalog'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

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

export async function buildGeneratedResultFile(order, resultText) {
  if (order?.service_type === SERVICE_PRESENTATION) {
    throw new Error('For presentation orders, a ready PDF file must be returned by the LLM. Local PDF assembly from text is disabled.')
  }

  const text = getRenderableResultText(resultText, order)
  const blob = await buildDocxBlob(order, text)
  return {
    blob: new Blob([blob], { type: DOCX_MIME }),
    filename: sanitizeFilename(`work_${order?.id || 'result'}.docx`, 'work.docx')
  }
}
