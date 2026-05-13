import { LLM_CHANNEL_RULE, LLM_GLOBAL_QUALITY_RULES, SERVICE_REFERAT, getOffer } from './catalog'

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
  const reqLines = buildRequirementLines(order, req)

  if (order?.service_type === SERVICE_REFERAT) {
    return [
      'Твоя задача — сделать мне реферат так, чтобы он выглядел как качественно выполненный студентом, соответствовал заданию, был логичным, аккуратно оформленным и не содержал фактических ошибок.',
      'А так же сразу присылай готовый ворд документ, который откроется на любом устройстве, даже мобильном.',
      '',
      'В самой работе Формат ответа (обязательно):',
      '- Выводи только финальный материал без пояснений, рассуждений и служебных фраз.',
      '- Не добавляй префиксы вроде "Вот результат", "Ниже файл", "Комментарий".',
      '- Не задавай встречных вопросов в финальном ответе.',
      '',
      'Тип работы: referat',
      'Требования клиента:',
      reqLines || '- Нет данных',
      '',
      'Работай по следующим правилам:',
      '',
      '1. Сначала внимательно проанализируй тему, цель, задачи, формат работы и все требования.',
      '2. Если я прикрепил методичку, образец, критерии, план, файл преподавателя или пример оформления — опирайся на них в первую очередь и никогда не уклоняйся от поставленных правил.',
      '3. Ничего не придумывай как факт, если ты не уверен. В спорных местах:',
      '- явно указывай, что момент требует проверки;',
      '- не выдавай сомнительную информацию за точную.',
      '4. Пиши не шаблонно, а естественно, связно и по-студенчески грамотно, но на хорошем уровне.',
      '5. Избегай воды, тавтологии, слишком общих фраз и пустых абзацев.',
      '6. Делай текст содержательным: с анализом, причинно-следственными связями, выводами и логическими переходами.',
      '8. Если тема историческая, юридическая, экономическая, социальная или научная — уделяй особое внимание точности формулировок.',
      '',
      'Требования к качеству текста:',
      '- логичная структура;',
      '- академический, но живой язык;',
      '- точные формулировки;',
      '- отсутствие явных штампов нейросети;',
      '- отсутствие противоречий между разделами;',
      '- каждый раздел должен работать на общую цель;',
      '- выводы должны вытекать из основного текста, а не быть формальными.',
      '',
      'Очень важно:',
      '- не сокращай качество ради скорости;',
      '- если формулировка темы неудачная — предложи 2-3 более сильных варианта;',
      '- если требования неполные — сделай наиболее академически правильный вариант;',
      '- если есть риск, что преподаватель заметит шаблонность, перепиши текст более естественно и убедительно.'
    ].join('\n')
  }

  const commonOutputRule = [
    'Формат ответа (обязательно):',
    '- Выводи только финальный материал без пояснений, рассуждений и служебных фраз.',
    '- Не добавляй префиксы вроде "Вот результат", "Ниже файл", "Комментарий".',
    '- Не задавай встречных вопросов в финальном ответе.'
  ].join('\n')

  const presentationOutputRule =
    order.service_type === 'presentation'
      ? [
          '',
          'Дополнительное правило для презентации:',
          '- Сформируй результат как готовый текст презентации по слайдам (Слайд 1, Слайд 2, ...),',
          '- для каждого слайда: заголовок и 3-6 кратких пунктов, без лишних пояснений вне слайдов.'
        ].join('\n')
      : ''

  return `${LLM_CHANNEL_RULE}\n\n${LLM_GLOBAL_QUALITY_RULES}\n\nТип работы: ${order.service_type}\nТребования клиента:\n${reqLines}\n\n${commonOutputRule}${presentationOutputRule}`
}

function buildRequirementLines(order, req) {
  const offer = getOffer(order?.service_type)
  const labelByKey = new Map((offer?.fields || []).map((field) => [field.key, field.label]))
  const lines = Object.entries(req).map(([key, value]) => {
    const label = labelByKey.get(key) || key.replaceAll('_', ' ')
    return `- ${label}: ${value}`
  })
  return lines.length ? lines.join('\n') : '- Нет данных'
}

export async function pingLlm() {
  ensureLlmConfigured()
  const reply = await callLlm({
    systemPrompt: 'Ответь коротко: API доступен.',
    userPrompt: 'Напиши строго: OK',
    maxTokens: 16
  })
  return String(reply || '').trim()
}

async function callLlm({ systemPrompt, userPrompt, maxTokens }) {
  const mode = getTransportMode()
  if (mode === 'relay') {
    return callLlmViaRelay({ systemPrompt, userPrompt, maxTokens })
  }

  return callLlmDirect({ systemPrompt, userPrompt, maxTokens })
}

async function callLlmViaRelay({ systemPrompt, userPrompt, maxTokens }) {
  const response = await fetchWithRetry(APP_CONFIG.relayPath, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      systemPrompt,
      userPrompt,
      maxTokens,
      model: APP_CONFIG.apiModel,
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

async function callLlmDirect({ systemPrompt, userPrompt, maxTokens }) {
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
  if (typeof data?.text === 'string' && data.text.trim()) {
    return data.text.trim()
  }
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
