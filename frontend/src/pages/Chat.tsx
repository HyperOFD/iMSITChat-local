import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  ArrowDown,
  ArrowLeft,
  CornerDownLeft,
  MailOpen,
  Send,
} from "lucide-react";
import {
  api,
  clock,
  dateLabel,
  explain,
  mergeMessages,
  type Dialog,
  type History,
  type Message,
  type User,
} from "../api/client";
import { Avatar, ErrorBox, IconButton } from "../components/UI";

import {
  activityLabel,
  useTyping,
  type Activity,
  type SendTyping,
} from "../features/activity";

interface Props {
  activity?: Activity;
  sendTyping: SendTyping;
  dialog: Dialog;
  user: User;
  revision: number;
  onSaved: (m: Message) => void;
  listener: RefObject<((m: Message) => void) | null>;
  drafts: Map<number, string>;
}
export function Chat({
  dialog,
  user,
  revision,
  activity,
  sendTyping,
  onSaved,
  listener,
  drafts,
}: Props) {
  const typing = useTyping(dialog.id, sendTyping);
  const [items, setItems] = useState<Message[]>([]),
    [more, setMore] = useState(false),
    [loading, setLoading] = useState(true),
    [older, setOlder] = useState(false);
  const [error, setError] = useState(""),
    [body, setBody] = useState(drafts.get(dialog.id) ?? ""),
    [sending, setSending] = useState(false),
    [unseen, setUnseen] = useState(false),
    [retry, setRetry] = useState(0);
  const scroll = useRef<HTMLDivElement>(null),
    follow = useRef(true),
    forceScroll = useRef(true),
    lock = useRef(false);
  const generation = useRef(0),
    arrivals = useRef<Message[]>([]),
    fetching = useRef(false);
  const anchor = useRef<{ id: number; top: number } | null>(null),
    draftBox = useRef<HTMLTextAreaElement>(null);
  const receive = useCallback(
    (msg: Message) => {
      if (msg.dialog_id !== dialog.id) return;
      if (fetching.current) arrivals.current.push(msg);
      if (msg.sender_id === user.id || follow.current)
        forceScroll.current = true;
      else setUnseen(true);
      setItems((old) => mergeMessages(old, [msg]));
    },
    [dialog.id, user.id],
  );
  useLayoutEffect(() => {
    listener.current = receive;
    return () => {
      listener.current = null;
    };
  }, [listener, receive]);
  useEffect(() => {
    let live = true;
    generation.current++;
    fetching.current = true;
    arrivals.current = [];
    setLoading(true);
    setError("");
    setOlder(false);
    api<History>("/dialogs/" + dialog.id + "/messages")
      .then((page) => {
        if (!live) return;
        const recent = mergeMessages(page.items, arrivals.current);
        setItems((old) => {
          if (
            !old.length ||
            !recent.length ||
            old[old.length - 1].id < recent[0].id
          )
            return recent;
          return mergeMessages(old, recent);
        });
        setMore(page.has_more);
        forceScroll.current = follow.current;
      })
      .catch((e) => {
        if (live) setError(explain(e));
      })
      .finally(() => {
        if (live) {
          fetching.current = false;
          setLoading(false);
        }
      });
    return () => {
      live = false;
      generation.current++;
    };
  }, [dialog.id, revision, retry]);
  useLayoutEffect(() => {
    const el = scroll.current;
    if (!el) return;
    if (anchor.current) {
      const target = el.querySelector('[data-mid="' + anchor.current.id + '"]');
      if (target)
        el.scrollTop += target.getBoundingClientRect().top - anchor.current.top;
      anchor.current = null;
    } else if (forceScroll.current) {
      el.scrollTop = el.scrollHeight;
      forceScroll.current = false;
      setUnseen(false);
    }
  }, [items]);
  async function previous() {
    if (!items.length || older) return;
    const gen = generation.current;
    setOlder(true);
    setError("");
    try {
      const first = items[0].id,
        page = await api<History>(
          "/dialogs/" + dialog.id + "/messages?before=" + first,
        );
      if (gen !== generation.current) return;
      const firstNode = scroll.current?.querySelector(
        '[data-mid="' + first + '"]',
      );
      if (firstNode)
        anchor.current = {
          id: first,
          top: firstNode.getBoundingClientRect().top,
        };
      setMore(page.has_more);
      setItems((old) => mergeMessages(page.items, old));
    } catch (e) {
      if (gen === generation.current) setError(explain(e));
    } finally {
      if (gen === generation.current) setOlder(false);
    }
  }
  async function send(e?: FormEvent) {
    e?.preventDefault();
    if (lock.current || !body.trim()) return;
    if ([...body].length > 4000) {
      setError("Сообщение длиннее 4000 символов.");
      return;
    }
    typing.stop();
    lock.current = true;
    setSending(true);
    setError("");
    try {
      const msg = await api<Message>("/dialogs/" + dialog.id + "/messages", {
        body,
      });
      onSaved(msg);
      drafts.delete(dialog.id);
      setBody("");
      draftBox.current?.focus();
    } catch (e) {
      setError(explain(e));
    } finally {
      lock.current = false;
      setSending(false);
    }
  }
  return (
    <section className="chat">
      <div className="chat-head">
        <span className="mobile-back">
          <IconButton
            label="Назад к списку"
            onClick={() => (location.hash = "/dialogs")}
          >
            <ArrowLeft />
          </IconButton>
        </span>
        <Avatar name={dialog.peer.username} />
        <div>
          <h2>{dialog.peer.username}</h2>
          <span
            className={"peer-activity" + (activity?.online ? " is-online" : "")}
            role="status"
          >
            {activity?.online && <i aria-hidden="true" />}
            {activityLabel(activity)}
          </span>
        </div>
      </div>
      <div
        className="timeline"
        ref={scroll}
        onScroll={() => {
          const el = scroll.current!;
          follow.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 75;
          if (follow.current) setUnseen(false);
        }}
      >
        {more && items.length > 0 && (
          <button
            className="history-btn"
            disabled={older || loading}
            onClick={previous}
          >
            {older ? "Загрузка…" : "Ранние сообщения"}
          </button>
        )}
        {loading && (
          <p className="center-info" role="status">
            Загрузка истории…
          </p>
        )}
        {!loading && !items.length && !error && (
          <div className="chat-start">
            <MailOpen size={32} />
            <h3>Начало диалога</h3>
            <p>Напишите первое сообщение.</p>
          </div>
        )}
        {items.map((m, i) => {
          const own = m.sender_id === user.id,
            day = dateLabel(m.created_at);
          return (
            <div key={m.id} data-mid={m.id}>
              {(i === 0 || dateLabel(items[i - 1].created_at) !== day) && (
                <div className="day">
                  <span>{day}</span>
                </div>
              )}
              <div className={"message " + (own ? "own" : "incoming")}>
                <div className="bubble">
                  <span className="message-who">
                    {own ? "Вы" : dialog.peer.username}
                  </span>
                  <p>{m.body}</p>
                  <time
                    dateTime={m.created_at}
                    title={new Date(m.created_at).toLocaleString("ru-RU")}
                  >
                    {clock(m.created_at)}
                  </time>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {unseen && (
        <button
          className="new-messages"
          onClick={() => {
            scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
            setUnseen(false);
          }}
        >
          <ArrowDown size={15} /> Новые сообщения
        </button>
      )}
      <div className="composer">
        <ErrorBox message={error} />
        {error && !items.length && (
          <button className="text-link" onClick={() => setRetry((n) => n + 1)}>
            Обновить историю
          </button>
        )}
        <form onSubmit={send}>
          <textarea
            ref={draftBox}
            aria-label="Текст сообщения"
            placeholder="Напишите сообщение…"
            rows={2}
            readOnly={sending}
            value={body}
            onBlur={typing.stop}
            onChange={(e) => {
              typing.change(e.target.value);
              setBody(e.target.value);
              drafts.set(dialog.id, e.target.value);
            }}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                !e.shiftKey &&
                !e.nativeEvent.isComposing
              ) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="send"
            aria-label="Отправить сообщение"
            disabled={sending || !body.trim() || [...body].length > 4000}
          >
            <Send size={18} />
          </button>
        </form>
        <div className="composer-hint">
          <span>
            <CornerDownLeft size={12} /> Enter — отправить · Shift + Enter —
            новая строка
          </span>
          <span className={Array.from(body).length > 4000 ? "invalid" : ""}>
            {Array.from(body).length} / 4000
          </span>
        </div>
      </div>
    </section>
  );
}
