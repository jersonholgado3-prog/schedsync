/**
 * db-cache.js — In-memory session cache for Firestore collections.
 * Fetches each collection only ONCE per page load, then reuses the result.
 * Firestore's own IndexedDB persistence handles cross-page caching.
 */

import { getDocs, collection, query, where } from "https://www.gstatic.com/firebasejs/11.0.1/firebase-firestore.js";

const _cache = {};

async function _fetch(key, fetcher) {
  if (_cache[key]) return _cache[key];
  _cache[key] = await fetcher();
  return _cache[key];
}

/** All rooms */
export const getCachedRooms = (db) =>
  _fetch("rooms", async () => {
    const snap = await getDocs(collection(db, "rooms"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

/** All sections */
export const getCachedSections = (db) =>
  _fetch("sections", async () => {
    const snap = await getDocs(collection(db, "sections"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

/** All faculty (teachers + program heads + academic heads) — single query, client-side filter */
export const getCachedFaculty = (db) =>
  _fetch("faculty", async () => {
    const snap = await getDocs(collection(db, "users"));
    const facultyRoles = ["teacher", "program head", "head teacher", "academic_head"];
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(u => {
        const role = (u.role || "").toLowerCase();
        const roles = Array.isArray(u.roles) ? u.roles.map(r => r.toLowerCase()) : [];
        return facultyRoles.includes(role) || roles.some(r => facultyRoles.includes(r));
      });
  });

/** All courses */
export const getCachedCourses = (db) =>
  _fetch("courses", async () => {
    const snap = await getDocs(collection(db, "courses"));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  });

/** Invalidate a key when data changes (call after writes) */
export const invalidateCache = (key) => { delete _cache[key]; };
