# TG Bot Vue App

Веб-приложение на Vue 3 + Vite, которое повторяет Telegram-флоу заказов:

- клиентский путь (меню -> выбор услуги -> бриф -> проверка -> условия -> оплата -> результат -> правки),
- единый номер заказа формата `ORD-...`,
- админка с отчетом за 24 часа, последними заказами и выгрузкой prompt по номеру заказа.

## Запуск

1. `npm install`
2. `npm run dev`
3. откройте `http://127.0.0.1:5173`

## Скрипты

- `npm run dev` — локальная разработка
- `npm run build` — production-сборка
- `npm run preview` — просмотр production-сборки

## Роуты

- `/` — клиентский интерфейс
- `/admin` — админ-панель

## Важное

- Данные заказов хранятся локально (LocalStorage) и автоматически чистятся по TTL 72 часа.
- Генерация результата работает только через подключенную API-модель.

## Подключение API модели (рекомендуемый режим для Vercel)

В проекте есть serverless relay endpoint: `/api/llm`.
Клиент (браузер) обращается к нему, а ключ хранится только в серверных переменных Vercel.

### 1) Vercel Environment Variables (серверные, без `VITE_`)

```env
LLM_API_KEY=YOUR_API_KEY
LLM_MODEL=openai/gpt-5.4
LLM_MODEL_PRESENTATION=openai/gpt-5.5
LLM_API_URL=https://polza.ai/api/v1/chat/completions
LLM_API_MODE=chat_completions
LLM_CLIENT_ID=tg-bot-vue
```

### 2) Client vars (можно в `.env.local` для локалки или в Vercel)

```env
VITE_LLM_MODEL=openai/gpt-5.4
VITE_LLM_MODEL_PRESENTATION=openai/gpt-5.5
VITE_LLM_TRANSPORT=relay
VITE_LLM_RELAY_PATH=/api/llm
VITE_LLM_TIMEOUT_MS=90000
VITE_LLM_RETRIES=2
```

### 3) Локальный запуск

1. `npm run dev`
2. Для локального relay нужен запущенный Vercel runtime (`vercel dev`) либо можно поставить `VITE_LLM_TRANSPORT=direct` и задать `VITE_LLM_API_KEY`.

Важно: `VITE_LLM_API_KEY` в production лучше не использовать, чтобы ключ не попадал в клиентский bundle.
