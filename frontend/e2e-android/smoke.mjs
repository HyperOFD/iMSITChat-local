import { _android, chromium, expect } from "@playwright/test";

const origin = "http://127.0.0.1:18080";
const pkg = "ru.imsit.chat";
const serial = process.env.ANDROID_SERIAL;
if (!serial) throw new Error("Укажите ANDROID_SERIAL тестового устройства.");
const devices = await _android.devices();
const device = devices.find((item) => item.serial() === serial);
if (!device) throw new Error("Тестовое устройство не подключено.");

let browser;
async function androidPage() {
  const page = await (await device.webView({ pkg }, { timeout: 15000 })).page();
  if (new URL(page.url()).origin !== origin) {
    throw new Error("В настройках тестового приложения выберите " + origin);
  }
  page.setDefaultTimeout(10000);
  return page;
}
async function register(page, username) {
  await page.getByRole("link", { name: "Регистрация" }).click();
  await expect(page.getByRole("heading", { name: "Регистрация" })).toBeVisible();
  await page.getByLabel("Имя пользователя", { exact: true }).fill(username);
  await page.getByLabel("Пароль", { exact: true }).fill("Android QA " + suffix);
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByRole("heading", { name: "Диалоги" })).toBeVisible();
  await expect(page.getByText("На связи", { exact: true })).toBeVisible();
}
const suffix = Date.now().toString(36);
const phoneName = "android_" + suffix;
const webName = "desktop_" + suffix;
try {
  let phone = await androidPage();
  await phone.locator(".auth-card, .workspace").first().waitFor();
  if (await phone.getByText(/^@android_[a-z0-9]+$/).count()) {
    await phone.getByRole("button", { name: "Выйти" }).click();
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });
  const desktop = await browser.newPage();
  await desktop.goto(origin);
  await register(desktop, webName);
  await register(phone, phoneName);
  await phone.getByRole("button", { name: "Новый диалог" }).click();
  await phone.getByLabel("Поиск собеседника").fill(webName);
  await phone.getByRole("button", { name: webName, exact: true }).click();
  await phone.getByLabel("Текст сообщения").fill("Привет с Android");
  await phone.getByRole("button", { name: "Отправить сообщение" }).click();
  await desktop.getByRole("link", { name: new RegExp(phoneName) }).click();
  await expect(desktop.locator(".bubble p").last()).toHaveText(
    "Привет с Android",
  );
  await desktop.getByLabel("Текст сообщения").fill("Ответ с компьютера");
  await expect(phone.locator(".peer-activity")).toHaveText("Печатает…");
  await desktop.getByLabel("Текст сообщения").press("Enter");
  await expect(phone.locator(".bubble p").last()).toHaveText(
    "Ответ с компьютера",
  );
  const activity = desktop.locator(".peer-activity");
  await expect(activity).toHaveText("В сети");
  await device.shell("input keyevent KEYCODE_HOME");
  await expect(activity).toContainText("Был(а) в сети", { timeout: 10000 });
  await desktop.getByLabel("Текст сообщения").fill("Сообщение в фоне");
  await desktop.getByLabel("Текст сообщения").press("Enter");
  await device.shell("am start -f 0x10200000 -n ru.imsit.chat/.ChatActivity");
  await expect(activity).toHaveText("В сети", { timeout: 10000 });
  await expect(phone.locator(".bubble p").last()).toHaveText(
    "Сообщение в фоне",
  );
  await phone.getByRole("heading", { name: webName }).click();
  await device.shell("input keyevent KEYCODE_BACK");
  await expect(phone.getByRole("heading", { name: "Диалоги" })).toBeVisible();
  await device.shell("am force-stop ru.imsit.chat");
  await device.shell("am start -W -n ru.imsit.chat/.ChatActivity");
  phone = await androidPage();
  await expect(phone.getByText("@" + phoneName, { exact: true })).toBeVisible();
  await phone.getByRole("link", { name: new RegExp(webName) }).click();
  await expect(phone.locator(".bubble p")).toHaveCount(3);
  await phone.getByRole("button", { name: "Выйти" }).click();
  await expect(
    phone.getByRole("heading", { name: "Вход в аккаунт" }),
  ).toBeVisible();
  console.log(
    "Android ↔ браузер: регистрация, диалог, сообщения, набор, фон, возврат, системная навигация, сессия и выход проверены.",
  );
} finally {
  await browser?.close();
  await Promise.all(devices.map((item) => item.close()));
}
