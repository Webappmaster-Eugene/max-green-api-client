Запросы HTTP API.

Успешный ответ имеет вид `{ "ok": true, "data": ... }`.
Ошибка имеет вид `{ "ok": false, "error": "текст ошибки" }`.
Для некоторых ошибок также возвращается `code`.
Точные поля проверяются схемами в `contracts/`.

Запросы требуют `X-Max-Client: 1`. После входа запросы, меняющие данные,
требуют `X-CSRF-Token` из ответа `/api/auth/session`.
JWT находится в cookie и не возвращается в JSON.
Изменения передаются через POST с JSON, кроме загрузки файла:
она использует `multipart/form-data`.

`POST /api/auth/login` принимает логин и пароль, устанавливает cookie
и возвращает профиль с CSRF-токеном. `GET /api/auth/session` проверяет
вход и возвращает данные текущей сессии.
`POST /api/auth/logout` отзывает эту сессию и отключает MAX.
`POST /api/auth/password` меняет пароль после проверки текущего.

`GET /api/admin/users` возвращает профили пользователей без хешей паролей.
`POST /api/admin/users` создаёт пользователя.
`POST /api/admin/users/access` меняет доступ и отзывает сессии.
`POST /api/admin/users/password` сбрасывает пароль и отзывает сессии.
Все эти запросы доступны только администратору.

`GET /api/max` возвращает своё текущее подключение или `null`.
Если подключение сохранено, сервер восстанавливает его.
`GET /api/max/profile` возвращает сохранённые адреса и номер инстанса,
`connected` и `connectionId`, но не ключ GREEN-API.
Если профиля нет, возвращается `null`.

`POST /api/max/connect` принимает реквизиты GREEN-API и согласие владельца.
`POST /api/max/reconnect` подключает сохранённый инстанс по одному
`apiTokenInstance`. `POST /api/max/disconnect` отключает
своё подключение по `connectionId`.

`POST /api/max/chats` ищет получателя по номеру и открывает чат.
`POST /api/max/sync` обновляет чаты и контакты.
`POST /api/max/history` принимает `chatId`, `count` от 1 до 5000
и `refresh`. `POST /api/max/poll` получает одно уведомление,
обрабатывает и подтверждает его, затем возвращает состояние подключения.

`POST /api/max/send` отправляет текст. Можно передать
`quotedMessageId` для ответа с цитатой. `requestId` обозначает попытку:
повтор того же запроса не должен отправить второе сообщение.
`POST /api/max/upload` отправляет файл, подпись и необязательную цитату.
Для него также нужен `requestId`.

`POST /api/max/edit` изменяет свой известный исходящий текст.
`POST /api/max/delete` удаляет своё исходящее сообщение;
`onlySenderDelete` задаёт удаление только у отправителя.
`POST /api/max/forward` пересылает известное сообщение
в `targetChatId` и требует `requestId`.
`POST /api/max/reaction` ставит реакцию на известное сообщение.
`POST /api/max/read` отмечает свой чат прочитанным.

`GET /api/max/media` скачивает файл по `connectionId`, `chatId`
и `messageId`. Авторизация обязательна, но для обычной ссылки
заголовок `X-Max-Client` не требуется. Если ссылка провайдера отсутствует,
сервер запрашивает её через `downloadFile`. Просроченная ссылка
обновляется один раз. Перед этим проверяются владелец и сообщение.
Ответ содержит бинарный файл с типом `application/octet-stream`.

Владелец берётся из JWT. Поля `owner` и `userId` в теле не принимаются.
`connectionId` имеет формат UUID. `chatId` - строка с числовым ID,
включая отрицательные ID групп. `messageId` сохраняет ID провайдера.
`expiresAt=0` означает, что подключение MAX не имеет срока истечения.
Для известных контактов не нужно повторно искать номер телефона.

Редактирование сохраняет ID сообщения. После удаления клиент возвращает
обновлённое состояние, даже если провайдер ответил без тела.
Ссылка вложения остаётся на сервере. Браузер получает имя файла,
тип содержимого и данные о доступности, но не внешний адрес скачивания.

Официальная документация GREEN-API описывает
[отправку текста](https://green-api.com/v3/docs/api/sending/SendMessage/),
[загрузку файла](https://green-api.com/v3/docs/api/sending/SendFileByUpload/),
[историю](https://green-api.com/v3/docs/api/journals/GetChatHistory/),
[редактирование](https://green-api.com/v3/docs/api/service/EditMessage/)
и [удаление](https://green-api.com/v3/docs/api/service/DeleteMessage/).
Для остальных действий есть страницы
[пересылки](https://green-api.com/v3/docs/api/sending/ForwardMessages/),
[реакций](https://green-api.com/v3/docs/api/service/SendReaction/),
[отметки прочтения](https://green-api.com/v3/docs/api/marks/ReadChat/)
и [получения уведомлений](https://green-api.com/v3/docs/api/receiving/technology-http-api/).

Доступность действия зависит от аккаунта и настроек провайдера.
Клиент отправляет настоящий запрос и показывает ошибку при отказе.
Успех не подставляется вместо запроса.
