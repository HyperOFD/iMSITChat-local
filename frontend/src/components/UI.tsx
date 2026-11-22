import { AlertCircle, LockKeyhole, Mail } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Brand() {
  return (
    <div className="brand">
      <span className="logomark">
        <i />
        <b />
      </span>
      <span>
        iMSIT<span className="brand-light">Chat</span>
      </span>
    </div>
  );
}
export function ErrorBox({ message }: { message: string }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={17} />
      <span>{message}</span>
    </div>
  ) : null;
}
export function IconButton({
  label,
  children,
  ...attrs
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className="icon-btn"
      aria-label={label}
      title={label}
      {...attrs}
    >
      {children}
    </button>
  );
}
export function Avatar({ name }: { name: string }) {
  const tone = name.charCodeAt(0) % 4;
  return (
    <span aria-hidden="true" className={"avatar tone-" + tone}>
      {name.slice(0, 2).toUpperCase()}
    </span>
  );
}
export function Status({ online }: { online: boolean }) {
  return (
    <span className={"status " + (online ? "" : "offline")}>
      <i />
      {online ? "На связи" : "Подключение…"}
    </span>
  );
}

export function EmptyChat() {
  return (
    <section className="empty-detail">
      <div className="empty-mark">
        <Mail size={39} strokeWidth={1.4} />
      </div>
      <h2>Ваши сообщения</h2>
      <p>
        Выберите диалог или найдите собеседника,
        <br />
        чтобы начать переписку.
      </p>
      <span className="quiet-note">
        <LockKeyhole size={14} /> Личная переписка
      </span>
    </section>
  );
}
