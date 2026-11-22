import { ServerSettings } from "../components/ServerSettings";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  LogOut,
  Mail,
  MessageSquarePlus,
  Plus,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  api,
  clock,
  explain,
  type Dialog,
  type Message,
  type User,
} from "../api/client";
import {
  Avatar,
  Brand,
  EmptyChat,
  ErrorBox,
  IconButton,
  Status,
} from "../components/UI";
import { People } from "../features/People";
import { activityLabel } from "../features/activity";
import { useEvents } from "../features/useEvents";
import { Admin } from "./Admin";
import { Chat } from "./Chat";

export function Workspace({
  user,
  route,
  onLogout,
}: {
  user: User;
  route: string;
  onLogout: () => void;
}) {
  const [dialogs, setDialogs] = useState<Dialog[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [rev, setRev] = useState(0),
    [query, setQuery] = useState(""),
    [leaving, setLeaving] = useState(false);
  const listener = useRef<((m: Message) => void) | null>(null),
    drafts = useRef(new Map<number, string>()),
    fetchId = useRef(0);
  const rows = useRef(dialogs);
  rows.current = dialogs;
  const refresh = useCallback(async () => {
    const id = ++fetchId.current;
    try {
      const list = await api<Dialog[]>("/dialogs");
      if (id === fetchId.current)
        setDialogs((old) =>
          list
            .map((d) => {
              const prior = old.find((p) => p.id === d.id);
              return prior &&
                (prior.last_message?.id ?? 0) > (d.last_message?.id ?? 0)
                ? prior
                : d;
            })
            .sort(
              (a, b) =>
                (b.last_message?.id ?? 0) - (a.last_message?.id ?? 0) ||
                b.id - a.id,
            ),
        );
    } catch (e) {
      if (id === fetchId.current) setError(explain(e));
    } finally {
      if (id === fetchId.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    return () => {
      fetchId.current++;
    };
  }, [refresh]);
  const onMessage = (m: Message) => {
    listener.current?.(m);
    if (!rows.current.some((d) => d.id === m.dialog_id)) {
      void refresh();
      return;
    }
    setDialogs((old) =>
      old
        .map((d) =>
          d.id === m.dialog_id && (d.last_message?.id ?? 0) < m.id
            ? { ...d, last_message: m }
            : d,
        )
        .sort(
          (a, b) =>
            (b.last_message?.id ?? 0) - (a.last_message?.id ?? 0) ||
            b.id - a.id,
        ),
    );
  };
  const { online, activity, sendTyping } = useEvents(onMessage, () => {
    setError("");
    setRev((n) => n + 1);
    void refresh();
  });
  const searching = route === "/new",
    admin = route === "/admin" && user.role === "admin";
  const did = Number(route.match(/^\/dialogs\/(\d+)$/)?.[1]),
    selected = dialogs.find((d) => d.id === did);
  const filtered = dialogs.filter((d) =>
    d.peer.username.includes(query.trim().toLowerCase()),
  );
  async function leave() {
    setLeaving(true);
    try {
      await api("/logout", {});
      onLogout();
    } catch (e) {
      setError(explain(e));
      setLeaving(false);
    }
  }
  function open(d: Dialog) {
    fetchId.current++;
    setLoading(false);
    setDialogs((old) => [d, ...old.filter((x) => x.id !== d.id)]);
    setQuery("");
    location.hash = "/dialogs/" + d.id;
  }
  return (
    <div className="workspace">
      <header className="site-head">
        <Brand />
        <div className="head-actions">
          <Status online={online} />
          <ServerSettings compact />
          <span className="head-divider" />
          <span className="user-name">@{user.username}</span>
          {user.role === "admin" && (
            <a
              className="icon-btn"
              href="#/admin"
              title="Пользователи"
              aria-label="Пользователи"
            >
              <ShieldCheck size={19} />
            </a>
          )}
          <IconButton label="Выйти" onClick={leave} disabled={leaving}>
            <LogOut size={18} />
          </IconButton>
        </div>
      </header>
      {error && (
        <div className="workspace-error">
          <ErrorBox message={error} />
          <button
            className="text-link"
            onClick={() => {
              setError("");
              void refresh();
            }}
          >
            Повторить
          </button>
        </div>
      )}
      {admin ? (
        <Admin />
      ) : (
        <main className={"desk " + (did ? "detail-open" : "")}>
          <aside className="sidebar">
            {searching ? (
              <People
                onOpen={open}
                onBack={() => (location.hash = "/dialogs")}
              />
            ) : (
              <>
                <div className="side-title">
                  <h1>Диалоги</h1>
                  <button
                    className="add"
                    aria-label="Новый диалог"
                    title="Новый диалог"
                    onClick={() => (location.hash = "/new")}
                  >
                    <Plus size={20} />
                  </button>
                </div>
                <label className="search-box">
                  <Search size={17} />
                  <input
                    aria-label="Поиск по диалогам"
                    placeholder="Поиск по диалогам"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                {loading ? (
                  <p className="side-empty">Загрузка диалогов…</p>
                ) : filtered.length ? (
                  filtered.map((d) => (
                    <a
                      className={"dialog-row " + (did === d.id ? "active" : "")}
                      key={d.id}
                      href={"#/dialogs/" + d.id}
                    >
                      <span
                        className="peer-avatar"
                        title={activityLabel(activity[d.id])}
                      >
                        <Avatar name={d.peer.username} />
                        {activity[d.id]?.online && (
                          <i aria-label="В сети" role="img" />
                        )}
                      </span>
                      <div>
                        <strong>{d.peer.username}</strong>
                        <p
                          className={
                            activity[d.id]?.typing
                              ? "typing-preview"
                              : undefined
                          }
                        >
                          {activity[d.id]?.typing
                            ? "Печатает…"
                            : d.last_message
                              ? (d.last_message.sender_id === user.id
                                  ? "Вы: "
                                  : "") + d.last_message.body
                              : "Нет сообщений"}
                        </p>
                      </div>
                      {d.last_message && (
                        <time>{clock(d.last_message.created_at)}</time>
                      )}
                    </a>
                  ))
                ) : (
                  <div className="side-empty">
                    <Mail />
                    <strong>
                      {query ? "Диалоги не найдены" : "Пока нет диалогов"}
                    </strong>
                    {!query && (
                      <button
                        className="text-link"
                        onClick={() => (location.hash = "/new")}
                      >
                        <MessageSquarePlus size={15} /> Начать переписку
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </aside>
          {selected ? (
            <Chat
              key={selected.id}
              dialog={selected}
              user={user}
              revision={rev}
              activity={activity[selected.id]}
              sendTyping={sendTyping}
              listener={listener}
              drafts={drafts.current}
              onSaved={onMessage}
            />
          ) : did && !loading ? (
            <section className="empty-detail">
              <h2>Диалог недоступен</h2>
              <a className="text-link" href="#/dialogs">
                К списку диалогов
              </a>
            </section>
          ) : (
            <EmptyChat />
          )}
        </main>
      )}
    </div>
  );
}
