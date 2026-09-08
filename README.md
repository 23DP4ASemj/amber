# Amber & Smoke

Работающий MVP магазина обычных потребительских товаров внутри Telegram Mini App: React, TypeScript, Vite, Tailwind CSS, Express, Google Sheets и Telegram Bot API. Демонстрационный каталог — чай, свечи и керамика. Все иллюстрации лежат локально в SVG.

Есть каталог, поиск по названию/бренду/варианту/категории, фильтр наличия, сортировка цен, варианты товаров, корзина, выбор района, возрастной экран, оформление, подтверждение и уведомления. Онлайн-оплата не собирается: выбран сценарий оплаты при доставке. Стоимость доставки в этой реализации — 0 EUR.

## Быстрый локальный запуск

Нужен Node.js 22.12+ и npm. Команды выполняются **из корня проекта**.

```sh
npm ci
cp .env.example .env
npm run dev
```

PowerShell:

```powershell
npm.cmd ci
Copy-Item .env.example .env
npm.cmd run dev
```

Откройте http://localhost:5173. API доступен на http://127.0.0.1:3001.

В подготовленном локальном `.env` включён `DEMO_MODE=true`. В этом режиме сервер подставляет явно демонстрационного пользователя, хранит заказы в памяти и не вызывает внешние интеграции. Остатки сбрасываются при перезапуске API. Сервер demo слушает только loopback. Production отказывается запускаться с `DEMO_MODE=true`; отсутствие Telegram-авторизации не создаёт гостевой заказ в реальном режиме.

Отдельные процессы:

```sh
npm run dev:api
npm run dev:web
```

Без `.env` demo не включается автоматически: реальный режим требует credentials.

## Структура

```text
apps/
  web/
    public/hero.svg
    public/products/          локальные иллюстрации
    src/
      components/             AgeGate, ProductCard, ProductDetail, CartSheet, Modal
      hooks/useCart.ts
      lib/                    API, Telegram SDK, storage
      App.tsx
      styles.css
  api/src/
    config/                   env, compliance, адаптер проверки возраста
    routes/
    controllers/              orders, Telegram webhook
    services/                 orders, products, notification worker
    repositories/             SheetsStore, MemoryStore, WriteJournal
    integrations/             Google Sheets REST API, Telegram Bot API
    utils/                    HMAC, mutex, безопасное логирование
shared/                       модели, Zod-схемы, demoProducts
scripts/                      initSheets, setupBot, recover
tests/                        API, безопасность, атомарность, браузерные сценарии
Dockerfile
compose.yaml
```

Общие типы: `Product`, `CartItem`, `OrderItem`, `Order`, `TelegramUser`, `PublicConfig`, `OrderRequest`, `OrderConfirmation`.

## Обработка заказа и границы MVP

`OrderService.processOrderAtomically()` выполняет:

1. Подписанный Telegram user определяется контроллером; Zod проверяет тело.
2. Очередь/mutex сериализует изменения остатков и заказов.
3. Из Orders читается существующий `client_order_id`. Совпадение пользователя и отпечатка запроса возвращает тот же заказ.
4. Проверяются район и подтверждение возраста; при external mode вызывается доверенный провайдер.
5. Products перечитывается без кеша; проверяются active, категория, район, количество и текущие остатки.
6. Цена считается в целых евроцентах исключительно по серверным данным.
7. Перед записью на постоянный диск записывается журнал попытки.
8. Один `spreadsheets.batchUpdate` одновременно обновляет остатки через `updateCells` и добавляет заказ через `appendCells`.
9. После подтверждённого ответа журнал удаляется; клиент получает номер и серверную сумму.
10. Независимый worker доставляет уведомления и сохраняет признаки доставки в Orders.

Google гарантирует совместное атомарное применение операций одного batch, но **не изоляцию от чужих изменений**. Поэтому это решение требует одного процесса API, одной реплики и единственного писателя в таблицу. [Документация batchUpdate](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate).

**Не запускайте PM2 cluster, несколько контейнеров, serverless API или перекрывающийся rolling deployment.** При deploy сначала останавливайте старый экземпляр. Прямое изменение stock, сортировка/удаление строк Products или изменение Orders во время checkout нарушает модель единственного писателя. Меняйте таблицу в окно обслуживания с остановленным API. Для просмотра применяйте filter views, не физическую сортировку строк.

Для горизонтального масштабирования нужно перенести заказы и остатки в транзакционную БД, например PostgreSQL, с блокировками строк и UNIQUE constraint для ключа заказа; Sheets оставить CRM-проекцией. Локальный mutex не заменяет распределённую транзакцию.

Каталог и Orders читаются из Sheets целиком. Это небольшой магазин с умеренным потоком, не высоконагруженная система. Наблюдайте за квотами, временем ответа и ростом таблицы. [Лимиты Sheets API](https://developers.google.com/workspace/sheets/api/limits).

## Настройка Google Sheets

1. Создайте проект в Google Cloud Console и включите **Google Sheets API**.
2. В **IAM & Admin → Service Accounts** создайте service account.
3. В его **Keys → Add key → Create new key → JSON** получите ключ. Храните скачанный JSON вне репозитория.
4. Создайте Google Spreadsheet.
5. Нажмите **Share**, добавьте `client_email` из JSON с ролью **Editor**. Публичный доступ не нужен. Административные роли проекта и domain-wide delegation для этого сценария не нужны.
6. ID таблицы — часть URL между `/d/` и `/edit`.
7. Заполните `GOOGLE_SHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` и `GOOGLE_PRIVATE_KEY` в серверном `.env`.

Создание аккаунта и доступ к отдельному документу описаны в [официальном руководстве Google](https://developers.google.com/workspace/guides/create-credentials#service-account).

Пример ключа в dotenv:

```dotenv
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_KEY_CONTENT\n-----END PRIVATE KEY-----\n"
```

Затем, после заполнения остальных обязательных env и установки `DEMO_MODE=false`:

```sh
npm run sheets:init
# Необязательно: добавить демонстрационный каталог только в пустой Products.
npm run sheets:init -- --seed
```

Скрипт создаёт отсутствующие листы и заголовки, проверяет существующие, не перезаписывает данные. Повторный seed непустой таблицы отклоняется.

### Products

Первая строка — заголовки **в указанном порядке**:

```csv
id,sku,category,brand,name,flavor,description,price,available,image_url,active,sort_order,blocked_districts
P001,AS-001,Home fragrance,AMBER STUDIO,The evening candle,Amber & sandalwood,Hand-poured soy candle,24,12,/products/candle-amber.svg,TRUE,10,
P002,AS-002,Tea & botanicals,SLOW LEAF,Golden hour tea,Peach & rooibos,Caffeine-free botanical blend,14,18,/products/tea-peach.svg,TRUE,20,Salaspils
```

- `id` уникален; отдельный вариант = отдельная строка с собственными id, SKU и остатком.
- Одинаковые `brand` и `name` объединяют варианты в карточке товара.
- `price`: числовая ячейка в EUR, максимум два знака после запятой.
- `available`: целое неотрицательное число. Нулевой остаток даёт Sold out; `HIDE_SOLD_OUT=true` скрывает такие строки.
- `active=FALSE` скрывает товар и запрещает заказ.
- `blocked_districts`: список районов через запятую в одной ячейке; пусто = нет дополнительного ограничения.
- `image_url`: HTTPS URL изображения либо путь `/products/name.svg`. При отдельном frontend локальный путь относится к frontend.
- Ошибочная схема, повторяющийся ID или некорректная цена останавливают чтение вместо выдачи неверных данных.

### Orders

Заголовки **в указанном порядке**:

```csv
order_id,created_at,telegram_user_id,telegram_username,first_name,district,items_json,subtotal,total,status,client_order_id,request_hash,customer_notified,admin_notified
```

Пример содержимого `items_json`:

```json
[{"product_id":"P001","name":"The evening candle","flavor":"Amber & sandalwood","qty":2,"unit_price":24,"line_total":48}]
```

В Order сохраняются snapshot названий, вариантов и цен, ISO UTC timestamp, серверная идентичность клиента, район и итоги. Строковые значения записываются как `stringValue`, поэтому имя, начинающееся с `=`, не превращается в формулу.

Статусы: `NEW → CONFIRMED → PROCESSING → READY → COMPLETED`. `CANCELLED` поддерживается схемой хранения; кнопки отмены и автоматического возврата stock в MVP нет. Для отмены остановите API, согласованно измените статус и верните количества по snapshot, затем возобновите работу. Не удаляйте исходный заказ и ключ идемпотентности.

`customer_notified` и `admin_notified` — устойчивый список ожидающих отправки уведомлений. Оставляйте FALSE для недоставленного сообщения; не очищайте эти колонки.

## Настройка Telegram

1. В официальном **@BotFather** создайте бота командой `/newbot`. Токен поместите только в `TELEGRAM_BOT_TOKEN`.
2. Укажите публичный HTTPS URL frontend в `WEBAPP_URL`.
3. В BotFather откройте `/mybots → ваш бот → Bot Settings → Configure Mini App` и настройте основной Mini App. Меню Open Shop также настраивается скриптом ниже.
4. Администратор должен начать диалог с ботом или добавить его в административный чат. Задайте числовой `TELEGRAM_ADMIN_CHAT_ID`. Для кнопок статусов укажите числовые Telegram user IDs в `TELEGRAM_ADMIN_USER_IDS`, через запятую.
5. Сгенерируйте случайный webhook secret, например:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

6. Сохраните результат в `TELEGRAM_WEBHOOK_SECRET`.
7. После публикации API выполните:

```sh
npm run bot:setup
# Если frontend и API имеют разные домены:
npm run bot:setup -- --api-url=https://api.example.com
```

Скрипт устанавливает `/start`, menu button Open Shop и webhook `/api/telegram/webhook`. Он не отправляет сообщения пользователям. ID чата можно получить из update своего бота через Bot API `getUpdates` **до** установки webhook; после установки используется webhook. Не публикуйте токен в URL, логах или скриншотах.

Для проверки откройте бота, отправьте `/start` и нажмите **Open Shop**. Клиент должен разрешать сообщения от бота. Для реальной проверки внутри Telegram локальный HTTP адрес замените публичным HTTPS frontend/API (тестовый deploy либо доверенный tunnel).

Валидируется HMAC-SHA-256 подписанного `initData`, включая `auth_date` и все подписанные поля кроме `hash`. Сравнение constant-time; повторяющиеся поля и неверный user отклоняются. Максимальный возраст задаётся env; чрезмерно будущая дата тоже отклоняется. `initDataUnsafe` используется только для подписи аккаунта в UI. [Официальный алгоритм Telegram](https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app).

Webhook проверяет секретный заголовок. Изменять статусы могут только перечисленные user IDs **в указанном admin chat**. Переходы последовательны; повтор текущего статуса безопасен. Обновление сохраняется в Sheets. [Настройка ботов](https://core.telegram.org/bots/features#botfather), [Bot API](https://core.telegram.org/bots/api#setwebhook).

## Уведомления

Сохранённый заказ не отменяется из-за сбоя Telegram. Worker запускается при старте, после checkout и каждые 30 секунд; за проход берёт до 10 заказов. Для клиента и администратора доставка отслеживается отдельно. Длинные сообщения разбиваются на части.

Гарантия уведомлений — **at least once**: если Telegram принял сообщение, а ответ или запись признака доставки потерялись, при повторе возможно дублирование сообщения. Заказ и списание при этом не дублируются. Ошибки логируются структурированно с номером заказа, без payload, ключей и полных SDK-ошибок. Для недоставленных сообщений смотрите FALSE в Orders; после устранения причин worker повторит попытку.

## API

| Endpoint | Назначение |
| --- | --- |
| GET /api/config | Публичные настройки; без секретов |
| GET /api/products | Разрешённые активные товары; необязательный query district |
| POST /api/orders | Создание или получение существующего заказа |
| POST /api/telegram/webhook | Telegram updates с секретным заголовком |
| GET /health | Готовность процесса и отсутствие незавершённого журнала записи |

POST требует `Authorization: tma <Telegram.WebApp.initData>`.

```json
{
  "client_order_id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "district": "Centrs",
  "items": [{"product_id": "P001", "qty": 2}],
  "age_confirmed": true
}
```

Разрешено до 40 разных позиций, по 1–99 единиц. Дубли product_id и лишние поля (например, price, total или user_id) отклоняются. Район и цены повторно проверяются backend. При изменении цены authoritative сумма — в ответе сохранённого заказа; клиентский subtotal является предварительным.

Первый успешный POST: **201**. Повтор с тем же ключом, пользователем и составом: **200**, прежний order_id. Другая корзина или пользователь с тем же ключом: **409 IDEMPOTENCY_CONFLICT**. Возвращается только подтверждение, без чужих Telegram данных.

Успех:

```json
{"success":true,"data":{"order_id":"AS-260908-0123ABCDEF","created_at":"2026-09-08T12:00:00.000Z","district":"Centrs","items":[],"subtotal":48,"total":48,"status":"NEW"}}
```

В реальном ответе items содержит snapshot заказа; пустой массив выше сокращает пример.

Ошибка:

```json
{"success":false,"error":{"code":"OUT_OF_STOCK","message":"Stock has changed. Please review the quantities in your bag."}}
```

Коды: 400 — форма/JSON/район; 401 — Telegram auth или webhook secret; 403 — возраст/регион; 404 — заказ/endpoint; 409 — stock/доступность/идемпотентность/статус; 413 — размер; 429 — rate limit; 503 — Sheets/verification/сверка. Отправка повторного запроса с неизвестным исходом всегда сохраняет прежний ключ. Frontend блокирует двойной submit и сохраняет pending checkout в sessionStorage; после reload его можно продолжить из корзины. Не очищайте данные браузера до выяснения результата неизвестной операции.

## Возраст и регион

Настройки находятся в `apps/api/src/config/compliance.ts` и env. Frontend получает только публичную часть.

- Возрастной экран появляется перед загрузкой каталога; подтверждение хранится в рамках сессии.
- Отдельный checkbox обязателен перед отправкой.
- `MINIMUM_AGE` задаёт порог, минимум 18.
- `DISABLED_CATEGORIES` скрывает категории и блокирует их заказ.
- `BLOCKED_DISTRICTS` запрещает checkout в выбранных районах.
- Дополнительный список `Products.blocked_districts` ограничивает конкретный товар.
- `LEGAL_NOTICE` отображается на возрастном экране и checkout.
- Район выбирает пользователь; это ограничение зоны обслуживания, а не подтверждённая геолокация.
- `declaration` — декларация возраста пользователем, **не независимая проверка документов**.

Для внешней проверки переключите `AGE_VERIFICATION_MODE=external`, укажите HTTPS endpoint и API key. Клиент вводит код, выданный вашим сервисом после проверки возраста. Адаптер отправляет:

```http
POST <AGE_VERIFICATION_URL>
Authorization: Bearer <AGE_VERIFICATION_API_KEY>
Content-Type: application/json
```

```json
{"user_id":42,"minimum_age":18,"token":"provider-issued-code"}
```

Ожидаемый успешный ответ:

```json
{"verified":true,"user_id":42}
```

Провайдер обязан проверять подлинность, срок действия кода и привязку к Telegram user ID. При отсутствии кода, несовпадении ID, ошибке или таймауте checkout запрещён. Конкретный сервис выдачи кодов зависит от выбранного провайдера; его регистрации/выпуска кодов в репозитории нет. Внешний режим работает через описанный интеграционный контракт. Минимальный возраст, уведомление и разрешённый ассортимент необходимо настроить под фактический бизнес перед публикацией.

## Environment variables

| Переменная | Назначение |
| --- | --- |
| NODE_ENV | development, test или production |
| PORT | Порт API, 3001 по умолчанию |
| DEMO_MODE | true только для локальной демонстрации |
| WEBAPP_URL | URL frontend и разрешённый CORS origin |
| TELEGRAM_BOT_TOKEN | Секрет бота |
| TELEGRAM_ADMIN_CHAT_ID | ID административного чата, допускается отрицательный |
| TELEGRAM_ADMIN_USER_IDS | Список user IDs для управления статусами |
| TELEGRAM_WEBHOOK_SECRET | Случайный секрет 32–256 URL-safe символов |
| GOOGLE_SHEET_ID | ID Spreadsheet |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | client_email сервисного аккаунта |
| GOOGLE_PRIVATE_KEY | private_key; поддерживается escaped newline |
| INIT_DATA_MAX_AGE_SECONDS | Срок initData: по умолчанию 3600 секунд |
| SHOP_NAME | Название магазина |
| DISTRICTS | Centrs,Zolitūde,Imanta,Salaspils по умолчанию |
| BLOCKED_DISTRICTS | Запрещённые районы через запятую |
| DISABLED_CATEGORIES | Отключённые категории через запятую |
| HIDE_SOLD_OUT | Скрывать товары с нулевым stock |
| MINIMUM_AGE | Возрастной порог |
| LEGAL_NOTICE | Публичное уведомление |
| AGE_VERIFICATION_MODE | declaration или external |
| AGE_VERIFICATION_URL | HTTPS endpoint внешнего сервиса |
| AGE_VERIFICATION_API_KEY | Секрет внешнего сервиса |
| DATA_DIR | Постоянный каталог журнала, например /app/data |
| TRUST_PROXY_HOPS | 0 напрямую; точное число доверенных reverse proxy перед API |
| VITE_API_URL | Только публичный origin API при отдельном frontend |

Никакие секреты не должны иметь префикс `VITE_`: такие переменные доступны браузеру. Валюта EUR и нулевая доставка заданы централизованно в серверной конфигурации/расчёте; для их изменения необходимо согласованно обновить тексты и расчёт.

## Неизвестный результат записи и восстановление

Потеря ответа Sheets не доказывает, что запись не состоялась. Вместо автоматической повторной записи сохраняется `DATA_DIR/pending-write.json`; все последующие изменения приостанавливаются, в том числе после перезапуска. Чтение каталога и возврат уже найденного заказа по прежнему ключу доступны.

1. Остановите **единственный** API. Сохраните постоянный диск и таблицу.
2. Подождите минимум пять минут с момента операции, чтобы дать зависшим внешним запросам завершиться.
3. Выполните `npm run orders:recover`: это read-only отчёт о журнале, наличии заказа, статусе и текущих остатках.
4. Для create_order проверьте наличие именно записанного order_id/client_order_id и соответствие stock ожидаемым значениям из журнала. Один batch либо применил заказ и все изменения stock, либо не применил их. Если данные расходятся из-за ручного редактирования, сверяйте с историей версий Sheets.
5. Для update_order сверяйте статус/флаги доставки с changes из журнала.
6. Только после фактической сверки выполните `npm run orders:recover -- --confirm-reconciled`. Команда архивирует журнал, не изменяет stock и не повторяет POST.
7. Запустите один API. Повторите **тот же** checkout: существующий заказ вернётся без списания, отсутствующий будет обработан заново.

В Docker maintenance-скрипты уже собраны в runtime image. Используйте тот же volume:

```sh
docker compose stop shop
docker compose run --rm shop node dist/scripts/recover.js
# Только после сверки:
docker compose run --rm shop node dist/scripts/recover.js --confirm-reconciled
docker compose up -d
```

Аналогично доступны `node dist/scripts/initSheets.js` и `node dist/scripts/setupBot.js`.

Не удаляйте журнал «для исправления 503» без сверки. Он содержит номер операции и остатки, а не ключи авторизации.

## Проверки

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Unit/API тесты не требуют внешних credentials. Они проверяют подпись/давность Telegram, запросы с неверной ценой/идентичностью, повторный POST, конкуренцию за последнюю единицу, атомарный batch, журнал после timeout, ограничения возраста/района, отказ Telegram и права администратора.

Браузерные тесты используют локальный **Microsoft Edge**, запуская desktop и мобильный viewport. Если Edge отсутствует, установите браузер для Playwright и замените `launchOptions.channel` на установленный браузер либо уберите channel для Chromium:

```sh
npx playwright install chromium
```

Playwright самостоятельно запускает frontend/API в demo mode. Для проверки реальных интеграций отдельно пройдите сценарий в Telegram с тестовой таблицей: /start → Open Shop → возраст → поиск → корзина → район → Place order → строка Orders и новый stock → два Telegram-уведомления → изменение статуса администратором.

## Deployment

### Один контейнер / VPS

```sh
npm run build
# После установки production env:
npm start
```

Production Express обслуживает и `dist/web`, и `/api`: один origin, без отдельной настройки CORS. Требуются HTTPS reverse proxy, постоянный `DATA_DIR` и строго одна реплика.

```sh
docker compose up --build -d
```

В `.env` перед этим задайте реальные credentials, HTTPS WEBAPP_URL и остальные настройки. Compose принудительно выставляет `NODE_ENV=production`, `DEMO_MODE=false`, монтирует named volume и публикует API только на loopback хоста. Reverse proxy должен передавать запросы на 127.0.0.1:3001. Значение TRUST_PROXY_HOPS зависит от фактической цепочки proxy.

Docker build не включает `.env`, данные или ключи. Runtime работает от непривилегированного пользователя node. Healthcheck проверяет `/health`. При checkout_paused требуется сверка журнала; бесконечные рестарты не устраняют неизвестный результат записи.

На Railway/Render/Fly/VPS применяются те же условия: одна реплика, постоянный volume, HTTPS и отсутствие одновременной работы старого и нового API. Конкретный provider в коде не зашит.

### Отдельный frontend

На Vercel или Cloudflare Pages:

- Install: `npm ci`.
- Build: `npm run build`.
- Output directory: `dist/web`.
- Build env: `VITE_API_URL=https://api.example.com`.
- Backend env: `WEBAPP_URL=https://shop.example.com`.
- Настройте HTTPS; если задаёте собственный CSP, разрешите Telegram SDK с https://telegram.org и connect-src к своему API. Не блокируйте встраивание из Telegram Web.
- Бот получает URL frontend, webhook — URL backend.

Для MVP удобнее один origin. Serverless-хостинг подходит frontend, **не текущему backend с локальной очередью**.

## Что нужно для реального запуска

Заполнить серверный `.env`, предоставить service account доступ Editor к таблице, выполнить `sheets:init`, опубликовать HTTPS приложение с постоянным диском и одной репликой, затем выполнить `bot:setup`. После этого проверьте один реальный тестовый заказ в вашем Telegram и таблице. Демонстрационные данные и локальные тесты не подтверждают доступ к вашим внешним аккаунтам.
