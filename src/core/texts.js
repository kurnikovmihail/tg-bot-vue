import { FIELD_VALUE_LABELS, STATUS_LABELS, getFieldLabelValue, getOffer, getServiceMenuItems } from './catalog'
import { publicOrderNo } from './orderNumbers'
import { hasVolumePricing } from './pricing'

export const MENU_CREATE_ORDER = '📝 Сделать заказ'
export const MENU_MY_ORDERS = '📂 Мои заказы'
export const MENU_HELP = 'ℹ️ Помощь и правила'
export const MENU_NEW_ORDER = '🆕 Новый заказ'
export const MENU_FEEDBACK = '💬 Оставить отзыв'

export const DEFAULT_PAYMENT_INSTRUCTIONS =
  'После подключения платежной системы здесь появится ссылка или реквизиты для оплаты.'

export function welcomeText() {
  return (
    '👋 Привет! Я бот, который помогает студентам быстро и понятно оформить учебную работу.\n\n' +
    'Что я делаю:\n' +
    '• собираю заказ по шагам без хаоса;\n' +
    '• фиксирую требования до старта;\n' +
    '• после оплаты запускаю работу автоматически;\n' +
    '• отправляю готовый результат в этот чат;\n' +
    '• даю до 7 правок по готовой версии.\n\n' +
    'Нажмите «📝 Сделать заказ», и начнем.'
  )
}

export function chooseServiceText() {
  const lines = getServiceMenuItems()
    .map(([serviceKey, label]) => {
      const offer = getOffer(serviceKey)
      const prefix = hasVolumePricing(serviceKey) ? 'от ' : ''
      return `• ${label} — ${prefix}${offer.priceRub} ₽`
    })
    .join('\n')
  return `🎯 Выберите формат работы:\n\n${lines}\n\nПосле выбора я проведу вас по вопросам и соберу точный бриф.`
}

export function rulesText() {
  return (
    '📌 Правила работы:\n\n' +
    '• Заказ запускается только после оплаты.\n' +
    '• После выдачи результата доступно до 7 правок.\n' +
    '• Правки — это доработка текущей версии (стиль, объем, отдельные блоки).\n' +
    '• Полная смена темы, предмета или типа работы — новый заказ.\n' +
    '• Окно правок ограничено по времени.\n\n' +
    '✅ Считается правкой:\n' +
    '• переписать часть текста;\n' +
    '• сократить или расширить фрагмент;\n' +
    '• изменить стиль;\n' +
    '• добавить или убрать блок;\n' +
    '• заменить отдельные слайды.\n\n' +
    '🆕 Считается новым заказом:\n' +
    '• полностью другая тема;\n' +
    '• другая дисциплина;\n' +
    '• другой тип работы;\n' +
    '• полная переработка с нуля.'
  )
}

export function offerCardText(serviceKey) {
  const offer = getOffer(serviceKey)
  const points = offer.descriptionPoints.map((point) => `• ${point}`).join('\n')
  const priceLine = `💳 Стоимость: ${hasVolumePricing(serviceKey) ? 'от ' : ''}${offer.priceRub} ₽`
  return `✨ ${offer.title}\n\nЧто входит:\n${points}\n\nОбъем и результат:\n${offer.scope}\n\nСроки:\n${offer.deadlineInfo}\n\n${priceLine}\n🔁 После сдачи доступно до 7 правок.`
}

export function draftCardText(serviceKey, formData, revisionLimit) {
  const offer = getOffer(serviceKey)
  const lines = ['🧾 Проверьте данные заказа:', `Услуга: ${offer.shortTitle}`]
  for (const field of offer.fields) {
    const raw = formData[field.key] ?? '—'
    lines.push(`${field.label}: ${getFieldLabelValue(raw)}`)
  }
  lines.push(`Правки после сдачи: до ${revisionLimit}`)
  lines.push('')
  lines.push('⚠️ Важно:')
  lines.push('• После оплаты возврат средств не предусмотрен.')
  lines.push('• Если возникнет проблема с выполнением заказа, напишите в поддержку — обязательно поможем с решением.')
  return lines.join('\n')
}

export function termsBeforePaymentText(revisionLimit) {
  return (
    '📎 Перед оплатой фиксируем условия:\n\n' +
    '• Заказ сразу уходит в работу после оплаты.\n' +
    '• После подтверждения оплаты заказ передается в разработку.\n' +
    '• Готовую работу отправлю сюда сразу по завершении.\n' +
    '• Если ответа нет более 2-3 часов, обратитесь в поддержку.\n' +
    `• После готовности доступно до ${revisionLimit} правок.\n` +
    '• Правки — это доработка текущей версии.\n' +
    '• Полная смена темы/предмета/типа работы — новый заказ.\n\n' +
    'Если всё верно, переходите к оплате.\n\n' +
    '⚠️ Важно:\n' +
    '• После оплаты возврат средств не предусмотрен.\n' +
    '• Если возникнет проблема с выполнением заказа, напишите в поддержку — обязательно поможем с решением.'
  )
}

export function paymentText(orderId, userId, priceRub, instructions = DEFAULT_PAYMENT_INSTRUCTIONS) {
  const publicNo = publicOrderNo(orderId, userId)
  return (
    `💳 Заказ ${publicNo} ожидает оплату.\n` +
    `Сумма: ${priceRub} ₽\n\n` +
    `${instructions}\n\n` +
    'После оплаты нажмите кнопку «✅ Я оплатил(а)».'
  )
}

export function orderAcceptedText(orderId, userId) {
  const publicNo = publicOrderNo(orderId, userId)
  return (
    `🚀 Заказ ${publicNo} передан в разработку.\n` +
    'Готовую работу отправлю сюда сразу по завершении.\n' +
    'Если ответа нет более 2-3 часов, обратитесь в поддержку.\n' +
    '📌 Сохраните номер заказа — он может пригодиться для обращения к администратору.'
  )
}

export function resultMessageText(order) {
  const remaining = Math.max(0, Number(order.revision_limit) - Number(order.revision_used))
  const publicNo = publicOrderNo(Number(order.id), Number(order.user_id))
  return `✅ Заказ ${publicNo} готов.\nСтатус: ${STATUS_LABELS[order.status] || order.status}\nОсталось правок: ${remaining} из ${order.revision_limit}`
}

export function revisionPromptText(remaining) {
  return (
    '✍️ Опишите правку одним сообщением.\n' +
    'Пример: сократить введение, сделать стиль официальнее, заменить 3-й слайд, добавить вывод.\n\n' +
    `Осталось правок: ${remaining}`
  )
}

export function revisionLimitExhaustedText(orderId, userId) {
  const publicNo = publicOrderNo(orderId, userId)
  return `⛔ Лимит правок исчерпан по заказу ${publicNo}.\nЗаказ завершен. Если нужна новая переработка, оформите новый заказ.`
}

export function orderCompletedText(orderId, userId) {
  const publicNo = publicOrderNo(orderId, userId)
  return `🎉 Заказ ${publicNo} завершен.\nСпасибо за доверие.`
}

export function myOrdersEmptyText() {
  return 'Пока нет заказов. Нажмите «📝 Сделать заказ», чтобы начать.\nℹ️ Заказы хранятся 72 часа, затем автоматически удаляются.'
}

export function orderShortRow(order) {
  const remaining = Math.max(0, Number(order.revision_limit) - Number(order.revision_used))
  const statusLabel = STATUS_LABELS[order.status] || order.status
  const publicNo = publicOrderNo(Number(order.id), Number(order.user_id))
  return `${publicNo} • ${order.service_title} • ${statusLabel} • правок: ${remaining}`
}

export function orderDetailsText(order) {
  const createdAt = new Date(order.created_at)
  const formatted = Number.isNaN(createdAt.getTime()) ? order.created_at : createdAt.toLocaleString('ru-RU')
  const remaining = Math.max(0, Number(order.revision_limit) - Number(order.revision_used))
  const publicNo = publicOrderNo(Number(order.id), Number(order.user_id))
  const lines = [
    `📦 Заказ: ${publicNo}`,
    `Услуга: ${order.service_title}`,
    `Статус: ${STATUS_LABELS[order.status] || order.status}`,
    `Создан: ${formatted}`,
    `Правок осталось: ${remaining} из ${order.revision_limit}`,
    '',
    'Требования:'
  ]
  for (const [key, value] of Object.entries(order.requirements || {})) {
    const label = key.replaceAll('_', ' ').replace(/^\w/, (char) => char.toUpperCase())
    lines.push(`• ${label}: ${getFieldLabelValue(String(value))}`)
  }
  return lines.join('\n')
}

export function isNewOrderChangeRequest(text) {
  const normalized = String(text || '').toLowerCase()
  const markers = [
    'другая тема',
    'новая тема',
    'поменяй тему полностью',
    'другой предмет',
    'другая дисциплина',
    'сделай презентацию вместо',
    'сделай реферат вместо',
    'с нуля',
    'полностью заново',
    'новый заказ'
  ]
  return markers.some((marker) => normalized.includes(marker))
}

export function choiceAliases() {
  return {
    yes: ['да', 'ага', 'нужно', 'надо', 'yes', 'y', '+'],
    no: ['нет', 'не', 'не нужно', 'no', 'n', '-'],
    strict: ['строгий', 'деловой', 'официальный'],
    visual: ['визуальный', 'творческий', 'красивый'],
    mixed: ['смешанный', 'комбинированный', 'сбалансированный']
  }
}

export function normalizeUserText(value) {
  let cleaned = String(value || '').trim().toLowerCase()
  for (const token of ['📝', '📘', '📊', '📂', 'ℹ️', '🆕', '💬', '✅', '❌', '🚀', '🔁', '🏠']) {
    cleaned = cleaned.replaceAll(token, '')
  }
  return cleaned.split(/\s+/).filter(Boolean).join(' ')
}

export function matchChoiceFromText(userText, choices) {
  const normalized = normalizeUserText(userText)
  if (!normalized) {
    return null
  }
  const aliases = choiceAliases()
  for (const [value] of choices) {
    const mapped = aliases[value] || []
    if (mapped.includes(normalized)) {
      return value
    }
  }
  for (const [value, label] of choices) {
    const labelNorm = normalizeUserText(label)
    if (normalized === labelNorm || labelNorm.includes(normalized)) {
      return value
    }
  }
  return null
}

export function formatFieldValue(value) {
  return FIELD_VALUE_LABELS[value] || value
}
