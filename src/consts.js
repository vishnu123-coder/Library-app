// Shared constants (no Firebase imports, so they can also be unit-tested in Node).
export const CATS = { 'Novel': 'N', 'Story': 'S', 'Poem': 'P', 'Reference': 'R', 'Others': 'OT', "Children's literature": 'CL', 'Biography/Autobiography': 'B' };
export const LANGS = ['Malayalam', 'English', 'Hindi', 'Tamil', 'Arabic', 'Urdu', 'Other'];
export const DAY = 86400000;
// Largest Book ID / Category No the library will ever accept. Anything bigger
// (for example a 13-digit barcode read by mistake) is NOT a stock number and
// must never be written into the counters.
export const MAX_ID = 999999;
