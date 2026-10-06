# HTTP API

Envelope: успех `{ "ok": true, "data": ... }`, отказ
`{ "ok": false, "error": "безопасный текст" }`. Источник схем — `contracts/`.
Изменения — POST JSON, кроме upload (multipart/form-data).

Запросы требуют `X-Max-Client: 1`. После входа изменяющие запросы дополнительно
содержат `X-CSRF-Token` из ответа `/api/auth/session`. JWT хранится в cookie
и не выдаётся JSON. Для загрузки вложения обычной ссылкой GET-заголовок
X-Max-Client не требуется; авторизация остаётся обязательной.

| Метод и маршрут                | Назначение                                                           |
| ------------------------------ | -------------------------------------------------------------------- |
| POST /api/auth/login           | Логин/пароль, установка JWT-cookie, безопасный профиль и CSRF        |
| GET /api/auth/session          | Проверка входа и получение CSRF                                      |
| POST /api/auth/logout          | Отзыв JWT и отключение MAX                                           |
| POST /api/auth/password        | Смена своего пароля с проверкой текущего                             |
| GET /api/admin/users           | Безопасные профили пользователей, только admin                       |
| POST /api/admin/users          | Создание пользователя, только admin                                  |
| POST /api/admin/users/access   | Изменение active, отзыв сессий, только admin                         |
| POST /api/admin/users/password | Сброс пароля и отзыв сессий, только admin                            |
| GET /api/max                   | Текущее собственное подключение или null                             |
| GET /api/max/profile           | Сохранённые параметры без ключа, connected и connectionId; либо null |
| POST /api/max/reconnect        | Вход в собственный сохранённый инстанс: только apiTokenInstance      |
| POST /api/max/connect          | Подключение по реквизитам GREEN-API и согласию владельца             |
| POST /api/max/disconnect       | Отключение собственной connectionId                                  |
| POST /api/max/chats            | Поиск номера и открытие чата                                         |
| POST /api/max/sync             | Обновление контактов и чатов                                         |
| POST /api/max/history          | История chatId, count 1–5000, refresh                                |
| POST /api/max/poll             | Одно уведомление с подтверждением и текущий snapshot                 |
| POST /api/max/send             | Текст, необязательная quotedMessageId, requestId                     |
| POST /api/max/upload           | Файл, подпись, необязательная цитата, requestId                      |
| POST /api/max/edit             | Изменение известного исходящего текста                               |
| POST /api/max/delete           | Удаление исходящего, onlySenderDelete                                |
| POST /api/max/forward          | Пересылка известного сообщения в targetChatId, requestId             |
| POST /api/max/reaction         | Реакция на известное сообщение                                       |
| POST /api/max/read             | Отметка собственного чата прочитанным                                |
| GET /api/max/media             | Защищённое скачивание по connectionId/chatId/messageId               |

Владелец всегда берётся из проверенного JWT; owner/userId в теле не принимаются.
GET /api/max автоматически восстанавливает сохранённое подключение.
expiresAt=0 обозначает отсутствие срока истечения подключения MAX.
connectionId — UUID. MAX chatId — строка числового ID, включая отрицательные ID
групп. messageId сохраняется исходным. Пересоздание чатов по номеру для известных
контактов не требуется.

Редактирование сохраняет ID оригинального сообщения. DeleteMessage имеет пустой
успешный ответ провайдера; сервер клиента возвращает обновлённый snapshot.
URL вложения остаётся на сервере, DTO содержит только имя, вид, MIME и доступность.

## Первичные источники GREEN-API

- [Отправка текста и цитаты](https://green-api.com/v3/docs/api/sending/SendMessage/)
- [Загрузка файла](https://green-api.com/v3/docs/api/sending/SendFileByUpload/)
- [История](https://green-api.com/v3/docs/api/journals/GetChatHistory/)
- [Редактирование](https://green-api.com/v3/docs/api/service/EditMessage/)
- [Удаление](https://green-api.com/v3/docs/api/service/DeleteMessage/)
- [Пересылка](https://green-api.com/v3/docs/api/sending/ForwardMessages/)
- [Реакции](https://green-api.com/v3/docs/api/service/SendReaction/)
- [Отметка прочтения](https://green-api.com/v3/docs/api/marks/ReadChat/)
- [Уведомления](https://green-api.com/v3/docs/api/receiving/technology-http-api/)

На момент реализации реакции и другие возможности могут ограничиваться аккаунтом,
настройками и API. Клиент передаёт реальный запрос и показывает безопасный отказ
провайдера; локальная имитация успеха вместо выполнения не используется.

GET /api/max/media разрешает ссылку через downloadFile при её отсутствии и один раз
обновляет просроченную ссылку. Проверки владельца и сообщения выполняются перед
обращением к провайдеру. URL остаётся на сервере; ответ содержит бинарный файл
с Content-Type application/octet-stream.
