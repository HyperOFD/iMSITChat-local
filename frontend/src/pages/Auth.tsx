import { ServerSettings } from "../components/ServerSettings";
import { useState, useRef, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { api, ApiError, explain, type User } from "../api/client";
import { Brand, ErrorBox, IconButton } from "../components/UI";

export function Auth({
  register,
  onLogin,
}: {
  register: boolean;
  onLogin: (u: User) => void;
}) {
  const [name, setName] = useState(""),
    [password, setPassword] = useState(""),
    [visible, show] = useState(false);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const lock = useRef(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    if (!/^[A-Za-z0-9_]{3,32}$/.test(name.trim())) {
      setError("Введите имя из 3–32 латинских букв, цифр или знаков _.");
      return;
    }
    if (
      [...password].length < 8 ||
      [...password].length > 128 ||
      !password.trim()
    ) {
      setError("Введите пароль длиной от 8 до 128 символов.");
      return;
    }
    lock.current = true;
    setBusy(true);
    setError("");
    const credentials = { username: name.trim(), password };
    try {
      if (register) await api<User>("/register", credentials);
      onLogin(await api<User>("/login", credentials));
    } catch (reason) {
      setError(
        reason instanceof ApiError && reason.fields
          ? Object.values(reason.fields).join(" ")
          : explain(reason),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="auth-main">
      <section className="auth-card" aria-labelledby="auth-title">
        <Brand />
        <h1 id="auth-title">{register ? "Регистрация" : "Вход в аккаунт"}</h1>
        <form onSubmit={submit} noValidate>
          <label htmlFor="username">Имя пользователя</label>
          <div className="input-wrap">
            <input
              id="username"
              value={name}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          {register && <small>3–32 символа: латинские буквы, цифры и _.</small>}
          <label htmlFor="password">Пароль</label>
          <div className="input-wrap">
            <input
              id="password"
              type={visible ? "text" : "password"}
              placeholder={register ? "От 8 символов" : undefined}
              autoComplete={register ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <IconButton
              label={visible ? "Скрыть пароль" : "Показать пароль"}
              onClick={() => show(!visible)}
            >
              {visible ? <EyeOff size={17} /> : <Eye size={17} />}
            </IconButton>
          </div>
          <ErrorBox message={error} />
          <button disabled={busy} className="primary submit">
            {busy ? "Подождите…" : register ? "Создать аккаунт" : "Войти"}
          </button>
        </form>
        <p className="auth-switch">
          {register ? "Уже есть аккаунт?" : "Нет аккаунта?"}{" "}
          <a href={register ? "#/login" : "#/register"}>
            {register ? "Войти" : "Регистрация"}
          </a>
        </p>
        <ServerSettings />
      </section>
    </main>
  );
}
