import { LLM_CHANNEL_RULE, LLM_GLOBAL_QUALITY_RULES } from './catalog'

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
  apiKey: normalized(env.VITE_LLM_API_KEY),
  apiUrl: normalized(env.VITE_LLM_API_URL, 'https://polza.ai/api/v1/chat/completions'),
  apiMode: normalized(env.VITE_LLM_API_MODE, 'chat_completions'),
  apiModel: normalized(env.VITE_LLM_MODEL, 'openai/gpt-5.4'),
  apiReferer: normalized(env.VITE_LLM_HTTP_REFERER),
  apiTitle: normalized(env.VITE_LLM_APP_TITLE, 'tg-bot-vue')
}

function ensureLlmConfigured() {
  if (!APP_CONFIG.apiKey) {
    throw new Error('LLM API key is missing. Set VITE_LLM_API_KEY in .env.local')
  }
  if (!APP_CONFIG.apiUrl) {
    throw new Error('LLM API URL is missing. Set VITE_LLM_API_URL in .env.local')
  }
  if (!APP_CONFIG.apiModel) {
    throw new Error('LLM model is missing. Set VITE_LLM_MODEL in .env.local')
  }
}

export async function generateInitial(order) {
  ensureLlmConfigured()
  await sleep(APP_CONFIG.requestDelayMs)
  const prompt = buildLlmPayload(order)
  return callLlm({
    systemPrompt: 'Сгенерируй итоговую учебную работу по требованиям клиента.',
    userPrompt: prompt,
    maxTokens: 7000
  })
}

export async function applyRevision(order, requestText) {
  ensureLlmConfigured()
  await sleep(Math.max(500, Math.round(APP_CONFIG.requestDelayMs * 0.7)))

  const prompt = buildLlmPayload(order)
  const previous = String(order.result_text || '').trim()
  const userPrompt = [
    prompt,
    '',
    'Текущая версия работы:',
    previous || 'Пусто.',
    '',
    `Запрос правки клиента: ${requestText}`,
    'Обнови работу целиком с учетом запроса правки.'
  ].join('\n')

  return callLlm({
    systemPrompt: 'Обнови существующую учебную работу согласно запросу правки клиента.',
    userPrompt,
    maxTokens: 7000
  })
}

export function buildLlmPayload(order) {
  const req = order.frozen_requirements || {}
  const reqLines = Object.entries(req)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')
  return `${LLM_CHANNEL_RULE}\n\n${LLM_GLOBAL_QUALITY_RULES}\n\nТип работы: ${order.service_type}\nТребования клиента:\n${reqLines}`
}

async function callLlm({ systemPrompt, userPrompt, maxTokens }) {
  const headers = {
    Authorization: `Bearer ${APP_CONFIG.apiKey}`,
    'Content-Type': 'application/json'
  }
  if (APP_CONFIG.apiReferer) {
    headers['HTTP-Referer'] = APP_CONFIG.apiReferer
  }
  if (APP_CONFIG.apiTitle) {
    headers['X-Title'] = APP_CONFIG.apiTitle
  }

  const mode = APP_CONFIG.apiMode.toLowerCase()
  let body
  if (mode === 'responses') {
    body = {
      model: APP_CONFIG.apiModel,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_output_tokens: maxTokens
    }
  } else {
    body = {
      model: APP_CONFIG.apiModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3,
      max_tokens: maxTokens
    }
  }

  const response = await fetch(APP_CONFIG.apiUrl, {
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

async function safeReadError(response) {
  try {
    const data = await response.json()
    if (typeof data?.error?.message === 'string') {
      return data.error.message
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
  if (typeof data?.output_text === 'string' && data.output_text.trim()) {
    return data.output_text.trim()
  }

  const firstChoice = data?.choices?.[0]?.message?.content
  if (typeof firstChoice === 'string' && firstChoice.trim()) {
    return firstChoice.trim()
  }

  if (Array.isArray(firstChoice)) {
    const merged = firstChoice
      .map((part) => {
        if (typeof part === 'string') {
          return part
        }
        if (typeof part?.text === 'string') {
          return part.text
        }
        if (typeof part?.content === 'string') {
          return part.content
        }
        return ''
      })
      .join('')
      .trim()
    if (merged) {
      return merged
    }
  }

  if (Array.isArray(data?.output)) {
    const fromOutput = data.output
      .flatMap((item) => item?.content || [])
      .map((contentItem) => contentItem?.text || '')
      .join('')
      .trim()
    if (fromOutput) {
      return fromOutput
    }
  }

  return ''
}
