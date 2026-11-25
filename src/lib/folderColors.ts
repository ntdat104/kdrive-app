import type { CSSProperties } from 'react'
import { ACCENTS } from './accents'

/** Folder colors reuse the accent palette. A node without `color` follows the current accent. */
export const FOLDER_COLORS = ACCENTS
export type FolderColor = (typeof ACCENTS)[number]['value']

/** The folder's color as a hex value, or undefined when it follows the app accent. */
export function folderSwatch(color: string | undefined) {
  return ACCENTS.find((a) => a.value === color)?.swatch
}

/** Icon color + soft background for a colored folder, or undefined for the default accent tone. */
export function folderToneStyle(color: string | undefined): CSSProperties | undefined {
  const swatch = folderSwatch(color)
  return swatch ? { color: swatch, backgroundColor: `color-mix(in srgb, ${swatch} 12%, transparent)` } : undefined
}

/** Picks a color for a new folder: the one least used by its sibling folders, ties broken at random. */
export function pickFolderColor(siblingColors: (string | undefined)[]): FolderColor {
  const counts = new Map<FolderColor, number>(ACCENTS.map((a) => [a.value, 0]))
  for (const c of siblingColors) if (counts.has(c as FolderColor)) counts.set(c as FolderColor, counts.get(c as FolderColor)! + 1)
  const min = Math.min(...counts.values())
  const candidates = [...counts].filter(([, n]) => n === min).map(([c]) => c)
  return candidates[Math.floor(Math.random() * candidates.length)]
}
