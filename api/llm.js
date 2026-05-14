function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', (chunk) => {
      raw += chunk
      if (raw.length > 2_000_000) {
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
    return value.map((item) => extractTextFromUnknown(item)).filter(Boolean).join('')
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

async function safeReadError(response) {
  try {
    const data = await response.json()
    if (typeof data?.error?.message === 'string') {
      return data.error.message
    }
    if (typeof data?.message === 'string') {
      return data.message
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

  const apiKey = String(process.env.LLM_API_KEY || process.env.VITE_LLM_API_KEY || '').trim()
  const apiUrl = String(process.env.LLM_API_URL || process.env.VITE_LLM_API_URL || 'https://polza.ai/api/v1/chat/completions').trim()
  const apiMode = String(process.env.LLM_API_MODE || process.env.VITE_LLM_API_MODE || 'chat_completions').trim().toLowerCase()
  const fallbackModel = String(process.env.LLM_MODEL || process.env.VITE_LLM_MODEL || 'openai/gpt-5.4').trim()
  const clientId = String(process.env.LLM_CLIENT_ID || process.env.VITE_LLM_CLIENT_ID || 'tg-bot-vue').trim()

  if (!apiKey) {
    sendJson(res, 500, { error: 'LLM_API_KEY is missing in Vercel environment.' })
    return
  }
  if (!apiUrl) {
    sendJson(res, 500, { error: 'LLM_API_URL is missing in Vercel environment.' })
    return
  }

  let body
  try {
    body = await readBody(req)
  } catch (error) {
    sendJson(res, 400, { error: String(error?.message || 'Invalid request body') })
    return
  }

  const systemPrompt = String(body?.systemPrompt || '').trim()
  const userPrompt = String(body?.userPrompt || '').trim()
  const maxTokens = Number.parseInt(String(body?.maxTokens || '7000'), 10) || 7000
  const model = String(body?.model || fallbackModel).trim() || fallbackModel
  const requestMode = String(body?.apiMode || apiMode).trim().toLowerCase()

  if (!systemPrompt || !userPrompt) {
    sendJson(res, 400, { error: 'systemPrompt and userPrompt are required.' })
    return
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    client_id: clientId
  }

  const payload =
    requestMode === 'responses'
      ? {
          model,
          input: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          max_output_tokens: maxTokens
        }
      : {
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: 0.3,
          max_tokens: maxTokens
        }

  let response
  try {
    response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    })
  } catch (error) {
    sendJson(res, 502, { error: `Network error: ${String(error?.message || error)}` })
    return
  }

  if (!response.ok) {
    const details = await safeReadError(response)
    sendJson(res, response.status, { error: `Provider error ${response.status}: ${details}` })
    return
  }

  const providerData = await response.json()
  const text = extractLlmText(providerData)
  if (!text) {
    sendJson(res, 502, { error: 'Provider returned empty text.' })
    return
  }

  sendJson(res, 200, {
    ok: true,
    text
  })
}
