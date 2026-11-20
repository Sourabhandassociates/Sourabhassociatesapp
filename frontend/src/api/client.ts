import axios from "axios";
import toast from "react-hot-toast";
import {
  getAuthState,
  setAuthState,
  clearAuthState,
} from "../context/authStorage";


/** Global CRUD notifications. All API mutations use this shared Axios instance,
 * so the same success/error feedback is applied throughout the application. */
function getMutationToast(method?: string, url?: string) {
  const normalizedMethod = (method || "").toLowerCase();
  const cleanUrl = (url || "").split("?")[0].replace(/\/+$/, "");

  if (!["post", "put", "patch", "delete"].includes(normalizedMethod)) return null;
  // These are workflow/auth actions, not user-facing create/edit/delete operations.
  if (/\/(auth|read|refresh|logout)(\/|$)/i.test(cleanUrl)) return null;

  const parts = cleanUrl.split("/").filter(Boolean);
  const rawEntity = parts[parts.length - (normalizedMethod === "post" ? 1 : 2)] || parts[parts.length - 1] || "Record";
  const entity = rawEntity.replace(/[-_]/g, " ").replace(/s$/i, "");
  const action = normalizedMethod === "post" ? "created" : normalizedMethod === "delete" ? "deleted" : "updated";
  return `${entity.charAt(0).toUpperCase()}${entity.slice(1)} ${action} successfully`;
}

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
  (response) => {
    const message = getMutationToast(response.config.method, response.config.url || "");
    if (message) toast.success(message);
    return response;
  },

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

    const message = getMutationToast(original?.method, original?.url || "");
    if (message) {
      const responseMessage = error.response?.data?.error;
      toast.error(typeof responseMessage === "string" ? responseMessage : "Unable to complete the action. Please try again.");
    }

    return Promise.reject(error);
  }
);