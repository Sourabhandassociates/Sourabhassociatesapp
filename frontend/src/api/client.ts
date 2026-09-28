import axios from "axios";
import {
  getAuthState,
  setAuthState,
  clearAuthState,
} from "../context/authStorage";

// Backend API
export const api = axios.create({
  baseURL: "https://lavender-cat-108044.hostingersite.com/api",
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  const state = getAuthState();

  if (state?.accessToken) {
    config.headers.Authorization = `Bearer ${state.accessToken}`;
  }

  return config;
});

let refreshPromise: Promise<string | null> | null = null;

/**
 * Silent background refresh.
 */
async function refreshAccessToken(): Promise<string | null> {
  const state = getAuthState();

  if (!state?.sessionId || !state.actorType) return null;

  try {
    const res = await axios.post(
      "https://lavender-cat-108044.hostingersite.com/api/auth/refresh",
      {
        sessionId: state.sessionId,
        actorType: state.actorType,
      },
      {
        withCredentials: true,
      }
    );

    const updated = {
      ...state,
      accessToken: res.data.accessToken,
    };

    setAuthState(updated);

    return updated.accessToken;
  } catch {
    clearAuthState();
    return null;
  }
}

api.interceptors.response.use(
  (response) => response,

  async (error) => {
    const original = error.config;

    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;

      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(
          () => (refreshPromise = null)
        );
      }

      const newToken = await refreshPromise;

      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
        return api(original);
      }

      window.location.href = "/login";
    }

    return Promise.reject(error);
  }
);