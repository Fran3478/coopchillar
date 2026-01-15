export type AutosaveOpts<T> = {
  key: string;
  collect: () => Promise<T> | T;
  apply?: (data: T) => void;
  onDirtyChange?: (dirty: boolean) => void;
  intervalMs?: number;
};

export function initAutosave<T>(opts: AutosaveOpts<T>) {
  let dirty = false;
  let timer: number | null = null;

  function setDirty(v = true) {
    dirty = v;
    opts.onDirtyChange?.(dirty);
    schedule();
  }
  async function run() {
    try {
      const data = await opts.collect();
      localStorage.setItem(opts.key, JSON.stringify({ t: Date.now(), data }));
      dirty = false;
      opts.onDirtyChange?.(dirty);
    } catch {}
  }
  function schedule() {
    if (timer) return;
    timer = window.setTimeout(() => { timer = null; run(); }, opts.intervalMs ?? 2000);
  }
  function clear() {
    localStorage.removeItem(opts.key);
    dirty = false;
    opts.onDirtyChange?.(dirty);
  }
  function load(): T | null {
    const raw = localStorage.getItem(opts.key);
    if (!raw) return null;
    try {
      const j = JSON.parse(raw);
      if (j && j.data) { opts.apply?.(j.data); return j.data as T; }
    } catch {}
    return null;
  }
  function isDirty() { return dirty; }

  return { setDirty, clear, load, isDirty };
}

export function bindBeforeUnload(isDirty: () => boolean) {
  window.addEventListener("beforeunload", (e) => {
    if (!isDirty()) return;
    e.preventDefault();
    e.returnValue = "";
  });
}
