import { test, expect } from "@playwright/test";
test("existing contacts, history, mobile navigation, replies and message status", async ({ page }, info) => {
  const session = { connectionId: "d72c3040-32e0-4f79-86d5-23d103cff213", account: "Демонстрационный аккаунт", idInstance: "3100000001", expiresAt: Date.now()+28800000, chats: [{id:"100",title:"Анна",type:"user"}], contacts: [{id:"100",title:"Анна",type:"user"},{id:"200",title:"Семья",type:"group"}], messages: [] as object[] };
  let sends = 0;
  await page.route("**/api/max**", async route => {
    const path = new URL(route.request().url()).pathname; let data: unknown = session;
    if (path.endsWith("/history")) session.messages=[{id:"hello",chatId:"100",direction:"incoming",text:"Привет! Существующая история на месте.",timestamp:Date.now()-60000}];
    if (path.endsWith("/send")) { sends++; const text=route.request().postDataJSON().text; const message={id:"reply",chatId:"100",direction:"outgoing",text,timestamp:Date.now(),status:"queued"};session.messages.push(message);data=message; }
    if (path.endsWith("/poll") && sends && session.messages.length===2) { Object.assign(session.messages[1],{status:"delivered"});session.messages.push({id:"received",chatId:"100",direction:"incoming",text:"Получила сообщение. Спасибо!",timestamp:Date.now()}); }
    await route.fulfill({json:{ok:true,data}});
  });
  await page.goto("/");
  await page.getByRole("tab", { name: /Контакты/ }).click();
  await page.getByLabel("Поиск чата или контакта").fill("Анна");
  await page.getByRole("button", { name: /Анна/ }).click();
  await expect(page.getByRole("log").getByText("Привет! Существующая история на месте.")).toBeVisible();
  await page.getByLabel("Сообщение в MAX").fill("Привет! Пишу через наш клиент Max.");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.getByText("Доставлено", { exact: true })).toBeVisible();
  await expect(page.getByRole("log").getByText("Получила сообщение. Спасибо!")).toBeVisible();
  expect(sends).toBe(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/${info.project.name}-chat.png`, fullPage: true });
  if (info.project.name === "mobile") { await page.getByLabel("Назад к чатам").click(); await expect(page.getByRole("tab", { name: /Контакты/ })).toBeVisible(); }
});
