# Воспроизводимая проверка

## Backend

Из корня проекта:

```sh
docker compose --profile test run --build --rm tests
docker compose --profile test run --rm tests ruff format --check .
docker compose --profile test run --rm tests ruff check .
docker compose --profile test stop test-db
```

`test-db` использует отдельную сеть и временную файловую систему. Имя тестовой БД обязано оканчиваться на `_test`. На каждый прогон pytest создаёт уникальную схему, применяет к ней Alembic и удаляет только эту схему в конце. У тестового контейнера нет томов и реквизитов рабочей БД.

| Набор | Что проверяется |
|---|---|
| `tests/test_rules.py` | Разные соли Argon2id, верный и неверный пароль, нормализация имени, недопустимые символы, длина и пробельное содержимое сообщений, участники, роль, отзыв и срок сессии, уникальность токенов |
| `test_registration_session_logout` | Невозможность назначить роль при регистрации, конфликт имени, неверный вход, атрибуты cookie, /me, выход и повторное использование отозванной cookie |
| `test_concurrent_unordered_pair_and_paged_history` | Одновременное создание пары в обоих направлениях, автор и время, курсор, поиск и превью |
| `test_foreign_dialog_and_admin_privacy` | Третий пользователь и admin получают одинаковые 404 для недоступной переписки, каталог ограничен ролью |
| `test_ws_delivery_two_tabs_and_outsider_exclusion` | Обе вкладки участника получают одну запись. Посторонний первым получает контрольное сообщение из собственного диалога. Выход закрывает обе вкладки. |
| `test_expired_session_and_ws_origin` | Чужой origin, истечение сессии до следующей доставки, новый вход на WS и HTTP с просроченной cookie |
| `test_private_presence_typing_timeout_and_last_seen` | Присутствие с двумя вкладками, время выхода, приватность набора и сброс индикатора по тайм-ауту |
| `test_csrf_errors_and_rate_limit` | Обязательные заголовки, идентификатор ошибки и минутное окно запросов |

Для модульной проверки без Docker и PostgreSQL установите Python 3.12 и зависимости в виртуальное окружение. Из каталога `backend` выполните `python -m pip install -r requirements-dev.txt`, затем `python -m pytest -m "not integration" -q`. Для проверки моделей запущенного стенда используйте `docker compose exec backend alembic check`.

## Браузер

Нужен Node.js 22.12+ или 24 и Chromium для Playwright. Браузерные тесты создают записи с уникальными именами в отдельном проекте `imsitchat-qa` и используют порт 18080. В каталоге проекта:

```sh
docker compose -p imsitchat-qa -f compose.yaml -f compose.e2e.yaml up --build -d --wait
cd frontend
npm ci
npx playwright install chromium
npm run build
npm run e2e
cd ..
docker compose -p imsitchat-qa -f compose.yaml -f compose.e2e.yaml down
```

На Linux для первоначальной установки системных библиотек Chromium подходит `npx playwright install --with-deps chromium`. Если совместимый Chromium уже установлен, переменная `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` может указывать на его исполняемый файл. После подготовки образов, npm-зависимостей и браузера тесты работают локально.

Два изолированных контекста браузера регистрируются через интерфейс. Проверяются доставка ответа без перезагрузки, отсутствие дубликата, мобильная навигация, переподключение с получением пропущенного сообщения, сохранение текста при ошибке отправки, выход и ошибки формы входа. Отдельный автоматический сценарий загружает 43 сообщения, проверяет догрузку ранней истории, сохранение позиции при входящем сообщении и переход по индикатору вниз. Для ручной проверки прокрутки заполните диалог более чем 40 сообщениями, загрузите раннюю историю и отправьте сообщение из другого окна. Позиция чтения должна сохраниться. Нажатие «Новые сообщения» переводит к концу ленты.

## CI

Workflow в `.github/workflows/check.yml` разделён на два задания. Первое запускает Ruff и pytest с PostgreSQL. Второе проверяет TypeScript, собирает frontend и образы, запускает Compose и Playwright. Эти же проверки доступны на компьютере преподавателя. Сборку frontend отдельно запускает `npm run build` из каталога `frontend`, типы — `npm run typecheck`.
