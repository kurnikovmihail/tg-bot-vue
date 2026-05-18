import { LLM_GLOBAL_QUALITY_RULES, SERVICE_PRESENTATION, getOffer } from './catalog'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}

function normalized(value, fallback = '') {
  const raw = String(value ?? '').trim()
  return raw || fallback
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export const APP_CONFIG = {
  revisionLimit: 7,
  revisionWindowHours: 48,
  modelMainName: normalized(env.VITE_LLM_MODEL_MAIN, 'GPT-5.4'),
  modelRevisionName: normalized(env.VITE_LLM_MODEL_REVISION, 'GPT-5.4-mini'),
  requestDelayMs: Number.parseInt(normalized(env.VITE_LLM_DELAY_MS, '800'), 10) || 800,
  requestTimeoutMs: Number.parseInt(normalized(env.VITE_LLM_TIMEOUT_MS, '90000'), 10) || 90000,
  requestRetries: Number.parseInt(normalized(env.VITE_LLM_RETRIES, '2'), 10) || 2,
  transport: normalized(env.VITE_LLM_TRANSPORT, 'auto').toLowerCase(),
  relayPath: normalized(env.VITE_LLM_RELAY_PATH, '/api/llm'),
  apiKey: normalized(env.VITE_LLM_API_KEY),
  apiUrl: normalized(env.VITE_LLM_API_URL, 'https://polza.ai/api/v1/chat/completions'),
  apiMode: normalized(env.VITE_LLM_API_MODE, 'chat_completions'),
  apiModel: normalized(env.VITE_LLM_MODEL, 'openai/gpt-5.4'),
  apiPresentationModel: normalized(env.VITE_LLM_MODEL_PRESENTATION, 'openai/gpt-5.5'),
  apiClientId: normalized(env.VITE_LLM_CLIENT_ID, normalized(env.VITE_LLM_APP_TITLE))
}

function getTransportMode() {
  const mode = APP_CONFIG.transport
  if (mode === 'direct' || mode === 'relay') {
    return mode
  }
  return APP_CONFIG.apiKey ? 'direct' : 'relay'
}

export function getEffectiveLlmTransport() {
  return getTransportMode()
}

function ensureLlmConfigured() {
  const mode = getTransportMode()
  if (!APP_CONFIG.apiModel) {
    throw new Error('LLM model is missing. Set VITE_LLM_MODEL in env.')
  }
  if (mode === 'relay') {
    if (!APP_CONFIG.relayPath) {
      throw new Error('LLM relay path is missing. Set VITE_LLM_RELAY_PATH in env.')
    }
    return
  }
  if (!APP_CONFIG.apiKey) {
    throw new Error('LLM API key is missing. Set VITE_LLM_API_KEY in env or use relay mode.')
  }
  if (!APP_CONFIG.apiUrl) {
    throw new Error('LLM API URL is missing. Set VITE_LLM_API_URL in env.')
  }
  if (/^https?:\/\//i.test(APP_CONFIG.apiKey)) {
    throw new Error('LLM API key looks like URL. Check env: put key into VITE_LLM_API_KEY and endpoint into VITE_LLM_API_URL.')
  }
  if (/^pza_/i.test(APP_CONFIG.apiUrl)) {
    throw new Error('LLM API URL looks like API key. Check env: put key into VITE_LLM_API_KEY and endpoint into VITE_LLM_API_URL.')
  }
}

export async function generateInitial(order) {
  ensureLlmConfigured()
  await sleep(APP_CONFIG.requestDelayMs)
  const prompt = buildLlmPayload(order)
  return callLlm({
    order,
    systemPrompt: buildLlmSystemPrompt(order, 'initial'),
    userPrompt: prompt,
    maxTokens: 7000
  })
}

export async function applyRevision(order, requestText) {
  ensureLlmConfigured()
  await sleep(Math.max(500, Math.round(APP_CONFIG.requestDelayMs * 0.7)))

  const prompt = buildLlmPayload(order)
  const previous = summarizePreviousResult(order.result_text)
  const serviceSpecificRevisionHint =
    order?.service_type === SERVICE_PRESENTATION
      ? 'For presentation revisions: strictly apply requested visual style updates (for example color theme) and requested images on relevant slides.'
      : 'Apply the revision request exactly and keep the whole work coherent.'
  const userPrompt = [
    prompt,
    '',
    'Current version of the work:',
    previous || 'Empty.',
    '',
    `Client revision request: ${requestText}`,
    'Update the whole work according to the revision request.',
    serviceSpecificRevisionHint
  ].join('\n')

  return callLlm({
    order,
    systemPrompt: buildLlmSystemPrompt(order, 'revision'),
    userPrompt,
    maxTokens: 7000
  })
}

function summarizePreviousResult(value) {
  const raw = String(value || '').trim()
  if (!raw) {
    return ''
  }
  if (
    raw.includes('```llm_file') ||
    raw.includes('```llm-file') ||
    raw.includes('"type":"file"') ||
    raw.includes('"type": "file"') ||
    raw.includes('"base64"')
  ) {
    return '[Previous version contained a binary file payload. Recreate the full final content as structured text.]'
  }
  return raw.length > 5000 ? `${raw.slice(0, 5000)}...` : raw
}

function buildLlmSystemPrompt(order, mode) {
  const modeInstruction =
    mode === 'revision'
      ? 'Revise the existing completed work according to the client revision request.'
      : 'Generate the final completed work according to client requirements.'
  const fileInstruction = buildOutputFileInstruction(order?.service_type)

  return [
    LLM_GLOBAL_QUALITY_RULES,
    modeInstruction,
    'Always use the data from user prompt section "client requirements" as the source of truth.',
    'Keep output high-quality, factually accurate, and aligned with the assignment.',
    'Do not add hidden reasoning, drafts, service comments, or clarifying questions in final output.',
    fileInstruction
  ].join('\n')
}

function buildOutputFileInstruction(serviceType) {
  if (serviceType === SERVICE_PRESENTATION) {
    return [
      'ТЕСТОВЫЙ РЕЖИМ ДЛЯ ПРЕЗЕНТАЦИЙ.',
      'Самостоятельно полностью собери готовую презентацию: структура, текст, оформление, визуальная логика, изображения и финальная верстка должны быть внутри итогового файла.',
      'Верни только готовый PDF-файл презентации, который открывается на телефоне и ноутбуке без дополнительных действий.',
      'Не возвращай отдельно план, текст слайдов, комментарии, пояснения, черновики или служебные пометки.',
      'Если интерфейс ответа поддерживает прикрепление файла, прикрепи PDF как файл.',
      'Если интерфейс ответа не поддерживает прямое прикрепление файла, верни машинно-читаемый файловый объект с PDF-содержимым: type=file, filename с расширением .pdf, mimeType=application/pdf и base64 содержимое файла.',
      'Не делай презентации однотипными: для каждого нового заказа выбирай новое визуальное решение, композицию, цветовую логику и ритм слайдов.'
    ].join('\n')
  }

  return [
    'The platform will convert your final answer into a ready-to-open Word DOCX file.',
    'Return the full final work as clean structured text only.',
    'Do not return base64, data URLs, binary payloads, JSON file wrappers, or code fences.',
    'Use headings, paragraphs, lists, and bibliography sections when required.'
  ].join('\n')
}

export function buildLlmPayload(order) {
  const req = order.frozen_requirements || {}
  const reqLines = buildRequirementLines(order, req)
  return [
    'Service type: ' + order.service_type,
    'client requirements:',
    reqLines || '- no data'
  ].join('\n')
}

function buildRequirementLines(order, req) {
  const offer = getOffer(order?.service_type)
  const labelByKey = new Map((offer?.fields || []).map((field) => [field.key, field.label]))
  const lines = Object.entries(req).map(([key, value]) => {
    const label = labelByKey.get(key) || key.replaceAll('_', ' ')
    return `- ${label}: ${value}`
  })
  return lines.length ? lines.join('\n') : '- no data'
}

export async function pingLlm() {
  ensureLlmConfigured()
  const reply = await callLlm({
    systemPrompt: 'Reply briefly: API is available.',
    userPrompt: 'Write exactly: OK',
    maxTokens: 16
  })
  return String(reply || '').trim()
}

async function callLlm({ order, systemPrompt, userPrompt, maxTokens }) {
  const mode = getTransportMode()
  const model = getModelForOrder(order)
  const serviceType = order?.service_type || ''
  if (mode === 'relay') {
    return callLlmViaRelay({ systemPrompt, userPrompt, maxTokens, model, serviceType })
  }

  return callLlmDirect({ systemPrompt, userPrompt, maxTokens, model })
}

function getModelForOrder(order) {
  return order?.service_type === SERVICE_PRESENTATION
    ? APP_CONFIG.apiPresentationModel
    : APP_CONFIG.apiModel
}

async function callLlmViaRelay({ systemPrompt, userPrompt, maxTokens, model, serviceType }) {
  const response = await fetchWithRetry(APP_CONFIG.relayPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemPrompt,
      userPrompt,
      maxTokens,
      model,
      serviceType,
      apiMode: APP_CONFIG.apiMode
    })
  })

  if (!response.ok) {
    const details = await safeReadError(response)
    throw new Error(`LLM relay error ${response.status}: ${details}`)
  }

  const data = await response.json()
  const text = extractLlmText(data)
  if (!text) {
    throw new Error('LLM relay returned empty text.')
  }
  return text
}

async function callLlmDirect({ systemPrompt, userPrompt, maxTokens, model }) {
  const headers = {
    Authorization: `Bearer ${APP_CONFIG.apiKey}`,
    'Content-Type': 'application/json'
  }
  // Keep browser calls CORS-safe: API allows `client_id`, but can reject custom headers like X-Title/HTTP-Referer.
  if (APP_CONFIG.apiClientId) {
    headers.client_id = APP_CONFIG.apiClientId
  }

  const mode = APP_CONFIG.apiMode.toLowerCase()
  let body
  if (mode === 'responses') {
    body = {
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_output_tokens: maxTokens
    }
  } else {
    body = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: maxTokens
    }
  }

  const response = await fetchWithRetry(APP_CONFIG.apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const details = await safeReadError(response)
    throw new Error(`LLM API error ${response.status}: ${details}`)
  }

  const data = await response.json()
  const text = extractLlmText(data)
  if (!text) {
    throw new Error('LLM API returned empty text.')
  }
  return text
}

async function fetchWithRetry(url, options) {
  const retries = Math.max(0, APP_CONFIG.requestRetries)
  let attempt = 0
  let lastError = null

  while (attempt <= retries) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), APP_CONFIG.requestTimeoutMs)
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      })
      clearTimeout(timer)
      if (response.ok) {
        return response
      }
      const details = await safeReadError(response)
      const message = `LLM API error ${response.status}: ${details}`
      if (!isRetryableStatus(response.status) || attempt === retries) {
        throw new Error(message)
      }
      lastError = new Error(message)
    } catch (error) {
      clearTimeout(timer)
      const text = String(error?.message || '')
      if (!isRetryableError(error) || attempt === retries) {
        if (text.toLowerCase().includes('abort')) {
          throw new Error(`LLM API timeout after ${APP_CONFIG.requestTimeoutMs}ms`)
        }
        throw error
      }
      lastError = error
    }

    attempt += 1
    await sleep(700 * attempt)
  }

  throw lastError || new Error('LLM request failed after retries.')
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500
}

function isRetryableError(error) {
  if (!error) {
    return false
  }
  const text = String(error.message || '').toLowerCase()
  return text.includes('failed to fetch') || text.includes('network') || text.includes('timeout') || text.includes('abort')
}

async function safeReadError(response) {
  try {
    const data = await response.json()
    if (typeof data?.error?.message === 'string') {
      return data.error.message
    }
    if (typeof data?.message === 'string') {
      return data.message
    }
    if (typeof data?.details === 'string') {
      return data.details
    }
    return JSON.stringify(data)
  } catch {
    try {
      return await response.text()
    } catch {
      return 'unknown error'
    }
  }
}

function extractLlmText(data) {
  const directText = firstNonEmptyText([
    data?.text,
    data?.output_text,
    data?.response?.output_text,
    data?.message?.content
  ])
  if (directText) {
    return directText
  }

  const firstChoice = data?.choices?.[0]?.message?.content
  const fromChoice = extractTextFromUnknown(firstChoice)
  if (fromChoice) {
    return fromChoice
  }

  const fromChoicesArray = extractTextFromUnknown(data?.choices)
  if (fromChoicesArray) {
    return fromChoicesArray
  }

  const fromOutput = extractTextFromUnknown(data?.output)
  if (fromOutput) {
    return fromOutput
  }

  const fromMessages = extractTextFromUnknown(data?.messages)
  if (fromMessages) {
    return fromMessages
  }

  return ''
}

function firstNonEmptyText(values) {
  for (const value of values) {
    if (typeof value === 'string' && value.length > 0) {
      return value
    }
  }
  return ''
}

function extractTextFromUnknown(value) {
  if (!value) {
    return ''
  }

  if (typeof value === 'string') {
    return value
  }

  if (Array.isArray(value)) {
    const merged = value.map((item) => extractTextFromUnknown(item)).filter(Boolean).join('')
    return merged
  }

  if (typeof value === 'object') {
    const direct = firstNonEmptyText([
      value.text,
      value.content,
      value.output_text,
      value.message,
      value.value,
      value.arguments
    ])
    if (direct) {
      return direct
    }

    const nested = [
      value.message?.content,
      value.delta,
      value.output,
      value.content,
      value.parts,
      value.items,
      value.messages,
      value.choices
    ]

    for (const item of nested) {
      const text = extractTextFromUnknown(item)
      if (text) {
        return text
      }
    }
  }

  return ''
}
