import { test, expect, type Page } from "@playwright/test";

async function signup(page: Page, name: string) {
  await page.goto("/#/register");
  await page.getByLabel("Имя пользователя", { exact: true }).fill(name);
  await page
    .getByLabel("Пароль", { exact: true })
    .fill("password for local E2E");
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByRole("heading", { name: "Диалоги" })).toBeVisible();
  await expect(page.getByText("На связи", { exact: true })).toBeVisible();
}
test("Два браузера, доставка, мобильная навигация, восстановление и черновик", async ({
  browser,
}) => {
  const alice = await browser.newContext({
    viewport: { width: 1280, height: 820 },
  });
  const bob = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const a = await alice.newPage(),
    b = await bob.newPage();
  const nameA = "alice_" + Date.now().toString(36),
    nameB = "bob_" + Date.now().toString(36);
  try {
    await signup(a, nameA);
    await signup(b, nameB);
    await a.getByRole("button", { name: "Новый диалог" }).click();
    await a.getByLabel("Поиск собеседника").fill(nameB);
    await a.getByRole("button", { name: nameB, exact: true }).click();
    const draft = a.getByLabel("Текст сообщения");
    await draft.fill("Привет из первого браузера!");
    await draft.press("Enter");
    await expect(a.locator(".bubble p")).toHaveCount(1);
    await b.getByRole("link", { name: new RegExp(nameA) }).click();
    await expect(b.locator(".bubble p")).toHaveText(
      "Привет из первого браузера!",
    );
    const status = a.locator(".chat-head .peer-activity");
    await expect(status).toHaveText("В сети");
    await b.getByLabel("Текст сообщения").fill("Ответ с телефона");
    await expect(status).toHaveText("Печатает…");
    await b.getByRole("button", { name: "Отправить сообщение" }).click();
    await expect(a.locator(".bubble p").last()).toHaveText("Ответ с телефона");
    await expect(a.locator(".bubble p")).toHaveCount(2);
    await expect(status).toHaveText("В сети");
    await a.route("**/api/dialogs/*/messages", (route) =>
      route.request().method() === "POST" ? route.abort() : route.continue(),
    );
    await draft.fill("Черновик");
    await draft.press("Enter");
    await expect(a.getByRole("alert")).toContainText("Нет связи");
    await expect(draft).toHaveValue("Черновик");
    await a.unroute("**/api/dialogs/*/messages");
    await bob.setOffline(true);
    await expect(b.getByText("Подключение…", { exact: true })).toBeVisible();
    await expect(status).toContainText(/в сети сегодня в \d{2}:\d{2}/);
    await draft.fill("Пока вы были офлайн");
    await draft.press("Enter");
    await bob.setOffline(false);
    await expect(b.getByText("На связи", { exact: true })).toBeVisible();
    await expect(b.locator(".bubble p").last()).toHaveText(
      "Пока вы были офлайн",
    );
    await expect(status).toHaveText("В сети");
    await b.reload();
    await expect(b.locator(".bubble p")).toHaveCount(3);
    expect(
      await b.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    await b.getByLabel("Назад к списку").click();
    await expect(b.getByRole("heading", { name: "Диалоги" })).toBeVisible();
    await b.getByRole("button", { name: "Выйти" }).click();
    await expect(
      b.getByRole("heading", { name: "Вход в аккаунт" }),
    ).toBeVisible();
  } finally {
    await alice.close();
    await bob.close();
  }
});
test("Ошибки входа и защищённый маршрут", async ({ page }) => {
  await page.goto("/#/admin");
  await expect(page).toHaveURL(/#\/login$/);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Введите имя");
  await page
    .getByLabel("Имя пользователя", { exact: true })
    .fill("unknown_" + Date.now());
  await page.getByLabel("Пароль", { exact: true }).fill("not a real password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(/Неверное имя/);
});

test("Порционная история сохраняет позицию чтения при новом сообщении", async ({
  browser,
}) => {
  const alice = await browser.newContext(),
    bob = await browser.newContext();
  try {
    const a = await alice.newPage(),
      b = await bob.newPage();
    const suffix = Date.now().toString(36);
    await signup(a, "read_" + suffix);
    await signup(b, "send_" + suffix);
    const peer = await (await b.request.get("/api/me")).json();
    const headers = {
      origin: "http://127.0.0.1:18080",
      "x-imsit-request": "1",
    };
    const dialog = await (
      await a.request.post("/api/dialogs", {
        headers,
        data: { peer_id: peer.id },
      })
    ).json();
    const path = "/api/dialogs/" + dialog.id + "/messages";
    for (let n = 1; n <= 43; n++) {
      const result = await b.request.post(path, {
        headers,
        data: { body: "Строка " + n },
      });
      expect(result.status()).toBe(201);
    }
    await a.goto("/#/dialogs/" + dialog.id);
    await expect(a.locator(".bubble p")).toHaveCount(40);
    const timeline = a.locator(".timeline");
    await timeline.evaluate((el) => (el.scrollTop = 0));
    await a.getByRole("button", { name: "Ранние сообщения" }).click();
    await expect(a.locator(".bubble p")).toHaveCount(43);
    const position = await timeline.evaluate((el) => el.scrollTop);
    await b.request.post(path, {
      headers,
      data: { body: "Новое сообщение во время чтения" },
    });
    const indicator = a.getByRole("button", { name: "Новые сообщения" });
    await expect(indicator).toBeVisible();
    expect(await timeline.evaluate((el) => el.scrollTop)).toBe(position);
    await indicator.click();
    await expect(a.locator(".bubble p").last()).toBeInViewport();
  } finally {
    await alice.close();
    await bob.close();
  }
});
