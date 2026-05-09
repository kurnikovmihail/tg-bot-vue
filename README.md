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

## Подключение API модели (для теста)

Создайте файл `.env.local` в корне проекта:

```env
VITE_LLM_API_KEY=YOUR_API_KEY
VITE_LLM_MODEL=openai/gpt-5.4
VITE_LLM_API_URL=https://polza.ai/api/v1/chat/completions
VITE_LLM_API_MODE=chat_completions
VITE_LLM_CLIENT_ID=tg-bot-vue
VITE_LLM_TIMEOUT_MS=90000
VITE_LLM_RETRIES=2
```

После этого перезапустите `npm run dev` и оформите заказ в интерфейсе.

Важно: `.env.local` не коммитится, но в чистом фронтенде ключ все равно может быть виден в браузере. Для продакшена нужен backend/proxy.
