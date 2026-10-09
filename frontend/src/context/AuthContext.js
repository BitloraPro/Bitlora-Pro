import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, apiError } from "@/lib/api";

const AuthContext = createContext(null);

async function fetchMe() {
  try {
    return (await api.get("/auth/me")).data;
  } catch (e) {
    if (e.response?.status !== 401) throw e;
    await api.post("/auth/refresh");
    return (await api.get("/auth/me")).data;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      setUser(await fetchMe());
    } catch (e) {
      if (e.response?.status !== 401) console.warn("Session check failed:", apiError(e));
      setUser(false);
    }
  }, []);

  useEffect(() => {
    localStorage.removeItem("bitlora_token");
    refresh();
  }, [refresh]);

  const applySession = (data) => {
    setUser(data.user);
    qc.invalidateQueries();
    return data.user;
  };

  const login = async (email, password, code) => applySession((await api.post("/auth/login", { email, password, code })).data);
  const register = async (name, email, password) => applySession((await api.post("/auth/register", { name, email, password })).data);
  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch (e) {
      console.warn("Logout request failed:", apiError(e));
    }
    setUser(false);
    qc.clear();
  };

  return <AuthContext.Provider value={{ user, login, register, logout, refresh }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
