<script setup>
import { computed, onMounted, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { buildAdminReport } from '../core/adminReport'
import { APP_CONFIG, buildLlmPayload, getEffectiveLlmTransport, pingLlm } from '../core/generator'
import { getOrCreateActiveUserId, isAdminUser } from '../core/session'
import { publicOrderNo } from '../core/orderNumbers'
import { clearAllOrders, listRecentOrders, resolveOrderInput } from '../core/storage'
import { STATUS_LABELS } from '../core/catalog'

const router = useRouter()
const recentOrders = ref([])
const reportText = ref('')
const promptInput = ref('')
const promptText = ref('')
const promptOrderNo = ref('')
const reportOrdersCount = ref(0)
const reportRevenue = ref(0)
const alertText = ref('')
const llmStatus = ref('не проверено')
const llmBusy = ref(false)
const effectiveTransport = computed(() => getEffectiveLlmTransport())

const reportFileName = computed(() => `admin_report_${new Date().toISOString().slice(0, 19).replaceAll(':', '-')}.txt`)

function setAlert(text) {
  alertText.value = text
  window.setTimeout(() => {
    if (alertText.value === text) {
      alertText.value = ''
    }
  }, 4500)
}

function refreshAdminData() {
  const orders = listRecentOrders(500)
  recentOrders.value = listRecentOrders(20)
  reportText.value = buildAdminReport(orders, 24)
  const cutoff = Date.now() - 24 * 60 * 60 * 1000
  const recent = orders.filter((order) => new Date(order.created_at).getTime() >= cutoff)
  reportOrdersCount.value = recent.length
  reportRevenue.value = recent.reduce((sum, order) => sum + Number(order.price_rub || 0), 0)
}

function downloadTextFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

function downloadReport() {
  downloadTextFile(reportText.value, reportFileName.value)
}

function findPrompt() {
  const order = resolveOrderInput(promptInput.value)
  if (!order) {
    promptText.value = ''
    promptOrderNo.value = ''
    setAlert('Заказ не найден. Проверьте номер ORD-... из отчета.')
    return
  }
  promptOrderNo.value = publicOrderNo(Number(order.id), Number(order.user_id))
  promptText.value = buildLlmPayload(order)
}

function downloadPrompt() {
  if (!promptText.value || !promptOrderNo.value) {
    return
  }
  downloadTextFile(promptText.value, `prompt_${promptOrderNo.value}.txt`)
}

function resetAllOrders() {
  const confirmed = window.confirm('Очистить все заказы и правки в локальной базе этого сайта?')
  if (!confirmed) {
    return
  }
  clearAllOrders()
  promptInput.value = ''
  promptText.value = ''
  promptOrderNo.value = ''
  refreshAdminData()
  setAlert('Локальная база заказов очищена.')
}

function maskSecret(value) {
  const text = String(value || '')
  if (!text) {
    return 'не задан'
  }
  if (text.length <= 8) {
    return `${text.slice(0, 2)}***`
  }
  return `${text.slice(0, 4)}...${text.slice(-4)}`
}

async function checkLlmConnection() {
  llmBusy.value = true
  llmStatus.value = 'проверка...'
  try {
    const reply = await pingLlm()
    llmStatus.value = `ok (${reply || 'без текста'})`
    setAlert('Проверка LLM прошла успешно.')
  } catch (error) {
    const message = String(error?.message || error || 'unknown error')
    llmStatus.value = `ошибка: ${message}`
    setAlert(`LLM недоступна: ${message}`)
  } finally {
    llmBusy.value = false
  }
}

onMounted(() => {
  const currentUserId = getOrCreateActiveUserId()
  if (!isAdminUser(currentUserId)) {
    router.replace({ path: '/', query: { adminDenied: '1' } })
    return
  }
  refreshAdminData()
})
</script>

<template>
  <main class="shell">
    <header class="app-header">
      <div>
        <p class="eyebrow">MGDI Assistant</p>
        <h1>Админ-панель</h1>
      </div>
      <RouterLink class="btn btn-ghost" to="/">← Клиент</RouterLink>
    </header>

    <section v-if="alertText" class="notice" data-type="warn">
      <pre>{{ alertText }}</pre>
    </section>

    <section class="card stack">
      <div class="stats-grid">
        <article class="stat-card">
          <p class="stat-label">Заказы за 24ч</p>
          <p class="stat-value">{{ reportOrdersCount }}</p>
        </article>
        <article class="stat-card">
          <p class="stat-label">Плановая выручка</p>
          <p class="stat-value">{{ reportRevenue }} ₽</p>
        </article>
      </div>

      <div class="row">
        <button class="btn btn-primary" @click="refreshAdminData">Обновить</button>
        <button class="btn btn-secondary" @click="downloadReport">Скачать отчет 24ч</button>
        <button class="btn btn-danger" @click="resetAllOrders">Очистить все заказы</button>
      </div>

      <pre class="mono-block">{{ reportText }}</pre>
    </section>

    <section class="card stack">
      <h2>Диагностика LLM</h2>
      <p class="muted">Транспорт: <strong>{{ APP_CONFIG.transport }}</strong> (факт: <strong>{{ effectiveTransport }}</strong>)</p>
      <p class="muted">Relay path: <code>{{ APP_CONFIG.relayPath }}</code></p>
      <p class="muted">Модель: <strong>{{ APP_CONFIG.apiModel }}</strong></p>
      <p class="muted">API URL: <code>{{ APP_CONFIG.apiUrl }}</code></p>
      <p class="muted">Ключ: <code>{{ maskSecret(APP_CONFIG.apiKey) }}</code></p>
      <p class="muted">Статус: <strong>{{ llmStatus }}</strong></p>
      <div class="row">
        <button class="btn btn-primary" :disabled="llmBusy" @click="checkLlmConnection">Проверить связь с LLM</button>
      </div>
    </section>

    <section class="card stack">
      <h2>Последние 20 заказов</h2>
      <div class="table-scroll">
        <table class="orders-table">
          <thead>
            <tr>
              <th>Номер</th>
              <th>User ID</th>
              <th>Услуга</th>
              <th>Статус</th>
              <th>Цена</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="!recentOrders.length">
              <td colspan="5">Пока заказов нет.</td>
            </tr>
            <tr v-for="order in recentOrders" :key="order.id">
              <td>{{ publicOrderNo(order.id, order.user_id) }}</td>
              <td>{{ order.user_id }}</td>
              <td>{{ order.service_title }}</td>
              <td>{{ STATUS_LABELS[order.status] || order.status }}</td>
              <td>{{ order.price_rub }} ₽</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="card stack">
      <h2>Промпт по номеру заказа</h2>
      <p>Формат: <code>ORD-00015-ABC123</code></p>
      <div class="row">
        <input v-model="promptInput" class="input input-inline" placeholder="Введите номер заказа ORD-..." />
        <button class="btn btn-primary" @click="findPrompt">Показать промпт</button>
        <button class="btn btn-secondary" :disabled="!promptText" @click="downloadPrompt">Скачать prompt</button>
      </div>
      <p v-if="promptOrderNo" class="muted">Промпт для заказа: {{ promptOrderNo }}</p>
      <pre v-if="promptText" class="mono-block">{{ promptText }}</pre>
    </section>
  </main>
</template>
