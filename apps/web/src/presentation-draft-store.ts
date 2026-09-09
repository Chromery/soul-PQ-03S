import { useEffect, useSyncExternalStore } from "react";

type Changes = Record<string, string | null>;
type State = { overrides: Record<string, string>; loaded: boolean; status: "loading" | "saved" | "saving" | "error" };
const stores = new Map<string, DraftStore>();
const merge = (base: Record<string, string>, changes: Changes) => {
  const result = { ...base };
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) delete result[key]; else result[key] = value;
  }
  return result;
};

// Shared by preview, generator and study overview. Navigation cannot discard queued edits.
class DraftStore {
  state: State = { overrides: {}, loaded: false, status: "loading" };
  private saved: Record<string, string> = {};
  private pending: Changes = {};
  private sending: Changes = {};
  private listeners = new Set<() => void>();
  private started = false;
  private timer?: ReturnType<typeof setTimeout>;
  private request?: Promise<void>;
  constructor(private endpoint: string) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.state;
  private publish(status: State["status"], loaded = this.state.loaded) {
    this.state = { overrides: merge(merge(this.saved, this.sending), this.pending), loaded, status };
    this.listeners.forEach(listener => listener());
  }
  load = async () => {
    if (this.started) return;
    this.started = true;
    try {
      const response = await fetch(this.endpoint);
      if (!response.ok) throw new Error("Caricamento bozza non riuscito");
      const result = await response.json();
      this.saved = result?.overrides ?? {};
      this.publish("saved", true);
    } catch {
      this.started = false;
      this.publish("error");
    }
  };
  change = (changes: Changes) => {
    if (!this.state.loaded) return;
    this.pending = { ...this.pending, ...changes };
    this.publish("saving");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush(); }, 350);
  };
  flush = async (): Promise<boolean> => {
    clearTimeout(this.timer);
    if (!this.state.loaded) { await this.load(); return this.state.loaded; }
    if (this.request) { await this.request; return this.state.status === "error" ? false : this.flush(); }
    if (!Object.keys(this.pending).length) return this.state.status !== "error";
    this.sending = this.pending;
    this.pending = {};
    this.publish("saving");
    this.request = (async () => {
      try {
        const response = await fetch(this.endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ changes: this.sending }), keepalive: true });
        if (!response.ok) throw new Error("Salvataggio bozza non riuscito");
        const result = await response.json();
        this.saved = result.overrides;
        this.sending = {};
        this.publish(Object.keys(this.pending).length ? "saving" : "saved");
      } catch {
        this.pending = { ...this.sending, ...this.pending };
        this.sending = {};
        this.publish("error");
      }
    })();
    await this.request;
    this.request = undefined;
    if (this.state.status === "error") return false;
    return this.flush();
  };
}

if (typeof window !== "undefined") window.addEventListener("beforeunload", event => {
  if ([...stores.values()].some(store => store.state.loaded && store.state.status !== "saved")) {
    event.preventDefault(); event.returnValue = "";
  }
});

export function usePresentationDraftStore(endpoint: string) {
  let store = stores.get(endpoint);
  if (!store) { store = new DraftStore(endpoint); stores.set(endpoint, store); }
  const state = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => { void store.load(); }, [store]);
  return { ...state, change: store.change, flush: store.flush };
}
