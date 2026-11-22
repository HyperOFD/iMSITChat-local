import { useEffect, useState } from "react";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { api, explain, type User } from "../api/client";
import { Avatar, ErrorBox } from "../components/UI";
export function Admin() {
  const [users, setUsers] = useState<User[]>([]),
    [error, setError] = useState(""),
    [more, setMore] = useState(true),
    [busy, setBusy] = useState(true);
  async function load(after: number) {
    setBusy(true);
    setError("");
    try {
      const rows = await api<User[]>("/admin/users?after=" + after);
      setUsers((old) => (after ? [...old, ...rows] : rows));
      setMore(rows.length === 50);
    } catch (e) {
      setError(explain(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    void load(0);
  }, []);
  return (
    <main className="admin">
      <a href="#/dialogs" className="text-link">
        <ArrowLeft size={17} /> К диалогам
      </a>
      <div className="admin-title">
        <ShieldCheck />
        <h1>Пользователи</h1>
      </div>
      <p className="subtitle">Учётные записи локального сервера и их роли.</p>
      <ErrorBox message={error} />
      <ul>
        {users.map((u) => (
          <li key={u.id}>
            <Avatar name={u.username} />
            <strong>{u.username}</strong>
            <span className="role">
              {u.role === "admin" ? "Администратор" : "Пользователь"}
            </span>
          </li>
        ))}
      </ul>
      {more && (
        <button
          className="secondary"
          disabled={busy}
          onClick={() => load(users.at(-1)?.id ?? 0)}
        >
          {busy ? "Загрузка…" : "Загрузить ещё"}
        </button>
      )}
    </main>
  );
}
