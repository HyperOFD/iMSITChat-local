import { ServerSettings } from "./components/ServerSettings";
import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/ibm-plex-mono/cyrillic-500.css";
import "./styles.css";
import { api, ApiError, explain, type User } from "./api/client";
import { Brand, ErrorBox } from "./components/UI";
import { Auth } from "./pages/Auth";
import { Workspace } from "./pages/Workspace";

function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [route, setRoute] = useState(location.hash.slice(1));
  function logout() {
    setUser(null);
    location.hash = "/login";
  }
  const restore = useCallback(async () => {
    setError("");
    setLoading(true);
    try {
      setUser(await api<User>("/me"));
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setError(explain(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void restore();
    const navigate = () => setRoute(location.hash.slice(1));
    window.addEventListener("hashchange", navigate);
    window.addEventListener("session-ended", logout);
    return () => {
      window.removeEventListener("hashchange", navigate);
      window.removeEventListener("session-ended", logout);
    };
  }, [restore]);
  useEffect(() => {
    if (loading || error) return;
    const allowed = user
      ? /^\/dialogs(?:\/\d+)?$/.test(route) ||
        route === "/new" ||
        (route === "/admin" && user.role === "admin")
      : ["/register", "/login"].includes(route);
    if (!allowed) location.replace("#" + (user ? "/dialogs" : "/login"));
  }, [route, user, loading, error]);
  if (loading || error)
    return (
      <div className="boot">
        <Brand />
        <ServerSettings />
        {error ? (
          <>
            <ErrorBox message={error} />
            <button className="secondary" onClick={restore}>
              Повторить
            </button>
          </>
        ) : (
          <p>Подключение…</p>
        )}
      </div>
    );
  return user ? (
    <Workspace key={user.id} user={user} route={route} onLogout={logout} />
  ) : (
    <Auth
      key={route === "/register" ? "register" : "login"}
      register={route === "/register"}
      onLogin={(u) => {
        setUser(u);
        location.hash = "/dialogs";
      }}
    />
  );
}
createRoot(document.getElementById("root")!).render(<App />);
