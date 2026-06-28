import { useState, useRef, useEffect } from 'react'
import { DEPARTMENTS, DEPT_ORDER, categorizeToDept, getDept } from './departments.js'
import { parseGroceryText } from './parser.js'
import { parseWithAI, getSuggestionsAI } from './aiParser.js'
import { getLocalSuggestions } from './suggestions.js'

// ── Design tokens ─────────────────────────────────────────────────────────────
const T = {
  // Color
  paper:    '#faf8f4',
  ink:      '#1a1a18',
  green:    '#007749',
  greenDim: '#005a37',
  rule:     '#d6d0c4',
  ruleFine: '#e8e4dc',
  muted:    '#7a7468',
  ghost:    '#a89f94',
  tint:     '#f2efe8',

  // Type
  serif:      '"elido", "Georgia", serif',
  serifAlt:   '"urw-antiqua", "Georgia", serif',
  sans:       '"franklin-gothic-condensed", "Arial Narrow", sans-serif',
  sansWide:   '"franklin-gothic", "Arial", sans-serif',
  titling:    '"columbia-titling", "Georgia", serif',
  accent:     '"aviano-sans", "Arial", sans-serif',
}

const STORAGE_KEY = 'publix-list-v1'
const HAS_AI = !!import.meta.env.VITE_ANTHROPIC_KEY

// ── Storage ───────────────────────────────────────────────────────────────────
function saveList(items, checked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      items, checked: [...checked], savedAt: Date.now(),
    }))
  } catch (e) { console.warn('Save failed', e) }
}
function loadList() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    return { items: d.items ?? [], checked: new Set(d.checked ?? []) }
  } catch { return null }
}

// ── Archive (saved lists) ───────────────────────────────────────────────────────
const ARCHIVE_KEY = 'publix-saved-lists-v1'
function loadArchive() {
  try {
    const arr = JSON.parse(localStorage.getItem(ARCHIVE_KEY))
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}
function saveArchive(lists) {
  try { localStorage.setItem(ARCHIVE_KEY, JSON.stringify(lists)) }
  catch (e) { console.warn('Archive save failed', e) }
}
function formatDate(ts) {
  try {
    return new Date(ts).toLocaleString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
    })
  } catch { return '' }
}

// ── Debounce ──────────────────────────────────────────────────────────────────
function useDebounce(val, delay) {
  const [d, setD] = useState(val)
  useEffect(() => {
    const t = setTimeout(() => setD(val), delay)
    return () => clearTimeout(t)
  }, [val, delay])
  return d
}

// ═════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [items, setItems]           = useState([])
  const [input, setInput]           = useState('')
  const [qty, setQty]               = useState('1')
  const [note, setNote]             = useState('')
  const [view, setView]             = useState('aisle')
  const [checked, setChecked]       = useState(new Set())
  const [editId, setEditId]         = useState(null)
  const [editText, setEditText]     = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg]     = useState(false)
  const [suggLoading, setSuggLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importTab, setImportTab]   = useState('paste')
  const [importPreview, setImportPreview] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [loaded, setLoaded]         = useState(false)
  const [saveStatus, setSaveStatus] = useState('')
  const [savedLists, setSavedLists] = useState([])
  const [listsOpen, setListsOpen]   = useState(false)
  const [snapMsg, setSnapMsg]       = useState('')

  const inputRef    = useRef(null)
  const suggBoxRef  = useRef(null)
  const saveTimer   = useRef(null)
  const aiSuggTimer = useRef(null)
  const debouncedInput = useDebounce(input, 200)

  useEffect(() => {
    const data = loadList()
    if (data) { setItems(data.items); setChecked(data.checked) }
    setSavedLists(loadArchive())
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (!loaded) return
    setSaveStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveList(items, checked)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 2000)
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [items, checked, loaded])

  useEffect(() => {
    const q = debouncedInput.trim()
    if (q.length < 2) { setSuggestions([]); setShowSugg(false); return }
    const local = getLocalSuggestions(q)
    if (local.length > 0) { setSuggestions(local); setShowSugg(true) }
    if (HAS_AI) {
      clearTimeout(aiSuggTimer.current)
      aiSuggTimer.current = setTimeout(async () => {
        setSuggLoading(true)
        const ai = await getSuggestionsAI(q)
        if (ai.length > 0) { setSuggestions(ai); setShowSugg(true) }
        setSuggLoading(false)
      }, 500)
    }
  }, [debouncedInput])

  useEffect(() => {
    const h = e => { if (suggBoxRef.current && !suggBoxRef.current.contains(e.target)) setShowSugg(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addItem = (name = input, q = qty, n = note) => {
    const nm = name.trim(); if (!nm) return
    setItems(p => [...p, { id: Date.now() + Math.random(), name: nm, qty: q || '1', note: (n || '').trim(), dept: categorizeToDept(nm), addedAt: Date.now() }])
    setInput(''); setQty('1'); setNote(''); setSuggestions([]); setShowSugg(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const pickSugg = s => {
    setShowSugg(false); setSuggestions([])
    setItems(p => [...p, { id: Date.now() + Math.random(), name: s.name, qty: s.qty || '1', note: s.note || '', dept: categorizeToDept(s.name), addedAt: Date.now() }])
    setInput(''); setQty('1'); setNote('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const parseImport = async () => {
    if (!importText.trim()) return
    setImportLoading(true)
    const parsed = HAS_AI ? await parseWithAI(importText) : parseGroceryText(importText)
    setImportLoading(false)
    const now = Date.now()
    setImportPreview(parsed.map((x, i) => ({ ...x, id: now + i, dept: categorizeToDept(x.name), addedAt: now + i, keep: true })))
  }

  const confirmImport = () => {
    setItems(p => [...p, ...importPreview.filter(x => x.keep).map(({ keep, ...item }) => item)])
    setImportText(''); setImportOpen(false); setImportPreview(null)
  }

  const togglePreview  = id => setImportPreview(p => p.map(x => x.id === id ? { ...x, keep: !x.keep } : x))
  const closeImport    = () => { setImportOpen(false); setImportText(''); setImportPreview(null) }
  const toggleCheck    = id => setChecked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const deleteItem     = id => { setItems(p => p.filter(i => i.id !== id)); setChecked(p => { const n = new Set(p); n.delete(id); return n }) }
  const saveEdit       = id => { const nm = editText.trim(); if (nm) setItems(p => p.map(i => i.id === id ? { ...i, name: nm, dept: categorizeToDept(nm) } : i)); setEditId(null) }
  const clearChecked   = () => { setItems(p => p.filter(i => !checked.has(i.id))); setChecked(new Set()) }
  const clearAll       = () => { if (window.confirm('Clear entire list?')) { setItems([]); setChecked(new Set()) } }

  // ── Saved-list (archive) actions ──────────────────────────────────────────────
  const saveSnapshot = () => {
    if (items.length === 0) return
    const snap = { id: Date.now() + Math.random(), createdAt: Date.now(), items: items.map(i => ({ ...i })), checked: [...checked] }
    const next = [snap, ...savedLists]
    setSavedLists(next); saveArchive(next)
    setSnapMsg('saved'); setTimeout(() => setSnapMsg(''), 2400)
  }
  const newList = () => {
    if (items.length > 0 && !window.confirm('Start a new list? This clears the current items.\n\nTip: tap Save first to keep them in your archive.')) return
    setItems([]); setChecked(new Set()); setEditId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const loadSnapshot = snap => {
    if (items.length > 0 && !window.confirm('Replace your current list with this saved one?\n\nYour current items aren’t kept unless you saved them.')) return
    setItems((snap.items ?? []).map(i => ({ ...i })))
    setChecked(new Set(snap.checked ?? []))
    setListsOpen(false); setEditId(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const deleteSnapshot = id => {
    const next = savedLists.filter(s => s.id !== id)
    setSavedLists(next); saveArchive(next)
  }

  const total = items.length, done = checked.size
  const grouped = {}
  for (const item of items) { if (!grouped[item.dept]) grouped[item.dept] = []; grouped[item.dept].push(item) }

  if (!loaded) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background: T.paper, fontFamily: T.sans, color: T.muted, letterSpacing:'0.08em', fontSize:13 }}>
      LOADING
    </div>
  )

  return (
    <div style={{ background: T.paper, minHeight:'100vh', paddingBottom:80 }}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header style={{ borderBottom:`1.5px solid ${T.ink}`, padding:'20px 24px 14px', position:'sticky', top:0, background: T.paper, zIndex:50 }}>
        <div style={{ maxWidth:600, margin:'0 auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
            <div>
              {/* Wordmark */}
              <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
                <span style={{ fontFamily: T.titling, fontSize:26, fontWeight:400, letterSpacing:'0.12em', color: T.ink, textTransform:'uppercase' }}>Publix</span>
                <span style={{ fontFamily: T.sans, fontSize:10, letterSpacing:'0.2em', color: T.muted, textTransform:'uppercase', fontWeight:400 }}>Shopping List</span>
              </div>
              {/* Status line */}
              <div style={{ marginTop:4, height:16, display:'flex', alignItems:'center', gap:12 }}>
                {total > 0 && (
                  <span style={{ fontFamily: T.sans, fontSize:11, letterSpacing:'0.1em', color: T.muted }}>
                    {done} of {total} · {total - done} remaining
                  </span>
                )}
                {snapMsg === 'saved'     && <span style={{ fontFamily: T.sans, fontSize:10, letterSpacing:'0.1em', color: T.green }}>SAVED TO ARCHIVE</span>}
                {!snapMsg && saveStatus === 'saving' && <span style={{ fontFamily: T.sans, fontSize:10, letterSpacing:'0.1em', color: T.ghost }}>SAVING</span>}
                {!snapMsg && saveStatus === 'saved'  && <span style={{ fontFamily: T.sans, fontSize:10, letterSpacing:'0.1em', color: T.green }}>SAVED</span>}
              </div>
            </div>
            <button onClick={() => setImportOpen(true)}
              style={{ fontFamily: T.sans, fontSize:12, letterSpacing:'0.14em', textTransform:'uppercase', background:'none', border:`1px solid ${T.ink}`, color: T.ink, padding:'6px 14px', cursor:'pointer', flexShrink:0 }}>
              Import
            </button>
          </div>

          {/* Progress rule */}
          {total > 0 && (
            <div style={{ marginTop:12, height:1, background: T.ruleFine, position:'relative' }}>
              <div style={{ position:'absolute', top:0, left:0, height:'100%', width:`${(done/total)*100}%`, background: T.green, transition:'width 0.4s ease' }} />
            </div>
          )}

          {/* List toolbar: New / Save / Archive */}
          <div style={{ display:'flex', gap:8, marginTop:14, flexWrap:'wrap' }}>
            <button onClick={newList} disabled={total === 0}
              style={{ fontFamily: T.sans, fontSize:11, letterSpacing:'0.13em', textTransform:'uppercase', background:'none', border:`1px solid ${total === 0 ? T.rule : T.ink}`, color: total === 0 ? T.ghost : T.ink, padding:'6px 13px', cursor: total === 0 ? 'default' : 'pointer' }}>
              + New List
            </button>
            <button onClick={saveSnapshot} disabled={total === 0}
              style={{ fontFamily: T.sans, fontSize:11, letterSpacing:'0.13em', textTransform:'uppercase', background: total === 0 ? 'none' : T.green, border:`1px solid ${total === 0 ? T.rule : T.green}`, color: total === 0 ? T.ghost : '#fff', padding:'6px 16px', cursor: total === 0 ? 'default' : 'pointer' }}>
              Save
            </button>
            <button onClick={() => setListsOpen(true)}
              style={{ fontFamily: T.sans, fontSize:11, letterSpacing:'0.13em', textTransform:'uppercase', background:'none', border:`1px solid ${T.ink}`, color: T.ink, padding:'6px 13px', cursor:'pointer' }}>
              Archive{savedLists.length > 0 ? ` · ${savedLists.length}` : ''}
            </button>
          </div>
        </div>
      </header>

      {/* ── Import modal ───────────────────────────────────────────────────── */}
      {importOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(26,26,24,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => e.target === e.currentTarget && closeImport()}>
          <div style={{ background: T.paper, border:`1px solid ${T.rule}`, padding:28, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 48px rgba(0,0,0,0.18)' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:20, borderBottom:`1px solid ${T.rule}`, paddingBottom:14 }}>
              <span style={{ fontFamily: T.titling, fontSize:18, letterSpacing:'0.08em', textTransform:'uppercase', color: T.ink }}>
                {importPreview ? `${importPreview.filter(x=>x.keep).length} Items Found` : 'Import'}
              </span>
              <button onClick={closeImport} style={{ background:'none', border:'none', fontFamily: T.sans, fontSize:18, cursor:'pointer', color: T.ghost, lineHeight:1 }}>×</button>
            </div>

            {!importPreview && (<>
              {/* Tab row */}
              <div style={{ display:'flex', gap:0, marginBottom:18, borderBottom:`1px solid ${T.rule}` }}>
                {[{id:'paste', label:'Recipe / List'}, {id:'text', label:'Text Message'}].map(tab => (
                  <button key={tab.id} onClick={() => setImportTab(tab.id)}
                    style={{ flex:1, padding:'8px 0', border:'none', borderBottom: importTab===tab.id ? `2px solid ${T.ink}` : '2px solid transparent', background:'none', fontFamily: T.sans, fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer', color: importTab===tab.id ? T.ink : T.muted, marginBottom:-1 }}>
                    {tab.label}
                  </button>
                ))}
              </div>

              <p style={{ fontFamily: T.serifAlt, fontSize:14, color: T.muted, marginBottom:14, lineHeight:1.6, fontStyle:'italic' }}>
                {importTab === 'paste'
                  ? 'Paste a recipe, ingredient list, or meal plan.'
                  : 'Paste a text message — informal language is fine.'}
              </p>

              <textarea value={importText} onChange={e => setImportText(e.target.value)}
                placeholder={importTab === 'paste'
                  ? '2 lbs chicken thighs\n1 can crushed tomatoes\nheavy cream, garlic, ginger\nbasmati rice, naan'
                  : "hey can you grab some things? we need milk, that sourdough, salmon for dinner and don't forget the good olive oil"}
                rows={7} autoFocus
                style={{ width:'100%', padding:'12px 14px', border:`1px solid ${T.rule}`, background: T.tint, fontFamily: T.serif, fontSize:14, color: T.ink, resize:'vertical', outline:'none', lineHeight:1.6 }}
                onFocus={e => e.target.style.borderColor = T.ink}
                onBlur={e => e.target.style.borderColor = T.rule}
              />

              <div style={{ display:'flex', justifyContent:'flex-end', gap:12, marginTop:16 }}>
                <button onClick={closeImport}
                  style={{ fontFamily: T.sans, fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase', background:'none', border:`1px solid ${T.rule}`, color: T.muted, padding:'8px 16px', cursor:'pointer' }}>
                  Cancel
                </button>
                <button onClick={parseImport} disabled={importLoading || !importText.trim()}
                  style={{ fontFamily: T.sans, fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase', background: (!importLoading && importText.trim()) ? T.ink : T.rule, color: T.paper, border:'none', padding:'8px 20px', cursor: (!importLoading && importText.trim()) ? 'pointer' : 'default' }}>
                  {importLoading ? 'Parsing…' : 'Parse →'}
                </button>
              </div>
            </>)}

            {importPreview && (<>
              {importPreview.length === 0 ? (
                <div style={{ fontFamily: T.serifAlt, fontSize:14, color: T.muted, padding:'24px 0', textAlign:'center', fontStyle:'italic' }}>
                  No items found. Try one item per line.
                  <br/>
                  <button onClick={() => setImportPreview(null)}
                    style={{ marginTop:14, fontFamily: T.sans, fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', background:'none', border:`1px solid ${T.rule}`, color: T.ink, padding:'6px 14px', cursor:'pointer' }}>
                    ← Back
                  </button>
                </div>
              ) : (<>
                <p style={{ fontFamily: T.serifAlt, fontSize:13, color: T.muted, marginBottom:14, fontStyle:'italic' }}>Uncheck anything you don't need.</p>
                <div style={{ border:`1px solid ${T.rule}` }}>
                  {importPreview.map((item, i) => (
                    <div key={item.id}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 14px', borderBottom: i<importPreview.length-1 ? `1px solid ${T.ruleFine}` : 'none', background: item.keep ? T.paper : T.tint, opacity: item.keep ? 1 : 0.45 }}>
                      <Checkbox checked={item.keep} onChange={() => togglePreview(item.id)} />
                      <span style={{ fontSize:13, color: T.ghost }}>{getDept(item.dept)?.icon}</span>
                      <span style={{ fontFamily: T.serif, fontSize:14, color: T.ink, flex:1, textDecoration: item.keep ? 'none' : 'line-through' }}>{item.name}</span>
                      {item.qty !== '1' && <span style={{ fontFamily: T.accent, fontSize:11, letterSpacing:'0.08em', color: T.green }}>{item.qty}</span>}
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:16 }}>
                  <button onClick={() => setImportPreview(null)}
                    style={{ fontFamily: T.sans, fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', background:'none', border:`1px solid ${T.rule}`, color: T.muted, padding:'7px 14px', cursor:'pointer' }}>
                    ← Back
                  </button>
                  <button onClick={confirmImport} disabled={!importPreview.some(x=>x.keep)}
                    style={{ fontFamily: T.sans, fontSize:12, letterSpacing:'0.12em', textTransform:'uppercase', background: importPreview.some(x=>x.keep) ? T.ink : T.rule, color: T.paper, border:'none', padding:'8px 20px', cursor: importPreview.some(x=>x.keep) ? 'pointer' : 'default' }}>
                    Add {importPreview.filter(x=>x.keep).length} →
                  </button>
                </div>
              </>)}
            </>)}
          </div>
        </div>
      )}

      {/* ── Archive modal (saved lists) ────────────────────────────────────── */}
      {listsOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(26,26,24,0.6)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => e.target === e.currentTarget && setListsOpen(false)}>
          <div style={{ background: T.paper, border:`1px solid ${T.rule}`, padding:28, width:'100%', maxWidth:500, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 48px rgba(0,0,0,0.18)' }}>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:20, borderBottom:`1px solid ${T.rule}`, paddingBottom:14 }}>
              <span style={{ fontFamily: T.titling, fontSize:18, letterSpacing:'0.08em', textTransform:'uppercase', color: T.ink }}>
                List Archive
              </span>
              <button onClick={() => setListsOpen(false)} style={{ background:'none', border:'none', fontFamily: T.sans, fontSize:18, cursor:'pointer', color: T.ghost, lineHeight:1 }}>×</button>
            </div>

            {savedLists.length === 0 ? (
              <div style={{ fontFamily: T.serifAlt, fontSize:14, color: T.muted, padding:'24px 4px', textAlign:'center', fontStyle:'italic', lineHeight:1.6 }}>
                No saved lists yet.<br/>
                Build a list, then tap <span style={{ fontStyle:'normal', fontFamily:T.sans, fontSize:11, letterSpacing:'0.1em' }}>SAVE</span> to keep a dated copy here.
              </div>
            ) : (
              <div style={{ border:`1px solid ${T.rule}` }}>
                {savedLists.map((snap, i) => {
                  const names = (snap.items ?? []).map(it => it.name)
                  const preview = names.slice(0, 4).join(', ') + (names.length > 4 ? `, +${names.length - 4} more` : '')
                  return (
                    <div key={snap.id}
                      style={{ padding:'14px 16px', borderBottom: i<savedLists.length-1 ? `1px solid ${T.ruleFine}` : 'none' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', gap:12 }}>
                        <span style={{ fontFamily: T.titling, fontSize:15, letterSpacing:'0.04em', color: T.ink }}>
                          {formatDate(snap.createdAt)}
                        </span>
                        <span style={{ fontFamily: T.accent, fontSize:11, letterSpacing:'0.08em', color: T.green, flexShrink:0 }}>
                          {names.length} item{names.length === 1 ? '' : 's'}
                        </span>
                      </div>
                      <div style={{ fontFamily: T.serifAlt, fontSize:13, color: T.muted, fontStyle:'italic', marginTop:4, lineHeight:1.5 }}>
                        {preview || '—'}
                      </div>
                      <div style={{ display:'flex', gap:12, marginTop:10 }}>
                        <button onClick={() => loadSnapshot(snap)}
                          style={{ fontFamily: T.sans, fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', background: T.green, color:'#fff', border:'none', padding:'6px 16px', cursor:'pointer' }}>
                          Load
                        </button>
                        <button onClick={() => { if (window.confirm('Delete this saved list?')) deleteSnapshot(snap.id) }}
                          style={{ fontFamily: T.sans, fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', background:'none', border:`1px solid ${T.rule}`, color: T.muted, padding:'6px 14px', cursor:'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Main ───────────────────────────────────────────────────────────── */}
      <main style={{ maxWidth:600, margin:'0 auto', padding:'0 24px' }}>

        {/* Add item */}
        <div style={{ position:'relative', marginTop:20 }} ref={suggBoxRef}>
          <div style={{ border:`1px solid ${T.rule}`, background: T.paper }}>
            {/* Primary row */}
            <div style={{ display:'flex', borderBottom:`1px solid ${T.ruleFine}` }}>
              <input ref={inputRef} value={input}
                onChange={e => { setInput(e.target.value); setShowSugg(true) }}
                onKeyDown={e => { if (e.key==='Enter') addItem(); if (e.key==='Escape') setShowSugg(false) }}
                onFocus={e => { if (suggestions.length>0) setShowSugg(true); e.target.closest('div[data-box]') && (e.target.closest('div[data-box]').style.borderColor = T.ink) }}
                placeholder="Add an item…"
                autoComplete="off"
                style={{ flex:1, padding:'12px 14px', border:'none', background:'transparent', fontFamily: T.serif, fontSize:16, color: T.ink, outline:'none' }}
              />
              {/* Qty */}
              <div style={{ borderLeft:`1px solid ${T.ruleFine}`, display:'flex', alignItems:'center' }}>
                <input value={qty} onChange={e => setQty(e.target.value)}
                  placeholder="Qty"
                  style={{ width:58, padding:'12px 8px', border:'none', background:'transparent', fontFamily: T.accent, fontSize:13, letterSpacing:'0.06em', textAlign:'center', color: T.green, outline:'none' }}
                />
              </div>
            </div>
            {/* Note row + Add button */}
            <div style={{ display:'flex' }}>
              <input value={note} onChange={e => setNote(e.target.value)}
                onKeyDown={e => e.key==='Enter' && addItem()}
                placeholder="Brand, size, or variety…"
                style={{ flex:1, padding:'9px 14px', border:'none', background:'transparent', fontFamily: T.serifAlt, fontSize:13, color: T.muted, outline:'none', fontStyle:'italic' }}
              />
              <button onClick={() => addItem()}
                style={{ padding:'9px 20px', border:'none', borderLeft:`1px solid ${T.ruleFine}`, background: T.green, fontFamily: T.sans, fontSize:12, letterSpacing:'0.14em', textTransform:'uppercase', color:'#fff', cursor:'pointer' }}>
                Add
              </button>
            </div>
          </div>

          {/* Spinner */}
          {suggLoading && (
            <div style={{ position:'absolute', right:74, top:13, width:12, height:12, borderRadius:'50%', border:`1.5px solid ${T.green}`, borderTopColor:'transparent', animation:'spin 0.7s linear infinite' }} />
          )}

          {/* Suggestions */}
          {showSugg && suggestions.length > 0 && (
            <div style={{ position:'absolute', top:'calc(100% + 2px)', left:0, right:0, background: T.paper, border:`1px solid ${T.rule}`, boxShadow:'0 4px 24px rgba(0,0,0,0.1)', zIndex:100 }}>
              {suggestions.map((s, i) => (
                <button key={i} onMouseDown={e => { e.preventDefault(); pickSugg(s) }}
                  style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'10px 14px', border:'none', borderBottom: i<suggestions.length-1 ? `1px solid ${T.ruleFine}` : 'none', background:'transparent', cursor:'pointer', textAlign:'left' }}
                  onMouseEnter={e => e.currentTarget.style.background = T.tint}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <span style={{ fontSize:12, color: T.ghost, width:18 }}>{getDept(categorizeToDept(s.name))?.icon}</span>
                  <span style={{ fontFamily: T.serif, fontSize:15, color: T.ink, flex:1 }}>{s.name}</span>
                  {s.qty !== '1' && <span style={{ fontFamily: T.accent, fontSize:11, letterSpacing:'0.08em', color: T.green }}>{s.qty}</span>}
                  {s.note && <span style={{ fontFamily: T.serifAlt, fontSize:11, color: T.ghost, fontStyle:'italic' }}>{s.note}</span>}
                </button>
              ))}
              <div style={{ padding:'5px 14px', fontFamily: T.sans, fontSize:9, letterSpacing:'0.16em', color: T.ghost, borderTop:`1px solid ${T.ruleFine}`, background: T.tint }}>
                SUGGESTIONS — CLICK TO ADD
              </div>
            </div>
          )}
        </div>

        {/* View toggle + actions */}
        {total > 0 && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:20, marginBottom:4 }}>
            <div style={{ display:'flex', gap:0 }}>
              {[{v:'aisle',label:'By Aisle'},{v:'added',label:'As Added'}].map(({v,label},i) => (
                <button key={v} onClick={() => setView(v)}
                  style={{ padding:'5px 14px', border:`1px solid ${T.rule}`, borderLeft: i>0 ? 'none' : `1px solid ${T.rule}`, background: view===v ? T.ink : 'transparent', fontFamily: T.sans, fontSize:11, letterSpacing:'0.12em', textTransform:'uppercase', cursor:'pointer', color: view===v ? T.paper : T.muted }}>
                  {label}
                </button>
              ))}
            </div>
            <button onClick={clearAll}
              style={{ fontFamily: T.sans, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', background:'none', border:'none', color:'#c0392b', cursor:'pointer', textDecoration:'underline', textUnderlineOffset:3 }}>
              Clear all
            </button>
          </div>
        )}

        {/* Empty state */}
        {total === 0 && (
          <div style={{ marginTop:64, textAlign:'center' }}>
            <div style={{ fontFamily: T.titling, fontSize:13, letterSpacing:'0.2em', textTransform:'uppercase', color: T.ghost, marginBottom:10 }}>
              Your list is empty
            </div>
            <div style={{ fontFamily: T.serifAlt, fontSize:13, color: T.ghost, fontStyle:'italic' }}>
              Type above to search, or use Import for a recipe or text.
            </div>
          </div>
        )}

        {/* ── By aisle — Publix walk order (remaining only) ────────────────── */}
        {view === 'aisle' && DEPT_ORDER.map(deptId => {
          const deptItems = grouped[deptId]
          if (!deptItems?.length) return null
          const remaining = deptItems.filter(i => !checked.has(i.id))
          if (remaining.length === 0) return null
          const dept = getDept(deptId)
          return (
            <section key={deptId} style={{ marginTop:28 }}>
              {/* Department header */}
              <div style={{ display:'flex', alignItems:'baseline', gap:10, marginBottom:0 }}>
                <span style={{ fontFamily: T.sans, fontSize:12, fontWeight:600, letterSpacing:'0.18em', textTransform:'uppercase', color: T.green }}>
                  {dept.label}
                </span>
                <span style={{ fontFamily: T.serifAlt, fontSize:11, color: T.ghost, fontStyle:'italic', flex:1 }}>
                  {dept.sub}
                </span>
                <span style={{ fontFamily: T.accent, fontSize:10, letterSpacing:'0.08em', color: T.ghost }}>
                  {remaining.length}
                </span>
              </div>
              {/* Hairline rule */}
              <div style={{ height:1, background: T.green, marginBottom:2, marginTop:4, opacity:0.7 }} />

              {remaining.map(item => (
                <Row key={item.id} item={item} checked={false}
                  onCheck={toggleCheck} onDelete={deleteItem}
                  editId={editId} editText={editText}
                  setEditId={setEditId} setEditText={setEditText}
                  onSaveEdit={saveEdit} />
              ))}
            </section>
          )
        })}

        {/* ── As added (remaining only) ────────────────────────────────────── */}
        {view === 'added' && (() => {
          const remaining = [...items].filter(i => !checked.has(i.id)).sort((a,b)=>a.addedAt-b.addedAt)
          return (
            <div style={{ marginTop:20 }}>
              <div style={{ height:1, background: T.rule, marginBottom:2 }} />
              {remaining.length === 0
                ? <div style={{ fontFamily: T.serifAlt, fontSize:13, color: T.ghost, fontStyle:'italic', padding:'14px 0' }}>Nothing remaining — see Completed below.</div>
                : remaining.map(item => (
                    <Row key={item.id} item={item} checked={false}
                      onCheck={toggleCheck} onDelete={deleteItem}
                      editId={editId} editText={editText}
                      setEditId={setEditId} setEditText={setEditText}
                      onSaveEdit={saveEdit} />
                  ))}
            </div>
          )
        })()}

        {/* ── Completed section ────────────────────────────────────────────── */}
        {done > 0 && (
          <section style={{ marginTop:36 }}>
            <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
              <span style={{ fontFamily: T.sans, fontSize:12, fontWeight:600, letterSpacing:'0.18em', textTransform:'uppercase', color: T.ghost }}>
                Completed
              </span>
              <span style={{ fontFamily: T.serifAlt, fontSize:11, color: T.ghost, fontStyle:'italic', flex:1 }}>
                Tap the box to move an item back
              </span>
              <button onClick={clearChecked}
                style={{ fontFamily: T.sans, fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', background:'none', border:'none', color: T.muted, cursor:'pointer', textDecoration:'underline', textUnderlineOffset:3 }}>
                Clear {done}
              </button>
            </div>
            <div style={{ height:1, background: T.ruleFine, marginBottom:2, marginTop:4 }} />
            {[...items].filter(i => checked.has(i.id)).sort((a,b)=>a.addedAt-b.addedAt).map(item => (
              <Row key={item.id} item={item} checked={true}
                onCheck={toggleCheck} onDelete={deleteItem}
                editId={editId} editText={editText}
                setEditId={setEditId} setEditText={setEditText}
                onSaveEdit={saveEdit} />
            ))}
          </section>
        )}

        {/* All done message */}
        {done === total && total > 0 && (
          <div style={{ marginTop:32, textAlign:'center', fontFamily: T.titling, fontSize:13, letterSpacing:'0.2em', textTransform:'uppercase', color: T.green }}>
            All done
          </div>
        )}
      </main>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        ::placeholder { color: #a89f94; }
        * { -webkit-tap-highlight-color: transparent; }
      `}</style>
    </div>
  )
}

// ── Checkbox ──────────────────────────────────────────────────────────────────
function Checkbox({ checked, onChange }) {
  return (
    <button onClick={onChange}
      style={{ width:16, height:16, border:`1px solid ${checked ? '#007749' : '#d6d0c4'}`, background: checked ? '#007749' : 'transparent', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0, transition:'all 0.1s' }}>
      {checked && <span style={{ color:'#fff', fontSize:9, fontWeight:700, lineHeight:1, fontFamily:'"franklin-gothic-condensed",sans-serif' }}>✓</span>}
    </button>
  )
}

// ── Row ───────────────────────────────────────────────────────────────────────
function Row({ item, checked, onCheck, onDelete, editId, editText, setEditId, setEditText, onSaveEdit }) {
  const isEditing = editId === item.id
  const dept = getDept(item.dept)
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'9px 0', borderBottom:`1px solid ${T.ruleFine}`, opacity: checked ? 0.38 : 1, transition:'opacity 0.2s' }}>
      <div style={{ paddingTop:2 }}>
        <Checkbox checked={checked} onChange={() => onCheck(item.id)} />
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        {isEditing ? (
          <input autoFocus value={editText}
            onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') onSaveEdit(item.id); if (e.key==='Escape') setEditId(null) }}
            onBlur={() => onSaveEdit(item.id)}
            style={{ width:'100%', fontFamily: T.serif, fontSize:15, border:'none', borderBottom:`1.5px solid ${T.green}`, background:'transparent', outline:'none', color: T.ink, padding:'1px 0' }}
          />
        ) : (
          <span onDoubleClick={() => { setEditId(item.id); setEditText(item.name) }}
            style={{ fontFamily: T.serif, fontSize:15, color: T.ink, textDecoration: checked ? 'line-through' : 'none', cursor:'text', display:'block' }}>
            {item.qty !== '1' && (
              <span style={{ fontFamily: T.accent, fontSize:12, letterSpacing:'0.06em', color: T.green, marginRight:8 }}>{item.qty}</span>
            )}
            {item.name}
          </span>
        )}
        {item.note && !isEditing && (
          <span style={{ fontFamily: T.serifAlt, fontSize:12, color: T.ghost, fontStyle:'italic', display:'block', marginTop:1 }}>{item.note}</span>
        )}
      </div>
      {/* Dept icon — subtle right margin reference */}
      <span style={{ fontSize:12, color: T.ruleFine, paddingTop:2, flexShrink:0 }}>{dept?.icon}</span>
      <button onClick={() => onDelete(item.id)}
        style={{ background:'none', border:'none', color: T.ruleFine, fontSize:16, cursor:'pointer', padding:'0 2px', lineHeight:1, flexShrink:0, paddingTop:1 }}
        onMouseEnter={e => e.target.style.color = '#c0392b'}
        onMouseLeave={e => e.target.style.color = T.ruleFine}>
        ×
      </button>
    </div>
  )
}
