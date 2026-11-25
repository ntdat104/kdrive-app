import { useEffect, useState } from 'react'
import { useParams } from 'react-router'
import { isWithin } from './lib/manifest'
import { useDrive } from './store/drive'

/** The folder the user is "in": the open folder, or the top of what they can see on virtual views. */
export function useCurrentFolderId() {
  const { folderId } = useParams()
  const rootId = useDrive((s) => s.access.rootId)
  const visible = useDrive((s) => Boolean(folderId && s.manifest && isWithin(s.manifest.nodes, folderId, rootId)))
  return folderId && visible ? folderId : rootId
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => matchMedia(query).matches)
  useEffect(() => {
    const mq = matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}
