<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  ORDER_STATUS_AWAITING_PAYMENT,
  ORDER_STATUS_IN_PROGRESS,
  ORDER_STATUS_IN_REVISION,
  ORDER_STATUS_READY,
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

const promptHintText = computed(() => {
  if (!currentField.value) {
    return ''
  }
  if (currentField.value.inputType === 'attachments') {
    return (
      'Можно отправить текст, документ или скриншот.\n' +
      'Если не знаете, напишите: «на твое усмотрение».\n' +
      'Когда закончите прикреплять материалы, отправьте «готово» или напишите комментарий.'
    )
  }
  if (currentField.value.inputType === 'choice') {
    return 'Можно нажать кнопку или написать ответ текстом.'
  }
  return 'Если не знаете, напишите: «на твое усмотрение».\nОтправьте ответ одним сообщением.'
})

const currentStepPrompt = computed(() => {
  if (!selectedOffer.value || !currentField.value) {
    return ''
  }
  return `Шаг ${stepIndex.value + 1}/${selectedOffer.value.fields.length}\n${currentField.value.prompt}`
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
  const candidates = listUserOrders(activeUserId.value, 50).filter((order) => order.status === ORDER_STATUS_IN_PROGRESS)
  for (const order of candidates) {
    try {
      const generated = await generateInitial(order)
      setReady(Number(order.id), generated, APP_CONFIG.revisionWindowHours)
    } catch {
      // Keep order in-progress if recovery fails.
    }
  }
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
    const title = isImage ? '[Скриншот]' : '[Файл]'
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
      showNotice('Для этого шага выберите вариант кнопкой или напишите ответ (например: «да», «нет», «строгий»).', 'warn')
      return
    }
    formData[field.key] = selected
    pushStep()
    return
  }

  if (field.inputType === 'attachments') {
    const raw = answerInput.value.trim()
    const normalized = normalizeUserText(raw)
    const isDone = ['готово', 'ok', 'ок', 'done'].includes(normalized)
    const parts = []
    if (raw && !isDone) {
      parts.push(raw)
    }
    if (attachmentNotes.value.length > 0) {
      parts.push(...attachmentNotes.value)
    }
    if (isDone && parts.length === 0) {
      parts.push('Материалы не приложены.')
    }
    if (!isDone && parts.length === 0) {
      showNotice('Добавьте текст, документ или скриншот.', 'warn')
      return
    }
    formData[field.key] = parts.join('\n').trim()
    pushStep()
    return
  }

  const raw = answerInput.value.trim()
  if (!raw) {
    showNotice('Ответ не должен быть пустым.', 'warn')
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
    showNotice('Не удалось собрать заказ. Начните заново.', 'error')
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
    showNotice(`Заказ ${publicOrderNo(Number(canceled.id), Number(canceled.user_id))} отменен.`, 'info')
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
    showNotice('Не удалось подтвердить оплату.', 'error')
    return
  }
  selectedOrder.value = started
  showNotice(orderAcceptedText(Number(started.id), Number(started.user_id)), 'success')
  screen.value = 'processing'
  busy.value = true
  try {
    const generated = await generateInitial(started)
    const ready = setReady(Number(started.id), generated, APP_CONFIG.revisionWindowHours)
    if (!ready) {
      showNotice('Ошибка сохранения результата. Попробуйте обновить страницу.', 'error')
      return
    }
    selectedOrder.value = ready
    currentOrderId.value = Number(ready.id)
    refreshMyOrders()
    showNotice(resultMessageText(ready), 'success')
    screen.value = 'order-details'
  } catch {
    showNotice(`❌ По заказу №${currentOrderId.value} произошла техническая ошибка. Попробуйте снова чуть позже.`, 'error')
    screen.value = 'orders'
  } finally {
    busy.value = false
  }
}

function openOrder(orderId) {
  const order = getOrderForUser(orderId, activeUserId.value)
  if (!order) {
    showNotice('Заказ не найден.', 'warn')
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
    showNotice('Окно правок закрыто или лимит исчерпан.', 'warn')
    return
  }
  revisionInput.value = ''
  screen.value = 'revision'
}

async function submitRevision() {
  const text = revisionInput.value.trim()
  if (!text) {
    showNotice('Текст правки пустой. Опишите, что нужно изменить.', 'warn')
    return
  }
  if (!selectedOrder.value) {
    return
  }
  if (isNewOrderChangeRequest(text)) {
    screen.value = 'menu'
    showNotice('Запрос похож на новый заказ. Оформите новый заказ через меню.', 'warn')
    return
  }
  if (!canRequestRevision(selectedOrder.value)) {
    closeOrder(Number(selectedOrder.value.id))
    refreshCurrentOrder()
    screen.value = 'order-details'
    showNotice('Окно для правок закрыто. Заказ завершен.', 'warn')
    return
  }

  const inRevision = setInRevision(Number(selectedOrder.value.id))
  if (!inRevision) {
    showNotice('Не удалось начать правки.', 'error')
    return
  }

  busy.value = true
  try {
    const revisedText = await applyRevision(inRevision, text)
    const closeFlag = Number(inRevision.revision_used) + 1 >= Number(inRevision.revision_limit)
    const updated = applyRevisionResult(Number(inRevision.id), text, revisedText, closeFlag)
    if (!updated) {
      showNotice('Не удалось сохранить правки. Попробуйте еще раз.', 'error')
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
  } catch {
    showNotice('Не удалось применить правку из-за технической ошибки.', 'error')
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
    showNotice('Напишите ваш отзыв одним сообщением.', 'warn')
    return
  }
  saveFeedback({ text, userId: activeUserId.value })
  feedbackInput.value = ''
  showNotice('Спасибо за отзыв. Это помогает улучшать сервис.', 'success')
  goMenu()
}

function downloadCurrentResult() {
  if (!selectedOrder.value || !selectedOrder.value.result_text) {
    return
  }
  const { blob, filename } = exportOrderResultAsFile(selectedOrder.value)
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
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

onMounted(() => {
  activeUserId.value = getOrCreateActiveUserId()
  purgeExpiredOrders(72)
  recoverInProgressOrders().finally(() => {
    refreshMyOrders()
  })
})
</script>

<template>
  <main class="shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">MGDI Assistant</p>
        <h1>Клиентский кабинет</h1>
      </div>
      <div class="header-meta">
        <p>Клиент: <strong>{{ activeUserId }}</strong></p>
        <RouterLink class="btn btn-ghost" to="/admin">Админка</RouterLink>
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
            <p class="price">{{ service.hasFrom ? 'от ' : '' }}{{ service.priceRub }} ₽</p>
          </div>
          <p>{{ service.shortDescription }}</p>
          <button class="btn btn-primary" @click="startDraft(service.key)">Продолжить оформление</button>
        </article>
        <button class="btn btn-ghost" @click="goMenu">⬅ В меню</button>
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
          :placeholder="currentField.inputType === 'choice' ? 'Или введите ответ текстом' : 'Введите ответ'"
        />

        <div v-if="currentField.inputType === 'attachments'" class="stack-small">
          <label class="file-label">
            <input type="file" multiple @change="handleFileAttach" />
            <span>Прикрепить файлы</span>
          </label>
          <ul v-if="attachmentNotes.length" class="attachment-list">
            <li v-for="(note, idx) in attachmentNotes" :key="`${note}-${idx}`">{{ note }}</li>
          </ul>
        </div>

        <div class="row">
          <button class="btn btn-primary" @click="submitDraftAnswer">Дальше</button>
          <button class="btn btn-ghost" @click="goServicePicker">Отмена</button>
        </div>
      </div>

      <div v-else-if="screen === 'draft-review'" class="stack">
        <pre class="mono-block">{{ reviewText }}</pre>
        <div class="row">
          <button class="btn btn-primary" @click="goTerms">✅ Все верно</button>
          <button class="btn btn-secondary" @click="restartDraftFromStart">✏ Изменить данные</button>
          <button class="btn btn-ghost" @click="goMenu">⬅ В меню</button>
        </div>
      </div>

      <div v-else-if="screen === 'terms'" class="stack">
        <pre class="mono-block">{{ termsText }}</pre>
        <div class="row">
          <button class="btn btn-primary" @click="createPaymentCard">💳 Оплатить</button>
          <button class="btn btn-secondary" @click="restartDraftFromStart">✏ Изменить данные</button>
          <button class="btn btn-ghost" @click="goMenu">⬅ В меню</button>
        </div>
      </div>

      <div v-else-if="screen === 'payment' && selectedOrder" class="stack">
        <pre class="mono-block">{{ paymentCardText }}</pre>
        <div class="row">
          <button class="btn btn-primary" :disabled="busy" @click="confirmPaymentFlow">✅ Я оплатил(а)</button>
          <button class="btn btn-ghost" :disabled="busy" @click="cancelPaymentFlow">❌ Отменить заказ</button>
        </div>
      </div>

      <div v-else-if="screen === 'processing'" class="stack processing">
        <p class="eyebrow">Заказ в работе</p>
        <h2>Материал собирается, это займет немного времени</h2>
        <p>Если ответа нет более 2-3 часов, обратитесь в поддержку.</p>
        <div class="loader" aria-hidden="true" />
      </div>

      <div v-else-if="screen === 'orders'" class="stack">
        <h2>Мои заказы</h2>
        <p class="muted">Хранение заказов: 72 часа, затем они автоматически удаляются.</p>
        <p v-if="!myOrders.length">{{ myOrdersEmptyText() }}</p>
        <ul v-else class="orders-list">
          <li v-for="order in myOrders" :key="order.id">
            <p>{{ orderShortRow(order) }}</p>
            <button class="btn btn-secondary" @click="openOrder(order.id)">Открыть</button>
          </li>
        </ul>
        <div class="row">
          <button class="btn btn-secondary" @click="refreshMyOrders">🔄 Обновить</button>
          <button class="btn btn-ghost" @click="goMenu">⬅ В меню</button>
        </div>
      </div>

      <div v-else-if="screen === 'order-details' && selectedOrder" class="stack">
        <pre class="mono-block">{{ currentOrderDetails }}</pre>
        <pre v-if="selectedOrder.result_text" class="result-block">{{ selectedOrder.result_text }}</pre>
        <div v-if="selectedOrder.result_text" class="row">
          <button class="btn btn-secondary" @click="downloadCurrentResult">Скачать TXT</button>
        </div>

        <div class="row">
          <button
            v-if="selectedOrder.status === ORDER_STATUS_AWAITING_PAYMENT"
            class="btn btn-primary"
            @click="screen = 'payment'"
          >
            💳 Перейти к оплате
          </button>
          <button
            v-if="[ORDER_STATUS_READY, ORDER_STATUS_IN_REVISION].includes(selectedOrder.status)"
            class="btn btn-primary"
            @click="acceptCurrentOrderFlow"
          >
            ✅ Принять работу
          </button>
          <button
            v-if="canRequestRevision(selectedOrder)"
            class="btn btn-secondary"
            @click="beginRevision"
          >
            🔁 Внести правки
          </button>
          <button class="btn btn-secondary" @click="refreshCurrentOrder">🔄 Обновить</button>
          <button class="btn btn-ghost" @click="openMyOrders">📂 Мои заказы</button>
          <button class="btn btn-ghost" @click="goMenu">⬅ В меню</button>
        </div>
      </div>

      <div v-else-if="screen === 'revision'" class="stack">
        <pre class="mono-block">{{ revisionPrompt }}</pre>
        <textarea
          v-model="revisionInput"
          rows="6"
          class="input"
          placeholder="Опишите, что нужно изменить в текущей версии"
        />
        <div class="row">
          <button class="btn btn-primary" :disabled="busy" @click="submitRevision">Отправить правку</button>
          <button class="btn btn-ghost" :disabled="busy" @click="screen = 'order-details'">Назад</button>
        </div>
      </div>

      <div v-else-if="screen === 'help'" class="stack">
        <pre class="mono-block">{{ rulesText() }}</pre>
        <button class="btn btn-ghost" @click="goMenu">⬅ В меню</button>
      </div>

      <div v-else-if="screen === 'feedback'" class="stack">
        <h2>Оставить отзыв</h2>
        <textarea v-model="feedbackInput" rows="5" class="input" placeholder="Напишите отзыв одним сообщением" />
        <div class="row">
          <button class="btn btn-primary" @click="submitFeedback">Отправить</button>
          <button class="btn btn-ghost" @click="goMenu">Отмена</button>
        </div>
      </div>

      <div v-else class="stack">
        <h2>Экран временно недоступен</h2>
        <button class="btn btn-primary" @click="goMenu">В главное меню</button>
      </div>
    </section>
  </main>
</template>
