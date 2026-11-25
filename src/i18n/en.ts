import type { MessageKey, Plural } from '.'

/** English needs plural forms; everything else falls back to the key itself. */
export const en: Partial<Record<MessageKey, string | Plural>> = {
  "Deleting {n} items": { one: "Deleting {n} item", other: "Deleting {n} items" },
  "Moved {n} items to trash": { one: "Moved {n} item to trash", other: "Moved {n} items to trash" },
  "Restored {n} items": { one: "Restored {n} item", other: "Restored {n} items" },
  "Moved {n} items to “{target}”": { one: "Moved {n} item to “{target}”", other: "Moved {n} items to “{target}”" },
  "{n} items ready to move": { one: "{n} item ready to move", other: "{n} items ready to move" },
  "{n} files": { one: "{n} file", other: "{n} files" },
  "{n} results": { one: "{n} result", other: "{n} results" },
  "{n} folders": { one: "{n} folder", other: "{n} folders" },
  "{n} Discord messages": { one: "{n} Discord message", other: "{n} Discord messages" },
  "Move {n} items": { one: "Move {n} item", other: "Move {n} items" },
  "Delete {n} items forever?": { one: "Delete {n} item forever?", other: "Delete {n} items forever?" },
  "Imported {n} files from Disbox v1": { one: "Imported {n} file from Disbox v1", other: "Imported {n} files from Disbox v1" },
  "{n} items from {date}": { one: "{n} item from {date}", other: "{n} items from {date}" },
  "Uploading {n} items": { one: "Uploading {n} item", other: "Uploading {n} items" },
  "Transferring {n} items": { one: "Transferring {n} item", other: "Transferring {n} items" },
  "{n} transfers failed": { one: "{n} transfer failed", other: "{n} transfers failed" },
  "{n} lines": { one: "{n} line", other: "{n} lines" },
  "Import {n} files from Disbox v1": { one: "Import {n} file from Disbox v1", other: "Import {n} files from Disbox v1" },
  "{n} active links": { one: "{n} active link", other: "{n} active links" },
}
