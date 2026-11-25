import { useEffect, useRef } from 'react'
import { upload } from '../../actions'
import { itemsFromFileList } from '../../lib/dnd'

let target = 'root'
let filesInput: HTMLInputElement | null = null
let folderInput: HTMLInputElement | null = null

export function pickFiles(parentId: string) {
  target = parentId
  filesInput?.click()
}

export function pickFolder(parentId: string) {
  target = parentId
  folderInput?.click()
}

/** Hidden inputs behind the "Upload files/folder" actions. */
export function UploadInputs() {
  const files = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)

  useEffect(() => {
    filesInput = files.current
    folderInput = folder.current
    folder.current?.setAttribute('webkitdirectory', '')
    return () => {
      filesInput = null
      folderInput = null
    }
  }, [])

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) upload(itemsFromFileList(e.target.files), target)
    e.target.value = ''
  }

  return (
    <>
      <input ref={files} type="file" multiple hidden onChange={onChange} />
      <input ref={folder} type="file" multiple hidden onChange={onChange} />
    </>
  )
}
