import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Search, UsersRound } from "lucide-react";
import { api, explain, type Dialog, type Peer } from "../api/client";
import { Avatar, ErrorBox, IconButton } from "../components/UI";

export function People({
  onOpen,
  onBack,
}: {
  onOpen: (d: Dialog) => void;
  onBack: () => void;
}) {
  const [q, query] = useState(""),
    [rows, setRows] = useState<Peer[]>([]),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [working, work] = useState(false);
  useEffect(() => {
    let live = true;
    const term = q.trim();
    setRows([]);
    setError("");
    if (!term) {
      setStatus("Введите имя собеседника.");
      return;
    }
    if (!/^[A-Za-z0-9_]{1,32}$/.test(term)) {
      setStatus("Используйте латинские буквы, цифры и _.");
      return;
    }
    setStatus("Поиск…");
    const timer = setTimeout(() => {
      api<Peer[]>("/users?q=" + encodeURIComponent(term))
        .then((found) => {
          if (live) {
            setRows(found);
            setStatus(found.length ? "" : "Никого не найдено.");
          }
        })
        .catch((e) => {
          if (live) {
            setStatus("");
            setError(explain(e));
          }
        });
    }, 200);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);
  async function start(peer: Peer) {
    setError("");
    work(true);
    try {
      onOpen(await api<Dialog>("/dialogs", { peer_id: peer.id }));
    } catch (e) {
      setError(explain(e));
    } finally {
      work(false);
    }
  }
  return (
    <>
      <div className="side-title">
        <IconButton label="Вернуться к диалогам" onClick={onBack}>
          <ArrowLeft />
        </IconButton>
        <h2>Новый диалог</h2>
      </div>
      <label className="search-box">
        <Search size={17} />
        <input
          autoFocus
          aria-label="Поиск собеседника"
          placeholder="Имя собеседника"
          value={q}
          onChange={(e) => query(e.target.value)}
        />
      </label>
      <ErrorBox message={error} />
      {status && (
        <div className="side-empty" role="status">
          <UsersRound />
          {status}
        </div>
      )}
      {rows.map((p) => (
        <button
          className="person-row"
          key={p.id}
          onClick={() => start(p)}
          disabled={working}
        >
          <Avatar name={p.username} />
          <strong>{p.username}</strong>
          <ArrowUpRight size={16} />
        </button>
      ))}
    </>
  );
}
