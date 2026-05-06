import { LLM_CHANNEL_RULE, LLM_GLOBAL_QUALITY_RULES, SERVICE_PRESENTATION, SERVICE_REFERAT } from './catalog'

export const APP_CONFIG = {
  revisionLimit: 7,
  revisionWindowHours: 48,
  modelMainName: 'GPT-5.4',
  modelRevisionName: 'GPT-5.4-mini',
  mockGenerationDelayMs: 1800,
  testMode: true
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export async function generateInitial(order) {
  await sleep(APP_CONFIG.mockGenerationDelayMs)
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
