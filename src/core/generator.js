import { LLM_CHANNEL_RULE, LLM_GLOBAL_QUALITY_RULES, SERVICE_PRESENTATION, SERVICE_REFERAT } from './catalog'

const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : {}

function boolFromEnv(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback
  }
  const normalized = String(value).trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  return fallback
}

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
  mockGenerationDelayMs: Number.parseInt(normalized(env.VITE_LLM_DELAY_MS, '1800'), 10) || 1800,
  apiKey: normalized(env.VITE_LLM_API_KEY),
  apiUrl: normalized(env.VITE_LLM_API_URL, 'https://polza.ai/api/v1/chat/completions'),
  apiMode: normalized(env.VITE_LLM_API_MODE, 'chat_completions'),
  apiModel: normalized(env.VITE_LLM_MODEL, 'openai/gpt-5.4'),
  apiReferer: normalized(env.VITE_LLM_HTTP_REFERER),
  apiTitle: normalized(env.VITE_LLM_APP_TITLE, 'tg-bot-vue')
}

// Safety fallback:
// if VITE_LLM_TEST_MODE is missing/broken but API key exists, default to live mode.
APP_CONFIG.testMode = boolFromEnv(env.VITE_LLM_TEST_MODE, !APP_CONFIG.apiKey)

function canUseLiveApi() {
  return !APP_CONFIG.testMode && Boolean(APP_CONFIG.apiKey) && Boolean(APP_CONFIG.apiUrl) && Boolean(APP_CONFIG.apiModel)
}

export async function generateInitial(order) {
  await sleep(APP_CONFIG.mockGenerationDelayMs)
  if (canUseLiveApi()) {
    return generateInitialWithLlm(order)
  }
  if (APP_CONFIG.testMode) {
    return generateTestStub(order)
  }
  if (order.service_type === SERVICE_REFERAT) {
    return generateReferat(order)
  }
  if (order.service_type === SERVICE_PRESENTATION) {
    return generatePresentation(order)
  }
  return generateGeneric(order)
}

export async function applyRevision(order, requestText) {
  await sleep(Math.max(900, Math.round(APP_CONFIG.mockGenerationDelayMs * 0.6)))
  if (canUseLiveApi()) {
    return applyRevisionWithLlm(order, requestText)
  }
  if (APP_CONFIG.testMode) {
    const base = order.result_text || generateTestStub(order)
    const stamp = new Date().toISOString()
    return `${base}\n\n========================================\nTEST MODE: правка применена\nВремя: ${stamp}\nЗапрос правки: ${requestText}\n`
  }
  const currentText = order.result_text || ''
  const stamp = new Date().toISOString()
  return `${currentText}\n\n========================================\nОбновление версии (mini: ${APP_CONFIG.modelRevisionName})\nВремя: ${stamp}\nЗапрос правки: ${requestText}\nСтатус: изменения внесены в текущую версию.\n`
}

export function buildLlmPayload(order) {
  const req = order.frozen_requirements || {}
  const reqLines = Object.entries(req)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n')
  return `${LLM_CHANNEL_RULE}\n\n${LLM_GLOBAL_QUALITY_RULES}\n\nТип работы: ${order.service_type}\nТребования клиента:\n${reqLines}`
}

async function generateInitialWithLlm(order) {
  const prompt = buildLlmPayload(order)
  return callLlm({
    systemPrompt: 'Сгенерируй итоговую учебную работу по требованиям клиента.',
    userPrompt: prompt,
    maxTokens: 7000
  })
}

async function applyRevisionWithLlm(order, requestText) {
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

function generateReferat(order) {
  const req = order.frozen_requirements || {}
  const stamp = new Date().toISOString()
  return (
    'РЕФЕРАТ\n' +
    `Тема: ${req.topic || '—'}\n` +
    `Предмет: ${req.subject || '—'}\n` +
    `Уровень: ${req.level || '—'}\n` +
    `Объем: ${req.volume || '—'}\n\n` +
    `Модель генерации: ${APP_CONFIG.modelMainName}\n` +
    `Дата генерации: ${stamp}\n\n` +
    '1. Введение\nКратко раскрывается актуальность темы и цель работы.\n\n' +
    '2. Основная часть\nЛогичный разбор темы с делением на подпункты.\n\n' +
    '3. Заключение\nИтоги и выводы по теме.\n\n' +
    '4. Список литературы\nФормируется по требованиям заказа.\n\n' +
    'Примечание: это тестовая заготовка. После подключения реального LLM API здесь будет полноценный контент.'
  )
}

function generatePresentation(order) {
  const req = order.frozen_requirements || {}
  const slidesCount = req.slides_count || '12'
  const stamp = new Date().toISOString()
  return (
    'ПРЕЗЕНТАЦИЯ\n' +
    `Тема: ${req.topic || '—'}\n` +
    `Предмет: ${req.subject || '—'}\n` +
    `Слайды: ${slidesCount}\n` +
    `Стиль: ${req.style || '—'}\n\n` +
    `Модель генерации: ${APP_CONFIG.modelMainName}\n` +
    `Дата генерации: ${stamp}\n\n` +
    'Структура слайдов:\n' +
    '1. Титульный\n2. Актуальность темы\n3. Цель и задачи\n4-8. Основные блоки содержания\n9-10. Примеры / кейсы\n11. Выводы\n12. Итоговый слайд\n\n' +
    'Примечание: это тестовая заготовка. После подключения реального LLM API здесь будет полноценный материал.'
  )
}

function generateGeneric(order) {
  const req = order.frozen_requirements || {}
  return `ЗАКАЗ №${order.id}\nТип: ${order.service_type}\nТема: ${req.topic || '—'}\n\nМодель генерации: ${APP_CONFIG.modelMainName}\nТестовая версия результата.`
}

function generateTestStub(order) {
  const req = order.frozen_requirements || {}
  return (
    'TEST MODE RESULT\n' +
    `Заказ №${order.id || '—'}\n` +
    `Тип: ${order.service_type || '—'}\n` +
    `Тема: ${req.topic || '—'}\n` +
    `Предмет: ${req.subject || '—'}\n\n` +
    'Это непустая заглушка результата для безопасного прогона флоу.\n' +
    'Подключите реальный LLM-генератор для боевого контента.'
  )
}
