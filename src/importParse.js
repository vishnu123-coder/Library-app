// Excel import parsing (pure functions - no Firebase - so they can be tested).
import { CATS, LANGS, MAX_ID } from './consts';

// returns the first non-empty value
const or = (...v) => { for (const a of v) { if (a) return a; } return v[v.length - 1]; };
// Letter after the dash in codes such as P-M, P-H, P-E, CL-M, CL-E
const LETTER_LANG = { m: 'Malayalam', e: 'English', h: 'Hindi', t: 'Tamil', a: 'Arabic', u: 'Urdu', o: 'Other' };
export function resolveLang(v) {
  const t = String(v ?? '').toLowerCase().trim();
  if (!t) return null;
  if (t.includes('മലയാളം')) return 'Malayalam';
  if (t.includes('ഇംഗ്ലീഷ്')) return 'English';
  if (t.includes('ഹിന്ദി')) return 'Hindi';
  if (t.includes('തമിഴ്')) return 'Tamil';
  const code = t.match(/^[a-z]{1,3}\s*[-/._ ]\s*([a-z])$/); // "p-m", "cl-e"
  if (code && LETTER_LANG[code[1]]) return LETTER_LANG[code[1]];
  if (t.length === 1 && LETTER_LANG[t]) return LETTER_LANG[t];
  return LANGS.find((l) => t.startsWith(l.toLowerCase().slice(0, 3))) ?? null;
}
const ALIAS = { novel: 'Novel', novels: 'Novel', story: 'Story', stories: 'Story', shortstory: 'Story', shortstories: 'Story', poem: 'Poem', poems: 'Poem', poetry: 'Poem',
  reference: 'Reference', references: 'Reference', other: 'Others', others: 'Others', children: "Children's literature", childrens: "Children's literature",
  childrensliterature: "Children's literature", childrenliterature: "Children's literature", biography: 'Biography/Autobiography', autobiography: 'Biography/Autobiography',
  biographyautobiography: 'Biography/Autobiography' };
export const CODE = Object.fromEntries(Object.entries(CATS).map(([k, v]) => [v.toLowerCase(), k]));
// Understands English names, codes (N, S, OT, CL ...) and Malayalam names (നോവൽ, കഥ, കവിത ...)
const has = (t, words) => words.some((w) => t.includes(w));
export function resolveCat(v) {
  const t = String(v ?? '').toLowerCase().trim();
  if (!t) return null;
  if (has(t, ['ആത്മകഥ', 'ജീവചരിത്ര', 'biograph'])) return 'Biography/Autobiography';
  if (has(t, ['ബാല', 'കുട്ടി', 'ശിശു', 'child'])) return "Children's literature";
  if (has(t, ['നോവ', 'novel'])) return 'Novel';
  if (has(t, ['കവിത', 'poem', 'poetry', 'kavitha'])) return 'Poem';
  if (has(t, ['റഫറ', 'നിഘണ്ടു', 'refer', 'dictionar'])) return 'Reference';
  if (has(t, ['കഥ', ' stor']) ? true : t.startsWith('stor')) return 'Story';
  if (has(t, ['മറ്റ്', 'മറ്റു', ' other']) ? true : t.startsWith('other')) return 'Others';
  const n = t.replace(/[^a-z]/g, '');
  if (ALIAS[n]) return ALIAS[n];
  const toks = t.split(/[^a-z]+/).filter(Boolean);
  for (const k of toks) if (ALIAS[k]) return ALIAS[k];
  for (const k of toks) if (CODE[k]) return CODE[k];
  return null;
}



const clean = (v) => String(v ?? '').trim();
export const keyOf = (k) => String(k).toLowerCase().replace(/[^a-z]/g, '');

// "P-M" / "CL-E" in the Category Type column -> the category the prefix stands for.
const codeOf = (v) => {
  const m = clean(v).match(/^([A-Za-z]{1,3})\s*[-/._ ]\s*[A-Za-z0-9]+$/);
  return m ? CODE[m[1].toLowerCase()] ?? null : null;
};
// A real stock number is a small whole number. A 13-digit barcode is NOT.
const toId = (v) => {
  const s = clean(v).replace(/\.0+$/, '');
  if (!/^\d{1,6}$/.test(s)) return null;
  const n = Number(s);
  return n > 0 && n <= MAX_ID ? n : null;
};
const toCost = (v) => {
  const n = parseFloat(clean(v).replace(/[^0-9.]/g, ''));
  return n > 0 ? n : 0;
};

// One Excel row -> { rec, id, catNo, ... }  or  { skip: 'blank' }.
// Understands the register layout:
//   Book Stock No: -> Book ID (the library's own stock number)
//   Book Category No: -> e.g. P-12  (category code + Category No)
//   Book ID -> barcode / accession number (long numbers are barcodes, not IDs)
//   Category Type -> language, written as P-M, CL-E ... or Malayalam / English
export function parseRow(raw, fb = {}) {
  const x = {};
  Object.keys(raw).forEach((k) => (x[keyOf(k)] = clean(raw[k])));

  const name = or(x.bookname, x.name, x.title, '');
  if (!name) return { skip: 'blank' };

  const rawCat = or(x.category, x.catagory, x.categoryname, x.cat, '');
  const cn = or(x.bookcategoryno, x.categoryno, x.catno, '');
  const m = cn.match(/^([A-Za-z]+)\s*[-/. ]?\s*(\d+)$/);
  const codeCat = m ? CODE[m[1].toLowerCase()] ?? null : null;

  const rawLang = or(x.language, x.categorytype, x.catagorytype, '');
  const lang = or(resolveLang(rawLang), fb.language, 'Other');
  const typeCat = codeOf(rawLang);

  // the printed label on the book (e.g. P-12) is the most reliable category
  const category = or(codeCat, resolveCat(rawCat), typeCat, fb.category, 'Others');

  const stockRaw = or(x.bookstockno, x.stockno, x.stocknumber, x.accessionno, x.accno, '');
  const idRaw = clean(x.bookid);
  let id = null;
  let barcode = clean(x.barcode);
  if (stockRaw) {
    id = toId(stockRaw);
    if (!barcode) barcode = idRaw;
  } else {
    id = toId(idRaw);
    if (id === null && !barcode) barcode = idRaw;
  }
  const catNo = codeCat && m ? parseInt(m[2], 10) : null;

  return {
    id,
    catNo: catNo && catNo <= MAX_ID ? catNo : null,
    rec: {
      barcode, category, language: lang, name,
      author: or(x.authorname, x.author, ''),
      publication: or(x.publishername, x.publicationsname, x.publicationname, x.publications, x.publication, x.publisher, x.press, ''),
      cost: toCost(or(x.cost, x.price, '')),
    },
    badLang: rawLang && !resolveLang(rawLang) ? rawLang : null,
    badCat: rawCat && !resolveCat(rawCat) && !codeCat ? rawCat : null,
  };
}

// Works out every Book ID / Category No for a whole import WITHOUT touching
// Firebase, so it is fast and testable.
//   items    : parseRow results (already filtered for blanks)
//   have     : Set of Book IDs (strings) already in the library
//   counters : { total, cats } currently stored
export function planImport({ items, have, counters }) {
  const existing = [], dupInFile = [], keep = [], auto = [];
  const seen = new Set();
  for (const it of items) {
    if (it.id) {
      const k = String(it.id);
      if (have.has(k)) { existing.push(it); continue; }
      if (seen.has(k)) { dupInFile.push(it); continue; }
      seen.add(k); keep.push(it);
    } else auto.push(it);
  }
  const cats = { ...(counters.cats ?? {}) };
  let total = counters.total ?? 0;
  const codeOfCat = (c) => CATS[c] ?? 'OT';

  // 1) numbers that come from the Excel are fixed - move the counters past them
  for (const it of keep) {
    const code = codeOfCat(it.rec.category);
    if (it.id > total) total = it.id;
    if (it.catNo) cats[code] = Math.max(cats[code] ?? 0, it.catNo);
  }
  const plan = [];
  // 2) kept IDs that have no usable Category No get the next one
  for (const it of keep) {
    const code = codeOfCat(it.rec.category);
    let no = it.catNo;
    if (!no) { cats[code] = (cats[code] ?? 0) + 1; no = cats[code]; }
    plan.push({ rec: it.rec, id: it.id, code, no });
  }
  // 3) rows with no number at all: allocate fresh ones after everything else
  let nid = total;
  for (const it of auto) {
    const code = codeOfCat(it.rec.category);
    do { nid += 1; } while (have.has(String(nid)) || seen.has(String(nid)));
    cats[code] = (cats[code] ?? 0) + 1;
    plan.push({ rec: it.rec, id: nid, code, no: cats[code] });
  }
  total = Math.max(total, nid);
  return { plan, existing, dupInFile, kept: keep.length, counters: { total, cats } };
}
