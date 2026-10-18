// Local cache + incremental sync for a Firestore collection.
//
// WHY: the app used to download EVERY book (about 4,300 reads) each time it
// opened. Firebase's free plan allows 50,000 reads a day, so a few opens used
// the whole day. Now the library is saved on the phone:
//   * the app opens instantly from the saved copy
//   * a cheap count check (about 5 reads for 4,300 books) tells whether anything changed
//   * only NEW books are downloaded, and a narrow live listener delivers books added later
//   * a full re-download happens only when the data was wiped or the counts disagree
//
// This file has no Firebase / file-system imports (they are passed in as `deps`)
// so the logic can be tested in plain Node. sync.js wires in the real ones.
export function createSynced(name, idKey, deps) {
  let map = new Map();
  let lastSync = 0;
  let epoch = 0;
  let loaded = false;
  let stopped = false;
  let unsub = null;
  let onData = () => {};
  let saveTimer = null;

  const keyOf = (id, data) => String(data[idKey] ?? id);
  const emit = () => onData([...map.values()]);
  const maxCreated = () => { let m = 0; map.forEach((r) => { if ((r.createdAt ?? 0) > m) m = r.createdAt; }); return m; };

  async function save() {
    try { await deps.writeFile(name, JSON.stringify({ v: 1, lastSync, epoch, rows: [...map.values()] })); } catch (e) { /* cache is optional */ }
  }
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(save, 1500); };

  async function loadCache() {
    if (loaded) return map.size > 0;
    loaded = true;
    try {
      const txt = await deps.readFile(name);
      if (!txt) return false;
      const j = JSON.parse(txt);
      if (j.v !== 1 || !Array.isArray(j.rows)) return false;
      map = new Map(j.rows.map((r) => [String(r[idKey]), r]));
      lastSync = j.lastSync ?? 0;
      epoch = j.epoch ?? 0;
      return map.size > 0;
    } catch (e) { return false; }
  }

  async function fullReload(knownEpoch) {
    let e = knownEpoch;
    if (e === undefined && name === 'books') { try { e = await deps.getEpoch(); } catch (err) { e = undefined; } }
    const docs = await deps.getAll(name);
    map = new Map(docs.map((d) => [keyOf(d.id, d.data), d.data]));
    if (e !== undefined && e !== null) epoch = e;
    lastSync = Date.now();
    persist(); emit();
    return map.size;
  }

  async function incremental() {
    const docs = await deps.getSince(name, maxCreated());
    docs.forEach((d) => map.set(keyOf(d.id, d.data), d.data));
  }

  async function sync() {
    // 1) wiped / re-imported on another phone? (books only)
    let serverEpoch = null;
    if (name === 'books') { try { serverEpoch = await deps.getEpoch(); } catch (e) { serverEpoch = null; } }
    if (serverEpoch !== null && map.size && serverEpoch !== epoch) { await fullReload(serverEpoch); return; }

    // 2) compare counts (cheap aggregation query)
    let n = null;
    try { n = await deps.count(name); } catch (e) { n = null; }
    if (n === null) await incremental();                                   // cannot count: just fetch new ones
    else if ((!map.size && n > 0) || n < map.size) await fullReload(serverEpoch ?? undefined);
    else if (n > map.size) {
      await incremental();
      if (map.size !== n) await fullReload(serverEpoch ?? undefined);       // still different: be safe
    }
    if (serverEpoch !== null) epoch = serverEpoch;
    lastSync = Date.now();
    persist(); emit();
  }

  // Narrow live listener: only documents created at/after the newest saved one,
  // so it costs 1 read per NEW book instead of re-reading the library.
  function listen() {
    if (unsub) { unsub(); unsub = null; }
    if (stopped) return;
    unsub = deps.listen(name, maxCreated(), (changes) => {
      let changed = false;
      changes.forEach((c) => {
        const k = keyOf(c.id, c.data);
        if (c.type === 'removed') { if (map.delete(k)) changed = true; }
        else { map.set(k, c.data); changed = true; }
      });
      if (changed) { persist(); emit(); }
    });
  }

  return {
    loadCache: async () => { const had = await loadCache(); return had ? [...map.values()] : null; },
    async start(cb) {
      onData = cb; stopped = false;
      if (!loaded) await loadCache();
      emit();                                   // instant: show the saved copy
      try { await sync(); } catch (e) { /* offline: keep showing the saved copy */ }
      listen();
    },
    // save the phone copy right now (called when the app goes to the background)
    flush: async () => { clearTimeout(saveTimer); if (loaded) await save(); },
    stop() { stopped = true; if (unsub) { unsub(); unsub = null; } },
    async resync() { try { await sync(); } catch (e) { /* offline */ } listen(); },
    async fullReload() { const n = await fullReload(); listen(); return n; },
    // after "delete all books": forget everything and start clean
    async reset() {
      map = new Map(); lastSync = Date.now();
      try { epoch = name === 'books' ? await deps.getEpoch() : 0; } catch (e) { /* keep */ }
      await save(); emit(); listen();
    },
    info: () => ({ count: map.size, lastSync, epoch }),
  };
}
