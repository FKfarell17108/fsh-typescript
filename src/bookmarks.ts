import fs from "fs";
import path from "path";
import os from "os";

export type Bookmark = {
  id:     string;
  name:   string;
  fullPath: string;
  addedAt: number;
};

const BOOKMARK_FILE = path.join(os.homedir(), ".fsh_bookmarks.json");

let bookmarks: Bookmark[] = [];

function makeId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function persist(): void {
  try { fs.writeFileSync(BOOKMARK_FILE, JSON.stringify(bookmarks, null, 2), "utf8"); } catch {}
}

export function loadBookmarks(): void {
  try { bookmarks = JSON.parse(fs.readFileSync(BOOKMARK_FILE, "utf8")); }
  catch { bookmarks = []; }
}

export function getBookmarks(): Bookmark[] { return bookmarks; }

export function isBookmarked(fullPath: string): boolean {
  return bookmarks.some(b => b.fullPath === fullPath);
}

export function addBookmark(fullPath: string): Bookmark | null {
  if (isBookmarked(fullPath)) return null;
  const name = path.basename(fullPath) || fullPath;
  const bm: Bookmark = { id: makeId(), name, fullPath, addedAt: Date.now() };
  bookmarks.unshift(bm);
  persist();
  return bm;
}

export function removeBookmark(fullPath: string): boolean {
  const before = bookmarks.length;
  bookmarks = bookmarks.filter(b => b.fullPath !== fullPath);
  if (bookmarks.length !== before) { persist(); return true; }
  return false;
}

export function removeBookmarkById(id: string): boolean {
  const before = bookmarks.length;
  bookmarks = bookmarks.filter(b => b.id !== id);
  if (bookmarks.length !== before) { persist(); return true; }
  return false;
}

export function toggleBookmark(fullPath: string): "added" | "removed" {
  if (isBookmarked(fullPath)) { removeBookmark(fullPath); return "removed"; }
  addBookmark(fullPath); return "added";
}

export function homify(p: string): string {
  const home = process.env.HOME ?? "";
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}