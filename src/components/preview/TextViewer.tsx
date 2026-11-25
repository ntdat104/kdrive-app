import { languages } from '@codemirror/language-data'
import CodeMirror, { EditorView, type Extension } from '@uiw/react-codemirror'
import DOMPurify from 'dompurify'
import { Code, Eye, Save, WrapText, X } from 'lucide-react'
import { marked } from 'marked'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { DriveNode } from '../../lib/manifest'
import { cn, errorMessage, formatSize } from '../../lib/utils'
import { useTransfers } from '../../store/transfers'
import { useUI } from '../../store/ui'
import { Button, Spinner } from '../ui/primitives'
import { t } from '../../i18n'

function useLanguage(name: string) {
  const [ext, setExt] = useState<Extension | null>(null)
  useEffect(() => {
    let alive = true
    const lang = LanguageDescriptionMatch(name)
    lang?.load().then((support) => alive && setExt(support))
    return () => {
      alive = false
    }
  }, [name])
  return ext
}

function LanguageDescriptionMatch(name: string) {
  const lower = name.toLowerCase()
  return languages.find((l) => l.filename?.test(lower)) ?? languages.find((l) => l.extensions.some((e) => lower.endsWith(`.${e}`)))
}

export default function TextViewer({ node, blob, markdown, editing }: { node: DriveNode; blob: Blob; markdown: boolean; editing: boolean }) {
  const [original, setOriginal] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [rendered, setRendered] = useState(markdown && !editing)
  const [wrap, setWrap] = useState(true)
  const [saving, setSaving] = useState(false)
  const lang = useLanguage(node.name)

  useEffect(() => {
    blob.text().then((t) => {
      setOriginal(t)
      setText(t)
    })
  }, [blob])

  useEffect(() => {
    if (editing) setRendered(false)
  }, [editing])

  const dirty = original !== null && text !== original

  const save = async () => {
    if (!dirty) return
    setSaving(true)
    try {
      await useTransfers.getState().replaceContent(node.id, new Blob([text], { type: node.mime || 'text/plain' }))
      setOriginal(text)
      toast.success(t('Saved {name}', { name: node.name }))
    } catch (err) {
      toast.error(t('Save failed'), { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const cancel = () => {
    if (dirty) {
      toast(t('Discard unsaved changes?'), {
        action: {
          label: t('Discard'),
          onClick: () => {
            setText(original ?? '')
            useUI.getState().setEditing(false)
          },
        },
      })
      return
    }
    useUI.getState().setEditing(false)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void save()
      }
      if (e.key === 'Escape' && editing) {
        e.stopPropagation()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  const html = useMemo(() => (rendered ? DOMPurify.sanitize(marked.parse(text, { async: false }) as string) : ''), [rendered, text])
  const extensions = useMemo(() => [...(lang ? [lang] : []), ...(wrap ? [EditorView.lineWrapping] : [])], [lang, wrap])

  if (original === null) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-8" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col px-2 pb-2 sm:px-6 sm:pb-6">
      <div className="mb-2 flex items-center gap-2">
        {markdown && (
          <div className="flex rounded-xl bg-white/10 p-0.5">
            <SegButton active={rendered} onClick={() => setRendered(true)}>
              <Eye className="size-4" /> {t('Preview')}
            </SegButton>
            <SegButton active={!rendered} onClick={() => setRendered(false)}>
              <Code className="size-4" /> {t('Source')}
            </SegButton>
          </div>
        )}
        {!rendered && (
          <button onClick={() => setWrap(!wrap)} className={cn('flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold', wrap ? 'bg-white/15 text-white' : 'text-white/60 hover:bg-white/10')}>
            <WrapText className="size-4" /> {t('Wrap')}
          </button>
        )}
        <span className="text-xs text-white/40">
          {t('{n} lines', { n: text.split('\n').length.toLocaleString() })} · {formatSize(new Blob([text]).size)}
        </span>
        {editing && (
          <div className="ml-auto flex items-center gap-2">
            {dirty && <span className="text-xs font-semibold text-brand-300">● {t('Unsaved')}</span>}
            <Button size="sm" className="border-white/10 bg-white/10 text-white hover:bg-white/20" onClick={cancel}>
              <X className="size-4" /> {t('Close editor')}
            </Button>
            <Button size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={() => void save()}>
              <Save className="size-4" /> {t('Save')}
            </Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10">
        {rendered ? (
          <div className="h-full overflow-y-auto bg-surface">
            <article className="prose-md mx-auto max-w-3xl px-6 py-10" dangerouslySetInnerHTML={{ __html: html }} />
          </div>
        ) : (
          <CodeMirror
            value={text}
            height="100%"
            className="h-full text-[13px] [&_.cm-editor]:h-full [&_.cm-scroller]:font-mono"
            theme="dark"
            readOnly={!editing}
            editable={editing}
            autoFocus={editing}
            extensions={extensions}
            onChange={setText}
            basicSetup={{ foldGutter: true, highlightActiveLine: editing, highlightActiveLineGutter: editing }}
          />
        )}
      </div>
    </div>
  )
}

function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn('flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-xs font-semibold transition', active ? 'bg-white text-stone-900' : 'text-white/70 hover:text-white')}
    >
      {children}
    </button>
  )
}
