<script setup>
import mammoth from 'mammoth/mammoth.browser'
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import {
  ORDER_STATUS_AWAITING_PAYMENT,
  ORDER_STATUS_IN_PROGRESS,
  ORDER_STATUS_IN_REVISION,
  ORDER_STATUS_READY,
  SERVICE_PRESENTATION,
  SERVICE_REPORT,
  STATUS_LABELS,
  getOffer,
  getServiceMenuItems
} from '../core/catalog'
import { APP_CONFIG, applyRevision, generateInitial } from '../core/generator'
import { publicOrderNo } from '../core/orderNumbers'
import { calculateOrderPrice, hasVolumePricing } from '../core/pricing'
import { getOrCreateActiveUserId } from '../core/session'
import {
  applyRevisionResult,
  cancelOrder,
  closeOrder,
  createOrder,
  exportOrderResultAsFile,
  getOrderForUser,
  listUserOrders,
  markPaidAndStart,
  purgeExpiredOrders,
  saveFeedback,
  setInRevision,
  setOrderError,
  setReady,
  acceptOrder
} from '../core/storage'
import {
  DEFAULT_PAYMENT_INSTRUCTIONS,
  MENU_CREATE_ORDER,
  MENU_FEEDBACK,
  MENU_HELP,
  MENU_MY_ORDERS,
  MENU_NEW_ORDER,
  chooseServiceText,
  draftCardText,
  isNewOrderChangeRequest,
  matchChoiceFromText,
  myOrdersEmptyText,
  normalizeUserText,
  orderAcceptedText,
  orderCompletedText,
  orderDetailsText,
  orderShortRow,
  paymentText,
  resultMessageText,
  revisionLimitExhaustedText,
  revisionPromptText,
  rulesText,
  termsBeforePaymentText,
  welcomeText
} from '../core/texts'

const activeUserId = ref(0)
const route = useRoute()
const router = useRouter()
const screen = ref('menu')
const notice = reactive({
  text: '',
  type: 'info'
})
const busy = ref(false)

const selectedServiceKey = ref('')
const stepIndex = ref(0)
const formData = reactive({})
const answerInput = ref('')
const attachmentNotes = ref([])

const currentOrderId = ref(null)
const selectedOrder = ref(null)
const revisionInput = ref('')
const feedbackInput = ref('')
const myOrders = ref([])

let noticeTimer = null
let recoveryTimer = null
let recoveryInFlight = false

const serviceItems = computed(() =>
  getServiceMenuItems().map(([key, label]) => {
    const offer = getOffer(key)
    return {
      key,
      label,
      priceRub: offer.priceRub,
      hasFrom: hasVolumePricing(key),
      shortDescription: offer.scope
    }
  })
)

const selectedOffer = computed(() => (selectedServiceKey.value ? getOffer(selectedServiceKey.value) : null))

const currentField = computed(() => {
  if (!selectedOffer.value) {
    return null
  }
  return selectedOffer.value.fields[stepIndex.value] || null
})

const reviewText = computed(() => {
  if (!selectedServiceKey.value) {
    return ''
  }
  return draftCardText(selectedServiceKey.value, { ...formData }, APP_CONFIG.revisionLimit)
})

const termsText = computed(() => termsBeforePaymentText(APP_CONFIG.revisionLimit))

const paymentCardText = computed(() => {
  if (!selectedOrder.value) {
    return ''
  }
  return paymentText(
    Number(selectedOrder.value.id),
    Number(selectedOrder.value.user_id),
    Number(selectedOrder.value.price_rub),
    DEFAULT_PAYMENT_INSTRUCTIONS
  )
})

const currentOrderDetails = computed(() => {
  if (!selectedOrder.value) {
    return ''
  }
  return orderDetailsText(selectedOrder.value)
})

const revisionRemaining = computed(() => {
  if (!selectedOrder.value) {
    return 0
  }
  return Math.max(0, Number(selectedOrder.value.revision_limit) - Number(selectedOrder.value.revision_used))
})

const revisionPrompt = computed(() => revisionPromptText(revisionRemaining.value))
const currentResultRaw = computed(() => String(selectedOrder.value?.result_text || ''))
const hasResultText = computed(() => currentResultRaw.value.length > 0)
const currentResultText = computed(() => String(resultPreview.text || ''))
const resultPreview = reactive({
  status: 'idle',
  kind: 'none',
  filename: '',
  mimeType: '',
  objectUrl: '',
  docxHtml: '',
  text: '',
  error: '',
  blob: null,
  orderKey: ''
})
let resultPreviewUrlToken = ''
let resultPreviewRequestId = 0
const downloadResultButtonLabel = computed(() => {
  if (!selectedOrder.value) {
    return 'РЎРєР°С‡Р°С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚'
  }
  if (selectedOrder.value.service_type === SERVICE_PRESENTATION) {
    return 'РЎРєР°С‡Р°С‚СЊ РјР°С‚РµСЂРёР°Р» РїСЂРµР·РµРЅС‚Р°С†РёРё'
  }
  if (selectedOrder.value.service_type === SERVICE_REPORT) {
    return 'РЎРєР°С‡Р°С‚СЊ С‚РµРєСЃС‚ РґРѕРєР»Р°РґР°'
  }
  return 'РЎРєР°С‡Р°С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚'
})
const canDownloadCurrentResult = computed(() => {
  return (
    hasResultText.value &&
    [ORDER_STATUS_READY, ORDER_STATUS_IN_REVISION, ORDER_STATUS_COMPLETED].includes(selectedOrder.value?.status) &&
    resultPreview.orderKey === currentOrderPreviewKey(selectedOrder.value) &&
    resultPreview.status === 'ready' &&
    Boolean(resultPreview.blob) &&
    Boolean(resultPreview.filename)
  )
})

const promptHintText = computed(() => {
  if (!currentField.value) {
    return ''
  }
  if (currentField.value.inputType === 'attachments') {
    return (
      'РњРѕР¶РЅРѕ РѕС‚РїСЂР°РІРёС‚СЊ С‚РµРєСЃС‚, РґРѕРєСѓРјРµРЅС‚ РёР»Рё СЃРєСЂРёРЅС€РѕС‚.\n' +
      'Р•СЃР»Рё РЅРµ Р·РЅР°РµС‚Рµ, РЅР°РїРёС€РёС‚Рµ: В«РЅР° С‚РІРѕРµ СѓСЃРјРѕС‚СЂРµРЅРёРµВ».\n' +
      'РљРѕРіРґР° Р·Р°РєРѕРЅС‡РёС‚Рµ РїСЂРёРєСЂРµРїР»СЏС‚СЊ РјР°С‚РµСЂРёР°Р»С‹, РѕС‚РїСЂР°РІСЊС‚Рµ В«РіРѕС‚РѕРІРѕВ» РёР»Рё РЅР°РїРёС€РёС‚Рµ РєРѕРјРјРµРЅС‚Р°СЂРёР№.'
    )
  }
  if (currentField.value.inputType === 'choice') {
    return 'РњРѕР¶РЅРѕ РЅР°Р¶Р°С‚СЊ РєРЅРѕРїРєСѓ РёР»Рё РЅР°РїРёСЃР°С‚СЊ РѕС‚РІРµС‚ С‚РµРєСЃС‚РѕРј.'
  }
  return 'Р•СЃР»Рё РЅРµ Р·РЅР°РµС‚Рµ, РЅР°РїРёС€РёС‚Рµ: В«РЅР° С‚РІРѕРµ СѓСЃРјРѕС‚СЂРµРЅРёРµВ».\nРћС‚РїСЂР°РІСЊС‚Рµ РѕС‚РІРµС‚ РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј.'
})

const currentStepPrompt = computed(() => {
  if (!selectedOffer.value || !currentField.value) {
    return ''
  }
  return `РЁР°Рі ${stepIndex.value + 1}/${selectedOffer.value.fields.length}\n${currentField.value.prompt}`
})

function showNotice(text, type = 'info') {
  notice.text = text
  notice.type = type
  if (noticeTimer) {
    window.clearTimeout(noticeTimer)
  }
  noticeTimer = window.setTimeout(() => {
    notice.text = ''
  }, 5000)
}

function extractErrorMessage(error) {
  if (!error) {
    return 'РќРµРёР·РІРµСЃС‚РЅР°СЏ С‚РµС…РЅРёС‡РµСЃРєР°СЏ РѕС€РёР±РєР°.'
  }
  const raw = String(error.message || error || '').trim()
  if (!raw) {
    return 'РќРµРёР·РІРµСЃС‚РЅР°СЏ С‚РµС…РЅРёС‡РµСЃРєР°СЏ РѕС€РёР±РєР°.'
  }
  return raw.length > 220 ? `${raw.slice(0, 217)}...` : raw
}

function currentOrderPreviewKey(order) {
  if (!order) {
    return ''
  }
  return [
    Number(order.id || 0),
    Number(order.result_version || 0),
    String(order.updated_at || ''),
    String(order.result_text || '').length
  ].join(':')
}

function resetResultPreview() {
  if (resultPreviewUrlToken) {
    window.URL.revokeObjectURL(resultPreviewUrlToken)
    resultPreviewUrlToken = ''
  }
  resultPreview.status = 'idle'
  resultPreview.kind = 'none'
  resultPreview.filename = ''
  resultPreview.mimeType = ''
  resultPreview.objectUrl = ''
  resultPreview.docxHtml = ''
  resultPreview.text = ''
  resultPreview.error = ''
  resultPreview.blob = null
  resultPreview.orderKey = ''
}

async function syncResultPreviewFromOrder(order) {
  const requestId = ++resultPreviewRequestId
  const previewKey = currentOrderPreviewKey(order)
  resetResultPreview()
  if (!order) {
    return
  }

  resultPreview.status = 'loading'
  resultPreview.text = String(order.result_text || '')

  let inspected
  try {
    inspected = await exportOrderResultAsFile(order)
  } catch (error) {
    if (requestId !== resultPreviewRequestId) {
      return
    }
    resultPreview.status = 'error'
    resultPreview.kind = 'text'
    resultPreview.error = `РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґРіРѕС‚РѕРІРёС‚СЊ С„Р°Р№Р» РґР»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ: ${extractErrorMessage(error)}`
    return
  }

  if (requestId !== resultPreviewRequestId) {
    return
  }

  resultPreview.blob = inspected.blob
  resultPreview.filename = inspected.filename
  resultPreview.mimeType = String(inspected.blob?.type || '').toLowerCase()
  resultPreview.orderKey = previewKey

  if (resultPreview.mimeType.includes('application/pdf')) {
    resultPreview.kind = 'pdf'
    resultPreviewUrlToken = window.URL.createObjectURL(resultPreview.blob)
    resultPreview.objectUrl = resultPreviewUrlToken
    resultPreview.status = 'ready'
    return
  }

  if (
    resultPreview.mimeType.includes('officedocument.wordprocessingml.document') ||
    resultPreview.filename.toLowerCase().endsWith('.docx')
  ) {
    try {
      const arrayBuffer = await resultPreview.blob.arrayBuffer()
      const converted = await mammoth.convertToHtml({ arrayBuffer })
      if (requestId !== resultPreviewRequestId) {
        return
      }
      resultPreview.kind = 'docx'
      resultPreview.docxHtml = converted.value || ''
      resultPreview.status = 'ready'
      return
    } catch (error) {
      if (requestId !== resultPreviewRequestId) {
        return
      }
      resultPreview.kind = 'file'
      resultPreview.error = `РќРµ СѓРґР°Р»РѕСЃСЊ РѕС‚СЂРёСЃРѕРІР°С‚СЊ DOCX РІ Р±СЂР°СѓР·РµСЂРµ: ${extractErrorMessage(error)}`
      resultPreview.status = 'ready'
      return
    }
  }

  resultPreview.kind = 'file'
  resultPreview.status = 'ready'
}

function resetDraft(keepService = false) {
  if (!keepService) {
    selectedServiceKey.value = ''
  }
  stepIndex.value = 0
  answerInput.value = ''
  attachmentNotes.value = []
  for (const key of Object.keys(formData)) {
    delete formData[key]
  }
}

function refreshMyOrders() {
  myOrders.value = listUserOrders(activeUserId.value, 15)
}

async function recoverInProgressOrders() {
  if (recoveryInFlight || !activeUserId.value) {
    return
  }
  recoveryInFlight = true
  try {
    const candidates = listUserOrders(activeUserId.value, 50)
      .filter((order) => order.status === ORDER_STATUS_IN_PROGRESS)
      .sort((a, b) => Number(a.id) - Number(b.id))

    for (const order of candidates) {
      const fresh = getOrderForUser(order.id, activeUserId.value)
      if (!fresh || fresh.status !== ORDER_STATUS_IN_PROGRESS) {
        continue
      }
      try {
        const generated = await generateInitial(fresh)
        await ensurePresentationFileBuilt(fresh, generated)
        setReady(Number(fresh.id), generated, APP_CONFIG.revisionWindowHours)
      } catch (error) {
        setOrderError(Number(fresh.id), extractErrorMessage(error))
      }
    }
  } finally {
    recoveryInFlight = false
  }
}

async function ensurePresentationFileBuilt(order, resultText) {
  if (order?.service_type !== SERVICE_PRESENTATION) {
    return
  }
  await exportOrderResultAsFile({
    ...order,
    result_text: String(resultText || '')
  })
}

function scheduleRecoveryLoop() {
  if (recoveryTimer) {
    window.clearInterval(recoveryTimer)
  }
  recoveryTimer = window.setInterval(() => {
    recoverInProgressOrders().finally(() => {
      refreshMyOrders()
      refreshCurrentOrder()
    })
  }, 45_000)
}

function handleVisibilityResume() {
  if (document.visibilityState !== 'visible') {
    return
  }
  recoverInProgressOrders().finally(() => {
    refreshMyOrders()
    refreshCurrentOrder()
  })
}

function goMenu() {
  refreshMyOrders()
  screen.value = 'menu'
}

function goHelp() {
  screen.value = 'help'
}

function goFeedback() {
  feedbackInput.value = ''
  screen.value = 'feedback'
}

function goServicePicker() {
  resetDraft()
  screen.value = 'service-picker'
}

function openMyOrders() {
  refreshMyOrders()
  screen.value = 'orders'
}

function startDraft(serviceKey) {
  selectedServiceKey.value = serviceKey
  stepIndex.value = 0
  answerInput.value = ''
  attachmentNotes.value = []
  for (const key of Object.keys(formData)) {
    delete formData[key]
  }
  screen.value = 'draft'
}

function pushStep() {
  stepIndex.value += 1
  answerInput.value = ''
  attachmentNotes.value = []
  if (!selectedOffer.value || stepIndex.value >= selectedOffer.value.fields.length) {
    screen.value = 'draft-review'
  }
}

function selectChoice(value) {
  if (!currentField.value) {
    return
  }
  formData[currentField.value.key] = value
  pushStep()
}

function handleFileAttach(event) {
  const files = Array.from(event.target.files || [])
  for (const file of files) {
    const isImage = String(file.type || '').startsWith('image/')
    const title = isImage ? '[РЎРєСЂРёРЅС€РѕС‚]' : '[Р¤Р°Р№Р»]'
    attachmentNotes.value.push(`${title} ${file.name} (${Math.max(1, Math.round(file.size / 1024))} KB)`)
  }
  event.target.value = ''
}

function submitDraftAnswer() {
  if (!currentField.value) {
    return
  }
  const field = currentField.value

  if (field.inputType === 'choice') {
    const selected = matchChoiceFromText(answerInput.value, field.choices)
    if (!selected) {
      showNotice('Р”Р»СЏ СЌС‚РѕРіРѕ С€Р°РіР° РІС‹Р±РµСЂРёС‚Рµ РІР°СЂРёР°РЅС‚ РєРЅРѕРїРєРѕР№ РёР»Рё РЅР°РїРёС€РёС‚Рµ РѕС‚РІРµС‚ (РЅР°РїСЂРёРјРµСЂ: В«РґР°В», В«РЅРµС‚В», В«СЃС‚СЂРѕРіРёР№В»).', 'warn')
      return
    }
    formData[field.key] = selected
    pushStep()
    return
  }

  if (field.inputType === 'attachments') {
    const raw = answerInput.value.trim()
    const normalized = normalizeUserText(raw)
    const isDone = ['РіРѕС‚РѕРІРѕ', 'ok', 'РѕРє', 'done'].includes(normalized)
    const parts = []
    if (raw && !isDone) {
      parts.push(raw)
    }
    if (attachmentNotes.value.length > 0) {
      parts.push(...attachmentNotes.value)
    }
    if (isDone && parts.length === 0) {
      parts.push('РњР°С‚РµСЂРёР°Р»С‹ РЅРµ РїСЂРёР»РѕР¶РµРЅС‹.')
    }
    if (!isDone && parts.length === 0) {
      showNotice('Р”РѕР±Р°РІСЊС‚Рµ С‚РµРєСЃС‚, РґРѕРєСѓРјРµРЅС‚ РёР»Рё СЃРєСЂРёРЅС€РѕС‚.', 'warn')
      return
    }
    formData[field.key] = parts.join('\n').trim()
    pushStep()
    return
  }

  const raw = answerInput.value.trim()
  if (!raw) {
    showNotice('РћС‚РІРµС‚ РЅРµ РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РїСѓСЃС‚С‹Рј.', 'warn')
    return
  }
  formData[field.key] = raw
  pushStep()
}

function goTerms() {
  screen.value = 'terms'
}

function restartDraftFromStart() {
  resetDraft(true)
  screen.value = 'draft'
}

function createPaymentCard() {
  if (!selectedServiceKey.value || !selectedOffer.value) {
    showNotice('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕР±СЂР°С‚СЊ Р·Р°РєР°Р·. РќР°С‡РЅРёС‚Рµ Р·Р°РЅРѕРІРѕ.', 'error')
    goServicePicker()
    return
  }
  const payload = {
    userId: activeUserId.value,
    serviceKey: selectedServiceKey.value,
    requirements: { ...formData },
    priceRub: calculateOrderPrice(selectedServiceKey.value, formData),
    revisionLimit: APP_CONFIG.revisionLimit
  }
  const order = createOrder(payload)
  selectedOrder.value = order
  currentOrderId.value = Number(order.id)
  refreshMyOrders()
  screen.value = 'payment'
}

function cancelPaymentFlow() {
  if (!currentOrderId.value) {
    goMenu()
    return
  }
  const canceled = cancelOrder(currentOrderId.value)
  if (canceled) {
    selectedOrder.value = canceled
    showNotice(`Р—Р°РєР°Р· ${publicOrderNo(Number(canceled.id), Number(canceled.user_id))} РѕС‚РјРµРЅРµРЅ.`, 'info')
  }
  refreshMyOrders()
  goMenu()
}

async function confirmPaymentFlow() {
  if (!currentOrderId.value) {
    return
  }
  const started = markPaidAndStart(currentOrderId.value)
  if (!started) {
    showNotice('РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РѕРїР»Р°С‚Сѓ.', 'error')
    return
  }
  selectedOrder.value = started
  showNotice(orderAcceptedText(Number(started.id), Number(started.user_id)), 'success')
  await runGenerationForOrder(started, { openedFromPayment: true })
}

async function runGenerationForOrder(order, options = {}) {
  screen.value = 'processing'
  busy.value = true
  const openedFromPayment = Boolean(options.openedFromPayment)
  try {
    const generated = await generateInitial(order)
    await ensurePresentationFileBuilt(order, generated)
    const ready = setReady(Number(order.id), generated, APP_CONFIG.revisionWindowHours)
    if (!ready) {
      showNotice('РћС€РёР±РєР° СЃРѕС…СЂР°РЅРµРЅРёСЏ СЂРµР·СѓР»СЊС‚Р°С‚Р°. РџРѕРїСЂРѕР±СѓР№С‚Рµ РѕР±РЅРѕРІРёС‚СЊ СЃС‚СЂР°РЅРёС†Сѓ.', 'error')
      return
    }
    selectedOrder.value = ready
    currentOrderId.value = Number(ready.id)
    refreshMyOrders()
    showNotice(resultMessageText(ready), 'success')
    screen.value = 'order-details'
  } catch (error) {
    const details = extractErrorMessage(error)
    const failed = setOrderError(Number(order.id), details)
    if (failed) {
      selectedOrder.value = failed
      currentOrderId.value = Number(failed.id)
    }
    refreshMyOrders()
    screen.value = 'order-details'
    const prefix = openedFromPayment ? '\u043f\u043e\u0441\u043b\u0435 \u043e\u043f\u043b\u0430\u0442\u044b' : '\u043f\u0440\u0438 \u043f\u043e\u0432\u0442\u043e\u0440\u043d\u043e\u0439 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438'
    showNotice(`\u274c \u041e\u0448\u0438\u0431\u043a\u0430 \u0433\u0435\u043d\u0435\u0440\u0430\u0446\u0438\u0438 ${prefix}: ${details}. \u041e\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044c \u0432 \u043f\u043e\u0434\u0434\u0435\u0440\u0436\u043a\u0443 \u0438 \u0441\u043e\u043e\u0431\u0449\u0438\u0442\u0435 \u043d\u043e\u043c\u0435\u0440 \u0437\u0430\u043a\u0430\u0437\u0430.`, 'error')
  } finally {
    busy.value = false
  }
}

async function retryCurrentGeneration() {
  if (!selectedOrder.value || selectedOrder.value.status !== ORDER_STATUS_IN_PROGRESS || busy.value) {
    return
  }
  await runGenerationForOrder(selectedOrder.value, { openedFromPayment: false })
}

function openOrder(orderId) {
  const order = getOrderForUser(orderId, activeUserId.value)
  if (!order) {
    showNotice('Р—Р°РєР°Р· РЅРµ РЅР°Р№РґРµРЅ.', 'warn')
    refreshMyOrders()
    return
  }
  selectedOrder.value = order
  currentOrderId.value = Number(order.id)
  screen.value = 'order-details'
}

function refreshCurrentOrder() {
  if (!currentOrderId.value) {
    return
  }
  const updated = getOrderForUser(currentOrderId.value, activeUserId.value)
  if (updated) {
    selectedOrder.value = updated
  }
}

function refreshMyOrdersManual() {
  refreshMyOrders()
  showNotice('РЎРїРёСЃРѕРє Р·Р°РєР°Р·РѕРІ РѕР±РЅРѕРІР»РµРЅ.', 'info')
}

function refreshCurrentOrderManual() {
  refreshCurrentOrder()
  void syncResultPreviewFromOrder(selectedOrder.value)
  showNotice('Р—Р°РєР°Р· РѕР±РЅРѕРІР»РµРЅ.', 'info')
}

function canRequestRevision(order) {
  if (!order) {
    return false
  }
  if (![ORDER_STATUS_READY, ORDER_STATUS_IN_REVISION].includes(order.status)) {
    return false
  }
  const remaining = Math.max(0, Number(order.revision_limit) - Number(order.revision_used))
  if (remaining <= 0) {
    return false
  }
  if (!order.revision_window_until) {
    return true
  }
  return Date.now() <= new Date(order.revision_window_until).getTime()
}

function beginRevision() {
  if (!selectedOrder.value) {
    return
  }
  if (!canRequestRevision(selectedOrder.value)) {
    showNotice('РћРєРЅРѕ РїСЂР°РІРѕРє Р·Р°РєСЂС‹С‚Рѕ РёР»Рё Р»РёРјРёС‚ РёСЃС‡РµСЂРїР°РЅ.', 'warn')
    return
  }
  revisionInput.value = ''
  screen.value = 'revision'
}

async function submitRevision() {
  const text = revisionInput.value.trim()
  if (!text) {
    showNotice('РўРµРєСЃС‚ РїСЂР°РІРєРё РїСѓСЃС‚РѕР№. РћРїРёС€РёС‚Рµ, С‡С‚Рѕ РЅСѓР¶РЅРѕ РёР·РјРµРЅРёС‚СЊ.', 'warn')
    return
  }
  if (!selectedOrder.value) {
    return
  }
  if (isNewOrderChangeRequest(text)) {
    screen.value = 'menu'
    showNotice('Р—Р°РїСЂРѕСЃ РїРѕС…РѕР¶ РЅР° РЅРѕРІС‹Р№ Р·Р°РєР°Р·. РћС„РѕСЂРјРёС‚Рµ РЅРѕРІС‹Р№ Р·Р°РєР°Р· С‡РµСЂРµР· РјРµРЅСЋ.', 'warn')
    return
  }
  if (!canRequestRevision(selectedOrder.value)) {
    closeOrder(Number(selectedOrder.value.id))
    refreshCurrentOrder()
    screen.value = 'order-details'
    showNotice('РћРєРЅРѕ РґР»СЏ РїСЂР°РІРѕРє Р·Р°РєСЂС‹С‚Рѕ. Р—Р°РєР°Р· Р·Р°РІРµСЂС€РµРЅ.', 'warn')
    return
  }

  const inRevision = setInRevision(Number(selectedOrder.value.id))
  if (!inRevision) {
    showNotice('РќРµ СѓРґР°Р»РѕСЃСЊ РЅР°С‡Р°С‚СЊ РїСЂР°РІРєРё.', 'error')
    return
  }

  busy.value = true
  try {
    const revisedText = await applyRevision(inRevision, text)
    await ensurePresentationFileBuilt(inRevision, revisedText)
    const closeFlag = Number(inRevision.revision_used) + 1 >= Number(inRevision.revision_limit)
    const updated = applyRevisionResult(Number(inRevision.id), text, revisedText, closeFlag)
    if (!updated) {
      showNotice('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРѕС…СЂР°РЅРёС‚СЊ РїСЂР°РІРєРё. РџРѕРїСЂРѕР±СѓР№С‚Рµ РµС‰Рµ СЂР°Р·.', 'error')
      return
    }
    selectedOrder.value = updated
    refreshMyOrders()
    screen.value = 'order-details'
    if (closeFlag) {
      showNotice(revisionLimitExhaustedText(Number(updated.id), Number(updated.user_id)), 'warn')
    } else {
      showNotice(resultMessageText(updated), 'success')
    }
  } catch (error) {
    showNotice(`РќРµ СѓРґР°Р»РѕСЃСЊ РїСЂРёРјРµРЅРёС‚СЊ РїСЂР°РІРєСѓ: ${extractErrorMessage(error)}`, 'error')
  } finally {
    busy.value = false
  }
}

function acceptCurrentOrderFlow() {
  if (!selectedOrder.value) {
    return
  }
  const accepted = acceptOrder(Number(selectedOrder.value.id))
  if (accepted) {
    selectedOrder.value = accepted
    refreshMyOrders()
    showNotice(orderCompletedText(Number(accepted.id), Number(accepted.user_id)), 'success')
  }
  goMenu()
}

function submitFeedback() {
  const text = feedbackInput.value.trim()
  if (!text) {
    showNotice('РќР°РїРёС€РёС‚Рµ РІР°С€ РѕС‚Р·С‹РІ РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј.', 'warn')
    return
  }
  saveFeedback({ text, userId: activeUserId.value })
  feedbackInput.value = ''
  showNotice('РЎРїР°СЃРёР±Рѕ Р·Р° РѕС‚Р·С‹РІ. Р­С‚Рѕ РїРѕРјРѕРіР°РµС‚ СѓР»СѓС‡С€Р°С‚СЊ СЃРµСЂРІРёСЃ.', 'success')
  goMenu()
}

async function saveResultFile(blob, filename) {
  const lowerName = String(filename || '').toLowerCase()
  const ext = lowerName.endsWith('.pdf')
    ? '.pdf'
    : lowerName.endsWith('.docx')
      ? '.docx'
      : lowerName.endsWith('.doc')
        ? '.doc'
        : lowerName.endsWith('.pptx')
          ? '.pptx'
          : '.txt'
  const mime = blob?.type || (
    ext === '.pdf'
      ? 'application/pdf'
      : ext === '.docx'
        ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        : ext === '.doc'
          ? 'application/msword'
          : ext === '.pptx'
            ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
            : 'text/plain;charset=utf-8'
  )
  const safeFilename = String(filename || `result${ext}`).trim() || `result${ext}`
  const typedBlob = blob?.type ? blob : new Blob([blob], { type: mime })
  const url = window.URL.createObjectURL(typedBlob)
  const link = document.createElement('a')
  link.href = url
  link.download = safeFilename
  link.rel = 'noopener'
  link.style.display = 'none'
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 60_000)
  return 'downloaded'
}

async function downloadCurrentResult() {
  if (!selectedOrder.value || !hasResultText.value) {
    return
  }
  if (!canDownloadCurrentResult.value) {
    showNotice('Р¤Р°Р№Р» РјРѕР¶РЅРѕ Р±СѓРґРµС‚ СЃРєР°С‡Р°С‚СЊ СЃРѕРІСЃРµРј СЃРєРѕСЂРѕ.', 'info')
    return
  }
  try {
    const blob = resultPreview.blob
    const filename = resultPreview.filename
    const mode = await saveResultFile(blob, filename)
    showNotice(mode === 'downloaded' ? 'РЎРєР°С‡РёРІР°РЅРёРµ Р·Р°РїСѓС‰РµРЅРѕ.' : 'Р¤Р°Р№Р» РіРѕС‚РѕРІ Рє СЃРєР°С‡РёРІР°РЅРёСЋ.', 'info')
  } catch {
    showNotice('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєР°С‡Р°С‚СЊ С„Р°Р№Р». РџРѕРїСЂРѕР±СѓР№С‚Рµ РѕС‚РєСЂС‹С‚СЊ Р·Р°РєР°Р· РµС‰Рµ СЂР°Р· РёР»Рё РЅР°РїРёС€РёС‚Рµ РІ РїРѕРґРґРµСЂР¶РєСѓ.', 'warn')
  }
}

function openResultViewer() {
  if (!selectedOrder.value || !hasResultText.value) {
    return
  }
  screen.value = 'result-view'
}

async function copyCurrentResult() {
  const text = currentResultText.value.trim()
  if (!text) {
    return
  }
  try {
    await navigator.clipboard.writeText(text)
    showNotice('Р РµР·СѓР»СЊС‚Р°С‚ СЃРєРѕРїРёСЂРѕРІР°РЅ РІ Р±СѓС„РµСЂ РѕР±РјРµРЅР°.', 'success')
  } catch {
    showNotice('РќРµ СѓРґР°Р»РѕСЃСЊ СЃРєРѕРїРёСЂРѕРІР°С‚СЊ Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё. Р’С‹РґРµР»РёС‚Рµ С‚РµРєСЃС‚ Рё СЃРєРѕРїРёСЂСѓР№С‚Рµ РІСЂСѓС‡РЅСѓСЋ.', 'warn')
  }
}

const menuRows = [
  MENU_CREATE_ORDER,
  MENU_MY_ORDERS,
  MENU_HELP,
  MENU_NEW_ORDER,
  MENU_FEEDBACK
]

function handleMenuAction(action) {
  if (action === MENU_CREATE_ORDER || action === MENU_NEW_ORDER) {
    goServicePicker()
    return
  }
  if (action === MENU_MY_ORDERS) {
    openMyOrders()
    return
  }
  if (action === MENU_HELP) {
    goHelp()
    return
  }
  if (action === MENU_FEEDBACK) {
    goFeedback()
  }
}

watch(
  () => `${selectedOrder.value?.id || 0}:${selectedOrder.value?.result_version || 0}:${selectedOrder.value?.updated_at || ''}`,
  () => {
    syncResultPreviewFromOrder(selectedOrder.value)
  }
)

onBeforeUnmount(() => {
  resetResultPreview()
  if (recoveryTimer) {
    window.clearInterval(recoveryTimer)
    recoveryTimer = null
  }
  document.removeEventListener('visibilitychange', handleVisibilityResume)
})

onMounted(() => {
  activeUserId.value = getOrCreateActiveUserId()
  if (route.query.adminDenied === '1') {
    showNotice('РќРµРІРµСЂРЅС‹Р№ РїР°СЂРѕР»СЊ РґР»СЏ РІС…РѕРґР° РІ Р°РґРјРёРЅРєСѓ.', 'warn')
    const nextQuery = { ...route.query }
    delete nextQuery.adminDenied
    router.replace({ path: '/', query: nextQuery })
  }
  purgeExpiredOrders(72)
  document.addEventListener('visibilitychange', handleVisibilityResume)
  scheduleRecoveryLoop()
  recoverInProgressOrders().finally(() => {
    refreshMyOrders()
  })
})
</script>

<template>
  <main class="shell">
    <header class="app-header">
      <div>
        <h1>РљР»РёРµРЅС‚СЃРєРёР№ РєР°Р±РёРЅРµС‚</h1>
      </div>
      <div class="header-meta">
        <p>РљР»РёРµРЅС‚: <strong>{{ activeUserId }}</strong></p>
        <RouterLink class="btn btn-ghost" to="/admin">РђРґРјРёРЅРєР°</RouterLink>
      </div>
    </header>

    <section v-if="notice.text" class="notice" :data-type="notice.type">
      <pre>{{ notice.text }}</pre>
    </section>

    <section class="card">
      <div v-if="screen === 'menu'" class="stack">
        <pre class="mono-block">{{ welcomeText() }}</pre>
        <div class="menu-grid">
          <button v-for="action in menuRows" :key="action" class="btn btn-primary" @click="handleMenuAction(action)">
            {{ action }}
          </button>
        </div>
      </div>

      <div v-else-if="screen === 'service-picker'" class="stack">
        <pre class="mono-block">{{ chooseServiceText() }}</pre>
        <article v-for="service in serviceItems" :key="service.key" class="service-item">
          <div class="service-row">
            <h2>{{ service.label }}</h2>
            <p class="price">{{ service.priceRub }} в‚Ѕ</p>
          </div>
          <p>{{ service.shortDescription }}</p>
          <button class="btn btn-primary" @click="startDraft(service.key)">РџСЂРѕРґРѕР»Р¶РёС‚СЊ РѕС„РѕСЂРјР»РµРЅРёРµ</button>
        </article>
        <button class="btn btn-ghost" @click="goMenu">в¬… Р’ РјРµРЅСЋ</button>
      </div>

      <div v-else-if="screen === 'draft' && selectedOffer && currentField" class="stack">
        <p class="eyebrow">{{ selectedOffer.shortTitle }}</p>
        <pre class="mono-block">{{ currentStepPrompt }}</pre>
        <pre class="mono-hint">{{ promptHintText }}</pre>

        <div v-if="currentField.inputType === 'choice'" class="choice-grid">
          <button
            v-for="[value, label] in currentField.choices"
            :key="value"
            class="btn btn-secondary"
            @click="selectChoice(value)"
          >
            {{ label }}
          </button>
        </div>

        <textarea
          v-model="answerInput"
          rows="5"
          class="input"
          :placeholder="currentField.inputType === 'choice' ? 'РР»Рё РІРІРµРґРёС‚Рµ РѕС‚РІРµС‚ С‚РµРєСЃС‚РѕРј' : 'Р’РІРµРґРёС‚Рµ РѕС‚РІРµС‚'"
        />

        <div v-if="currentField.inputType === 'attachments'" class="stack-small">
          <label class="file-label">
            <input type="file" multiple @change="handleFileAttach" />
            <span>РџСЂРёРєСЂРµРїРёС‚СЊ С„Р°Р№Р»С‹</span>
          </label>
          <ul v-if="attachmentNotes.length" class="attachment-list">
            <li v-for="(note, idx) in attachmentNotes" :key="`${note}-${idx}`">{{ note }}</li>
          </ul>
        </div>

        <div class="row">
          <button class="btn btn-primary" @click="submitDraftAnswer">Р”Р°Р»СЊС€Рµ</button>
          <button class="btn btn-ghost" @click="goServicePicker">РћС‚РјРµРЅР°</button>
        </div>
      </div>

      <div v-else-if="screen === 'draft-review'" class="stack">
        <pre class="mono-block">{{ reviewText }}</pre>
        <div class="row">
          <button class="btn btn-primary" @click="goTerms">вњ… Р’СЃРµ РІРµСЂРЅРѕ</button>
          <button class="btn btn-secondary" @click="restartDraftFromStart">вњЏ РР·РјРµРЅРёС‚СЊ РґР°РЅРЅС‹Рµ</button>
          <button class="btn btn-ghost" @click="goMenu">в¬… Р’ РјРµРЅСЋ</button>
        </div>
      </div>

      <div v-else-if="screen === 'terms'" class="stack">
        <pre class="mono-block">{{ termsText }}</pre>
        <div class="row">
          <button class="btn btn-primary" @click="createPaymentCard">рџ’і РћРїР»Р°С‚РёС‚СЊ</button>
          <button class="btn btn-secondary" @click="restartDraftFromStart">вњЏ РР·РјРµРЅРёС‚СЊ РґР°РЅРЅС‹Рµ</button>
          <button class="btn btn-ghost" @click="goMenu">в¬… Р’ РјРµРЅСЋ</button>
        </div>
      </div>

      <div v-else-if="screen === 'payment' && selectedOrder" class="stack">
        <pre class="mono-block">{{ paymentCardText }}</pre>
        <div class="row">
          <button class="btn btn-primary" :disabled="busy" @click="confirmPaymentFlow">вњ… РЇ РѕРїР»Р°С‚РёР»(Р°)</button>
          <button class="btn btn-ghost" :disabled="busy" @click="cancelPaymentFlow">вќЊ РћС‚РјРµРЅРёС‚СЊ Р·Р°РєР°Р·</button>
        </div>
      </div>

      <div v-else-if="screen === 'processing'" class="stack processing">
        <p class="eyebrow">Р—Р°РєР°Р· РІ СЂР°Р±РѕС‚Рµ</p>
        <h2>Р—Р°РєР°Р· РІ СЃСЂРµРґРЅРµРј СЃРѕР±РёСЂР°РµС‚СЃСЏ РІ С‚РµС‡РµРЅРёРµ 5-7 РјРёРЅСѓС‚</h2>
        <p>РќРµ Р·Р°РєСЂС‹РІР°Р№С‚Рµ СЌС‚Рѕ РѕРєРЅРѕ Рё РЅРµ РѕР±РЅРѕРІР»СЏР№С‚Рµ СЃС‚СЂР°РЅРёС†Сѓ, РїРѕРєР° Р·Р°РєР°Р· СЃРѕР±РёСЂР°РµС‚СЃСЏ: С‚Р°Рє РїСЂРѕС†РµСЃСЃ РіРµРЅРµСЂР°С†РёРё РЅРµ РїСЂРµСЂРІРµС‚СЃСЏ. РљРѕРіРґР° СЂР°Р±РѕС‚Р° Р±СѓРґРµС‚ РіРѕС‚РѕРІР°, СЂРµР·СѓР»СЊС‚Р°С‚ РїРѕСЏРІРёС‚СЃСЏ РІ РїР°РїРєРµ В«РњРѕРё Р·Р°РєР°Р·С‹В».</p>
        <p>Р•СЃР»Рё С‡С‚Рѕ-С‚Рѕ РїРѕС€Р»Рѕ РЅРµ С‚Р°Рє, РЅР°РїРёС€РёС‚Рµ РІ РїРѕРґРґРµСЂР¶РєСѓ.</p>
        <div class="loader" aria-hidden="true" />
      </div>

      <div v-else-if="screen === 'orders'" class="stack">
        <h2>РњРѕРё Р·Р°РєР°Р·С‹</h2>
        <p class="muted">РҐСЂР°РЅРµРЅРёРµ Р·Р°РєР°Р·РѕРІ: 72 С‡Р°СЃР°, Р·Р°С‚РµРј РѕРЅРё Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРё СѓРґР°Р»СЏСЋС‚СЃСЏ.</p>
        <p v-if="!myOrders.length">{{ myOrdersEmptyText() }}</p>
        <ul v-else class="orders-list">
          <li v-for="order in myOrders" :key="order.id">
            <p>{{ orderShortRow(order) }}</p>
            <button class="btn btn-secondary" @click="openOrder(order.id)">РћС‚РєСЂС‹С‚СЊ</button>
          </li>
        </ul>
        <div class="row">
          <button class="btn btn-secondary" @click="refreshMyOrdersManual">рџ”„ РћР±РЅРѕРІРёС‚СЊ</button>
          <button class="btn btn-ghost" @click="goMenu">в¬… Р’ РјРµРЅСЋ</button>
        </div>
      </div>

      <div v-else-if="screen === 'order-details' && selectedOrder" class="stack">
        <pre class="mono-block">{{ currentOrderDetails }}</pre>
        <div v-if="hasResultText" class="result-block">
          <p class="muted" v-if="resultPreview.filename">
            Р¤Р°Р№Р»: <strong>{{ resultPreview.filename }}</strong>
          </p>
          <p class="muted" v-if="resultPreview.status === 'loading'">РџРѕРґРіРѕС‚РѕРІРєР° РїСЂРµРґРїСЂРѕСЃРјРѕС‚СЂР°...</p>
          
          <iframe
            v-else-if="resultPreview.kind === 'pdf' && resultPreview.objectUrl"
            class="result-iframe"
            :src="resultPreview.objectUrl"
            title="РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ PDF"
          />
          <div v-else-if="resultPreview.kind === 'docx'" class="docx-preview" v-html="resultPreview.docxHtml" />
          <p v-else-if="resultPreview.kind === 'file'" class="muted">
            РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ СЌС‚РѕРіРѕ С„РѕСЂРјР°С‚Р° РІ Р±СЂР°СѓР·РµСЂРµ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РЎРєР°С‡Р°Р№С‚Рµ С„Р°Р№Р» РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°.
          </p>
          <pre v-else class="result-viewer">{{ resultPreview.text }}</pre>
          <p v-if="resultPreview.error" class="muted">{{ resultPreview.error }}</p>
        </div>
        <div v-if="hasResultText" class="row">
          <button class="btn btn-primary" @click="openResultViewer">РћС‚РєСЂС‹С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚</button>
          <button v-if="canDownloadCurrentResult" class="btn btn-secondary" @click="downloadCurrentResult">
            {{ downloadResultButtonLabel }}
          </button>
        </div>

        <div class="row">
          <button
            v-if="selectedOrder.status === ORDER_STATUS_AWAITING_PAYMENT"
            class="btn btn-primary"
            @click="screen = 'payment'"
          >
            рџ’і РџРµСЂРµР№С‚Рё Рє РѕРїР»Р°С‚Рµ
          </button>
          <button
            v-if="[ORDER_STATUS_READY, ORDER_STATUS_IN_REVISION].includes(selectedOrder.status)"
            class="btn btn-primary"
            @click="acceptCurrentOrderFlow"
          >
            вњ… РџСЂРёРЅСЏС‚СЊ СЂР°Р±РѕС‚Сѓ
          </button>
          <button
            v-if="selectedOrder.status === ORDER_STATUS_IN_PROGRESS"
            class="btn btn-primary"
            :disabled="busy"
            @click="retryCurrentGeneration"
          >
            рџ”„ РџРѕРІС‚РѕСЂРёС‚СЊ РіРµРЅРµСЂР°С†РёСЋ
          </button>
          <button
            v-if="canRequestRevision(selectedOrder)"
            class="btn btn-secondary"
            @click="beginRevision"
          >
            рџ”Ѓ Р’РЅРµСЃС‚Рё РїСЂР°РІРєРё
          </button>
          <button class="btn btn-secondary" :disabled="busy" @click="refreshCurrentOrderManual">рџ”„ РћР±РЅРѕРІРёС‚СЊ</button>
          <button class="btn btn-ghost" @click="openMyOrders">рџ“‚ РњРѕРё Р·Р°РєР°Р·С‹</button>
          <button class="btn btn-ghost" @click="goMenu">в¬… Р’ РјРµРЅСЋ</button>
        </div>
      </div>

      <div v-else-if="screen === 'revision'" class="stack">
        <pre class="mono-block">{{ revisionPrompt }}</pre>
        <textarea
          v-model="revisionInput"
          rows="6"
          class="input"
          placeholder="РћРїРёС€РёС‚Рµ, С‡С‚Рѕ РЅСѓР¶РЅРѕ РёР·РјРµРЅРёС‚СЊ РІ С‚РµРєСѓС‰РµР№ РІРµСЂСЃРёРё"
        />
        <div class="row">
          <button class="btn btn-primary" :disabled="busy" @click="submitRevision">РћС‚РїСЂР°РІРёС‚СЊ РїСЂР°РІРєСѓ</button>
          <button class="btn btn-ghost" :disabled="busy" @click="screen = 'order-details'">РќР°Р·Р°Рґ</button>
        </div>
      </div>

      <div v-else-if="screen === 'result-view' && selectedOrder" class="stack">
        <h2>Р РµР·СѓР»СЊС‚Р°С‚ Р·Р°РєР°Р·Р°</h2>
        <div class="result-block">
          <p class="muted" v-if="resultPreview.filename">
            Р¤Р°Р№Р»: <strong>{{ resultPreview.filename }}</strong>
          </p>
          <p class="muted" v-if="resultPreview.status === 'loading'">РџРѕРґРіРѕС‚РѕРІРєР° РїСЂРµРґРїСЂРѕСЃРјРѕС‚СЂР°...</p>
          
          <iframe
            v-else-if="resultPreview.kind === 'pdf' && resultPreview.objectUrl"
            class="result-iframe"
            :src="resultPreview.objectUrl"
            title="РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ PDF"
          />
          <div v-else-if="resultPreview.kind === 'docx'" class="docx-preview" v-html="resultPreview.docxHtml" />
          <p v-else-if="resultPreview.kind === 'file'" class="muted">
            РџСЂРµРґРїСЂРѕСЃРјРѕС‚СЂ СЌС‚РѕРіРѕ С„РѕСЂРјР°С‚Р° РІ Р±СЂР°СѓР·РµСЂРµ РЅРµРґРѕСЃС‚СѓРїРµРЅ. РЎРєР°С‡Р°Р№С‚Рµ С„Р°Р№Р» РґР»СЏ РїСЂРѕСЃРјРѕС‚СЂР°.
          </p>
          <pre v-else class="result-viewer">{{ resultPreview.text }}</pre>
          <p v-if="resultPreview.error" class="muted">{{ resultPreview.error }}</p>
        </div>
        <div class="row">
          <button class="btn btn-primary" @click="copyCurrentResult">РЎРєРѕРїРёСЂРѕРІР°С‚СЊ С‚РµРєСЃС‚</button>
          <button v-if="canDownloadCurrentResult" class="btn btn-secondary" @click="downloadCurrentResult">
            {{ downloadResultButtonLabel }}
          </button>
          <button class="btn btn-ghost" @click="screen = 'order-details'">РќР°Р·Р°Рґ Рє Р·Р°РєР°Р·Сѓ</button>
        </div>
      </div>

      <div v-else-if="screen === 'help'" class="stack">
        <pre class="mono-block">{{ rulesText() }}</pre>
        <button class="btn btn-ghost" @click="goMenu">в¬… Р’ РјРµРЅСЋ</button>
      </div>

      <div v-else-if="screen === 'feedback'" class="stack">
        <h2>РћСЃС‚Р°РІРёС‚СЊ РѕС‚Р·С‹РІ</h2>
        <textarea v-model="feedbackInput" rows="5" class="input" placeholder="РќР°РїРёС€РёС‚Рµ РѕС‚Р·С‹РІ РѕРґРЅРёРј СЃРѕРѕР±С‰РµРЅРёРµРј" />
        <div class="row">
          <button class="btn btn-primary" @click="submitFeedback">РћС‚РїСЂР°РІРёС‚СЊ</button>
          <button class="btn btn-ghost" @click="goMenu">РћС‚РјРµРЅР°</button>
        </div>
      </div>

      <div v-else class="stack">
        <h2>Р­РєСЂР°РЅ РІСЂРµРјРµРЅРЅРѕ РЅРµРґРѕСЃС‚СѓРїРµРЅ</h2>
        <button class="btn btn-primary" @click="goMenu">Р’ РіР»Р°РІРЅРѕРµ РјРµРЅСЋ</button>
      </div>
    </section>
  </main>
</template>



