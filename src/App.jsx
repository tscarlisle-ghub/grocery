import { useState, useRef, useEffect, useCallback } from 'react'
import { DEPARTMENTS, DEPT_ORDER, categorizeToDept, getDept } from './departments.js'
import { parseGroceryText } from './parser.js'
import { parseWithAI, getSuggestionsAI } from './aiParser.js'
import { getLocalSuggestions } from './suggestions.js'

const G = '#007749'
const CREAM = '#faf9f6'
const INK = '#1a1a1a'
const MUTED = '#6b7280'
const RULE = '#e5e7eb'
const STORAGE_KEY = 'publix-list-v1'
const HAS_AI = !!import.meta.env.VITE_ANTHROPIC_KEY

// ── Storage ───────────────────────────────────────────────────────────────────
function saveList(items, checked) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      items,
      checked: [...checked],
      savedAt: Date.now(),
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
  const [items, setItems] = useState([])
  const [input, setInput] = useState('')
  const [qty, setQty] = useState('1')
  const [note, setNote] = useState('')
  const [view, setView] = useState('aisle')
  const [checked, setChecked] = useState(new Set())
  const [editId, setEditId] = useState(null)
  const [editText, setEditText] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showSugg, setShowSugg] = useState(false)
  const [suggLoading, setSuggLoading] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importTab, setImportTab] = useState('paste')
  const [importPreview, setImportPreview] = useState(null)
  const [importLoading, setImportLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [saveStatus, setSaveStatus] = useState('')

  const inputRef = useRef(null)
  const suggBoxRef = useRef(null)
  const saveTimer = useRef(null)
  const aiSuggTimer = useRef(null)
  const debouncedInput = useDebounce(input, 200)

  // Load from localStorage on mount
  useEffect(() => {
    const data = loadList()
    if (data) { setItems(data.items); setChecked(data.checked) }
    setLoaded(true)
  }, [])

  // Auto-save on change
  useEffect(() => {
    if (!loaded) return
    setSaveStatus('saving')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveList(items, checked)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus(''), 1800)
    }, 600)
    return () => clearTimeout(saveTimer.current)
  }, [items, checked, loaded])

  // Autocomplete: local first, AI if key available (debounced)
  useEffect(() => {
    const q = debouncedInput.trim()
    if (q.length < 2) { setSuggestions([]); setShowSugg(false); return }

    const local = getLocalSuggestions(q)
    if (local.length > 0) {
      setSuggestions(local)
      setShowSugg(true)
    }

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

  // Close suggestions on outside click
  useEffect(() => {
    const h = e => { if (suggBoxRef.current && !suggBoxRef.current.contains(e.target)) setShowSugg(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addItem = (name = input, q = qty, n = note) => {
    const nm = name.trim()
    if (!nm) return
    setItems(p => [...p, {
      id: Date.now() + Math.random(),
      name: nm, qty: q || '1', note: (n || '').trim(),
      dept: categorizeToDept(nm), addedAt: Date.now(),
    }])
    setInput(''); setQty('1'); setNote(''); setSuggestions([]); setShowSugg(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const pickSugg = s => {
    setShowSugg(false); setSuggestions([])
    setItems(p => [...p, {
      id: Date.now() + Math.random(),
      name: s.name, qty: s.qty || '1', note: s.note || '',
      dept: categorizeToDept(s.name), addedAt: Date.now(),
    }])
    setInput(''); setQty('1'); setNote('')
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const parseImport = async () => {
    if (!importText.trim()) return
    setImportLoading(true)
    const parsed = HAS_AI ? await parseWithAI(importText) : parseGroceryText(importText)
    setImportLoading(false)
    const now = Date.now()
    setImportPreview(parsed.map((x, i) => ({
      ...x, id: now + i,
      dept: categorizeToDept(x.name),
      addedAt: now + i,
      keep: true,
    })))
  }

  const confirmImport = () => {
    setItems(p => [...p, ...importPreview.filter(x => x.keep).map(({ keep, ...item }) => item)])
    setImportText(''); setImportOpen(false); setImportPreview(null)
  }

  const togglePreview = id => setImportPreview(p => p.map(x => x.id === id ? { ...x, keep: !x.keep } : x))
  const closeImport = () => { setImportOpen(false); setImportText(''); setImportPreview(null) }

  const toggleCheck = id => setChecked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const deleteItem = id => { setItems(p => p.filter(i => i.id !== id)); setChecked(p => { const n = new Set(p); n.delete(id); return n }) }
  const saveEdit = id => { const nm = editText.trim(); if (nm) setItems(p => p.map(i => i.id === id ? { ...i, name: nm, dept: categorizeToDept(nm) } : i)); setEditId(null) }
  const clearChecked = () => { setItems(p => p.filter(i => !checked.has(i.id))); setChecked(new Set()) }
  const clearAll = () => { if (window.confirm('Clear entire list?')) { setItems([]); setChecked(new Set()) } }

  const total = items.length, done = checked.size
  const grouped = {}
  for (const item of items) { if (!grouped[item.dept]) grouped[item.dept] = []; grouped[item.dept].push(item) }

  if (!loaded) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:CREAM, fontFamily:'system-ui,sans-serif', color:MUTED }}>
      Loading…
    </div>
  )

  return (
    <div style={{ fontFamily:"'Georgia',serif", background:CREAM, minHeight:'100vh', paddingBottom:60 }}>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div style={{ background:G, padding:'18px 20px 14px', position:'sticky', top:0, zIndex:50 }}>
        <div style={{ maxWidth:580, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div>
            <div style={{ display:'flex', alignItems:'baseline', gap:10 }}>
              <span style={{ color:'#fff', fontSize:21, fontWeight:700, letterSpacing:'-0.2px' }}>Publix</span>
              <span style={{ color:'rgba(255,255,255,0.5)', fontSize:11, fontFamily:'system-ui,sans-serif', letterSpacing:'0.1em', textTransform:'uppercase' }}>Shopping List</span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:3 }}>
              {total > 0 && <span style={{ color:'rgba(255,255,255,0.65)', fontSize:12, fontFamily:'system-ui,sans-serif' }}>{done}/{total} · {total-done} remaining</span>}
              {saveStatus==='saving' && <span style={{ color:'rgba(255,255,255,0.4)', fontSize:11, fontFamily:'system-ui,sans-serif' }}>saving…</span>}
              {saveStatus==='saved'  && <span style={{ color:'rgba(255,255,255,0.55)', fontSize:11, fontFamily:'system-ui,sans-serif' }}>✓ saved</span>}
            </div>
          </div>
          <button onClick={() => setImportOpen(true)} style={{ background:'rgba(255,255,255,0.15)', border:'1px solid rgba(255,255,255,0.3)', borderRadius:6, color:'#fff', fontSize:12, fontFamily:'system-ui,sans-serif', padding:'6px 13px', cursor:'pointer', fontWeight:600 }}>
            ↓ Import
          </button>
        </div>
      </div>

      {/* ── Import modal ───────────────────────────────────────────────── */}
      {importOpen && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
          onClick={e => e.target===e.currentTarget && closeImport()}>
          <div style={{ background:'#fff', borderRadius:12, padding:24, width:'100%', maxWidth:500, boxShadow:'0 8px 40px rgba(0,0,0,0.2)', maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <span style={{ fontFamily:'system-ui,sans-serif', fontWeight:700, fontSize:16, color:INK }}>
                {importPreview ? `${importPreview.filter(x=>x.keep).length} items found` : 'Import Items'}
              </span>
              <button onClick={closeImport} style={{ background:'none', border:'none', fontSize:22, cursor:'pointer', color:MUTED, lineHeight:1, padding:0 }}>×</button>
            </div>

            {!importPreview && (<>
              <div style={{ display:'flex', background:'#f3f4f6', borderRadius:7, padding:3, marginBottom:14 }}>
                {[{id:'paste',label:'📋 Recipe / List'},{id:'text',label:'💬 Text Message'}].map(tab => (
                  <button key={tab.id} onClick={() => setImportTab(tab.id)} style={{ flex:1, padding:'7px 0', border:'none', borderRadius:5, fontFamily:'system-ui,sans-serif', fontSize:13, fontWeight:600, cursor:'pointer', background:importTab===tab.id?'#fff':'transparent', color:importTab===tab.id?G:MUTED, boxShadow:importTab===tab.id?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                    {tab.label}
                  </button>
                ))}
              </div>
              <p style={{ fontFamily:'system-ui,sans-serif', fontSize:13, color:MUTED, margin:'0 0 10px' }}>
                {importTab==='paste'
                  ? (HAS_AI ? 'Paste a recipe, ingredient list, or meal plan — AI will extract the items.' : 'Paste a recipe or ingredient list, one item per line.')
                  : (HAS_AI ? 'Paste a text conversation — AI reads casual language naturally.' : 'Paste a shopping note. Separate items with commas or new lines.')}
              </p>
              <textarea value={importText} onChange={e => setImportText(e.target.value)}
                placeholder={importTab==='paste'
                  ? '2 lbs chicken thighs\n1 can crushed tomatoes\nheavy cream, garlic, ginger\nbasmati rice, naan'
                  : "hey can you grab some things on the way home? we need milk, that sourdough from publix, salmon for dinner and don't forget the good olive oil 🙏"}
                rows={7} autoFocus
                style={{ width:'100%', boxSizing:'border-box', padding:'10px 13px', border:`1.5px solid ${RULE}`, borderRadius:7, fontSize:14, fontFamily:'system-ui,sans-serif', resize:'vertical', outline:'none', color:INK, lineHeight:1.5 }}
                onFocus={e => e.target.style.borderColor=G} onBlur={e => e.target.style.borderColor=RULE}
              />
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginTop:12 }}>
                <button onClick={closeImport} style={{ background:'none', border:`1px solid ${RULE}`, borderRadius:6, padding:'8px 16px', fontSize:14, fontFamily:'system-ui,sans-serif', cursor:'pointer', color:MUTED }}>Cancel</button>
                <button onClick={parseImport} disabled={importLoading || !importText.trim()} style={{ background:(!importLoading && importText.trim())?G:'#9ca3af', color:'#fff', border:'none', borderRadius:6, padding:'8px 22px', fontSize:14, fontFamily:'system-ui,sans-serif', fontWeight:600, cursor:(!importLoading && importText.trim())?'pointer':'default' }}>
                  {importLoading ? (HAS_AI ? 'AI parsing…' : 'Parsing…') : 'Parse →'}
                </button>
              </div>
            </>)}

            {importPreview && (<>
              {importPreview.length === 0 ? (
                <div style={{ fontFamily:'system-ui,sans-serif', fontSize:14, color:MUTED, padding:'20px 0', textAlign:'center' }}>
                  No items found. Try one item per line, or add more detail.
                  <br/><button onClick={() => setImportPreview(null)} style={{ marginTop:12, background:'none', border:`1px solid ${RULE}`, borderRadius:6, padding:'7px 16px', fontSize:13, cursor:'pointer', color:INK }}>← Back</button>
                </div>
              ) : (<>
                <p style={{ fontFamily:'system-ui,sans-serif', fontSize:13, color:MUTED, margin:'0 0 10px' }}>Uncheck anything you don't need.</p>
                <div style={{ borderRadius:7, border:`1px solid ${RULE}`, overflow:'hidden', marginBottom:14 }}>
                  {importPreview.map((item, i) => (
                    <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 12px', borderBottom:i<importPreview.length-1?`1px solid ${RULE}`:'none', background:item.keep?'#fff':'#f9fafb', opacity:item.keep?1:0.5 }}>
                      <button onClick={() => togglePreview(item.id)} style={{ width:18, height:18, borderRadius:3, border:`2px solid ${item.keep?G:'#d1d5db'}`, background:item.keep?G:'#fff', cursor:'pointer', flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>
                        {item.keep && <span style={{ color:'#fff', fontSize:10, fontWeight:700, lineHeight:1 }}>✓</span>}
                      </button>
                      <span style={{ fontSize:12, color:'#aaa' }}>{getDept(item.dept)?.icon}</span>
                      <span style={{ fontFamily:'system-ui,sans-serif', fontSize:14, color:INK, flex:1, textDecoration:item.keep?'none':'line-through' }}>{item.name}</span>
                      <span style={{ fontFamily:'system-ui,sans-serif', fontSize:12, color:G, fontWeight:600, whiteSpace:'nowrap' }}>{item.qty}</span>
                    </div>
                  ))}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <button onClick={() => setImportPreview(null)} style={{ background:'none', border:`1px solid ${RULE}`, borderRadius:6, padding:'8px 14px', fontSize:13, fontFamily:'system-ui,sans-serif', cursor:'pointer', color:MUTED }}>← Back</button>
                  <button onClick={confirmImport} disabled={!importPreview.some(x=>x.keep)} style={{ background:importPreview.some(x=>x.keep)?G:'#9ca3af', color:'#fff', border:'none', borderRadius:6, padding:'8px 22px', fontSize:14, fontFamily:'system-ui,sans-serif', fontWeight:600, cursor:importPreview.some(x=>x.keep)?'pointer':'default' }}>
                    Add {importPreview.filter(x=>x.keep).length} items →
                  </button>
                </div>
              </>)}
            </>)}
          </div>
        </div>
      )}

      {/* ── Main content ───────────────────────────────────────────────── */}
      <div style={{ maxWidth:580, margin:'0 auto', padding:'0 16px' }}>

        {/* Add item input */}
        <div style={{ position:'relative', marginTop:16 }} ref={suggBoxRef}>
          <div style={{ background:'#fff', border:`1px solid ${RULE}`, borderRadius:8, padding:14, boxShadow:'0 1px 3px rgba(0,0,0,0.05)' }}>
            <div style={{ display:'flex', gap:8, marginBottom:8 }}>
              <div style={{ position:'relative', flex:1 }}>
                <input ref={inputRef} value={input}
                  onChange={e => { setInput(e.target.value); setShowSugg(true) }}
                  onKeyDown={e => { if (e.key==='Enter') addItem(); if (e.key==='Escape') setShowSugg(false) }}
                  onFocus={e => { e.target.style.borderColor=G; if (suggestions.length>0) setShowSugg(true) }}
                  onBlur={e => e.target.style.borderColor=RULE}
                  placeholder="Start typing an item…" autoComplete="off"
                  style={{ width:'100%', boxSizing:'border-box', padding:'9px 12px', border:`1.5px solid ${RULE}`, borderRadius:6, fontSize:15, fontFamily:'system-ui,sans-serif', outline:'none', color:INK }}
                />
                {suggLoading && <div style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', width:13, height:13, borderRadius:'50%', border:`2px solid ${G}`, borderTopColor:'transparent', animation:'spin 0.7s linear infinite' }} />}
              </div>
              <input value={qty} onChange={e => setQty(e.target.value)} placeholder="Qty" title="Quantity"
                style={{ width:56, padding:'9px 6px', border:`1.5px solid ${RULE}`, borderRadius:6, fontSize:14, fontFamily:'system-ui,sans-serif', textAlign:'center', color:INK, outline:'none' }}
                onFocus={e => e.target.style.borderColor=G} onBlur={e => e.target.style.borderColor=RULE} />
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <input value={note} onChange={e => setNote(e.target.value)} onKeyDown={e => e.key==='Enter' && addItem()}
                placeholder="Note — brand, size, variety…"
                style={{ flex:1, padding:'7px 12px', border:`1.5px solid ${RULE}`, borderRadius:6, fontSize:13, fontFamily:'system-ui,sans-serif', color:MUTED, outline:'none' }}
                onFocus={e => e.target.style.borderColor=G} onBlur={e => e.target.style.borderColor=RULE} />
              <button onClick={() => addItem()} style={{ background:G, color:'#fff', border:'none', borderRadius:6, padding:'7px 18px', fontSize:14, fontFamily:'system-ui,sans-serif', fontWeight:600, cursor:'pointer' }}>Add</button>
            </div>
          </div>

          {/* Suggestions dropdown */}
          {showSugg && suggestions.length > 0 && (
            <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff', border:`1px solid ${RULE}`, borderRadius:8, boxShadow:'0 4px 20px rgba(0,0,0,0.12)', zIndex:100, overflow:'hidden' }}>
              {suggestions.map((s, i) => (
                <button key={i} onMouseDown={e => { e.preventDefault(); pickSugg(s) }}
                  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 14px', border:'none', borderBottom:i<suggestions.length-1?`1px solid ${RULE}`:'none', background:'#fff', cursor:'pointer', textAlign:'left' }}
                  onMouseEnter={e => e.currentTarget.style.background='#f0faf5'}
                  onMouseLeave={e => e.currentTarget.style.background='#fff'}>
                  <span style={{ fontSize:13, color:'#ccc' }}>{getDept(categorizeToDept(s.name))?.icon}</span>
                  <span style={{ fontFamily:'system-ui,sans-serif', fontSize:14, color:INK, flex:1 }}>{s.name}</span>
                  <span style={{ fontFamily:'system-ui,sans-serif', fontSize:12, color:G, fontWeight:600, whiteSpace:'nowrap' }}>{s.qty}</span>
                  {s.note && <span style={{ fontFamily:'system-ui,sans-serif', fontSize:11, color:MUTED, whiteSpace:'nowrap' }}>{s.note}</span>}
                </button>
              ))}
              <div style={{ padding:'4px 14px', fontSize:10, color:'#bbb', fontFamily:'system-ui,sans-serif', borderTop:`1px solid ${RULE}`, background:'#fafafa', letterSpacing:'0.05em' }}>
                {HAS_AI ? 'AI SUGGESTIONS' : 'SUGGESTIONS'} · CLICK TO ADD
              </div>
            </div>
          )}
        </div>

        {/* View controls */}
        {total > 0 && (
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:14, marginBottom:2 }}>
            <div style={{ display:'flex', background:'#e5e7eb', borderRadius:6, padding:2 }}>
              {[{v:'aisle',label:'By Aisle'},{v:'added',label:'As Added'}].map(({v,label}) => (
                <button key={v} onClick={() => setView(v)} style={{ padding:'5px 12px', border:'none', borderRadius:5, fontFamily:'system-ui,sans-serif', fontSize:12, fontWeight:600, letterSpacing:'0.04em', textTransform:'uppercase', cursor:'pointer', background:view===v?'#fff':'transparent', color:view===v?G:MUTED, boxShadow:view===v?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
                  {label}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', gap:12 }}>
              {done>0 && <button onClick={clearChecked} style={{ background:'none', border:'none', color:MUTED, fontSize:12, fontFamily:'system-ui,sans-serif', cursor:'pointer', textDecoration:'underline' }}>Remove checked ({done})</button>}
              <button onClick={clearAll} style={{ background:'none', border:'none', color:'#ef4444', fontSize:12, fontFamily:'system-ui,sans-serif', cursor:'pointer', textDecoration:'underline' }}>Clear all</button>
            </div>
          </div>
        )}

        {/* Empty state */}
        {total === 0 && (
          <div style={{ textAlign:'center', padding:'52px 0 0', color:MUTED }}>
            <div style={{ fontSize:36, marginBottom:10 }}>🛒</div>
            <div style={{ fontSize:15, fontFamily:'system-ui,sans-serif' }}>Your list is empty</div>
            <div style={{ fontSize:13, marginTop:6 }}>Type to search items, or tap <strong>Import</strong> for a recipe or text.</div>
          </div>
        )}

        {/* By aisle — Publix walk order */}
        {view==='aisle' && DEPT_ORDER.map(deptId => {
          const deptItems = grouped[deptId]
          if (!deptItems?.length) return null
          const dept = getDept(deptId)
          return (
            <div key={deptId} style={{ marginTop:20 }}>
              <div style={{ display:'flex', alignItems:'center', gap:7, borderBottom:`1.5px solid ${G}`, paddingBottom:5, marginBottom:3 }}>
                <span style={{ fontSize:15 }}>{dept.icon}</span>
                <span style={{ color:G, fontSize:11, fontFamily:'system-ui,sans-serif', fontWeight:700, letterSpacing:'0.09em', textTransform:'uppercase' }}>{dept.label}</span>
                <span style={{ color:'#ccc', fontSize:11 }}>·</span>
                <span style={{ color:'#bbb', fontSize:10, fontFamily:'system-ui,sans-serif', fontStyle:'italic' }}>{dept.sub}</span>
                <span style={{ marginLeft:'auto', color:MUTED, fontSize:11, fontFamily:'system-ui,sans-serif' }}>{deptItems.length}</span>
              </div>
              {deptItems.map(item => (
                <Row key={item.id} item={item} checked={checked.has(item.id)}
                  onCheck={toggleCheck} onDelete={deleteItem}
                  editId={editId} editText={editText}
                  setEditId={setEditId} setEditText={setEditText}
                  onSaveEdit={saveEdit} />
              ))}
            </div>
          )
        })}

        {/* As added */}
        {view==='added' && (
          <div style={{ marginTop:18 }}>
            {[...items].sort((a,b)=>a.addedAt-b.addedAt).map(item => (
              <Row key={item.id} item={item} checked={checked.has(item.id)}
                onCheck={toggleCheck} onDelete={deleteItem}
                editId={editId} editText={editText}
                setEditId={setEditId} setEditText={setEditText}
                onSaveEdit={saveEdit} />
            ))}
          </div>
        )}

        {/* Progress */}
        {total > 0 && (
          <>
            <div style={{ marginTop:28, background:'#e5e7eb', borderRadius:99, height:4, overflow:'hidden' }}>
              <div style={{ width:`${(done/total)*100}%`, height:'100%', background:G, borderRadius:99, transition:'width 0.3s ease' }} />
            </div>
            {done===total && (
              <div style={{ textAlign:'center', color:G, fontFamily:'system-ui,sans-serif', fontSize:14, fontWeight:600, marginTop:14 }}>
                ✓ All done — enjoy your groceries!
              </div>
            )}
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }`}</style>
    </div>
  )
}

// ── Row component ─────────────────────────────────────────────────────────────
function Row({ item, checked, onCheck, onDelete, editId, editText, setEditId, setEditText, onSaveEdit }) {
  const isEditing = editId === item.id
  return (
    <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'8px 0', borderBottom:`1px solid ${RULE}`, opacity:checked?0.4:1, transition:'opacity 0.2s' }}>
      <button onClick={() => onCheck(item.id)} style={{ width:20, height:20, borderRadius:4, border:`2px solid ${checked?G:'#d1d5db'}`, background:checked?G:'#fff', cursor:'pointer', flexShrink:0, marginTop:2, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.15s', padding:0 }}>
        {checked && <span style={{ color:'#fff', fontSize:11, fontWeight:700, lineHeight:1 }}>✓</span>}
      </button>
      <div style={{ flex:1, minWidth:0 }}>
        {isEditing ? (
          <input autoFocus value={editText} onChange={e => setEditText(e.target.value)}
            onKeyDown={e => { if (e.key==='Enter') onSaveEdit(item.id); if (e.key==='Escape') setEditId(null) }}
            onBlur={() => onSaveEdit(item.id)}
            style={{ width:'100%', fontSize:15, fontFamily:'system-ui,sans-serif', border:`1.5px solid ${G}`, borderRadius:4, padding:'2px 6px', outline:'none' }} />
        ) : (
          <span onDoubleClick={() => { setEditId(item.id); setEditText(item.name) }}
            style={{ fontSize:15, fontFamily:'system-ui,sans-serif', color:INK, textDecoration:checked?'line-through':'none', cursor:'text' }}>
            {item.qty!=='1' && <span style={{ color:G, fontWeight:600, marginRight:5 }}>{item.qty}</span>}
            {item.name}
          </span>
        )}
        {item.note && !isEditing && <div style={{ fontSize:11, color:MUTED, fontFamily:'system-ui,sans-serif', marginTop:1 }}>{item.note}</div>}
      </div>
      <button onClick={() => onDelete(item.id)} style={{ background:'none', border:'none', color:'#d1d5db', fontSize:18, cursor:'pointer', padding:'0 2px', lineHeight:1, flexShrink:0, marginTop:1 }}
        onMouseEnter={e => e.target.style.color='#ef4444'}
        onMouseLeave={e => e.target.style.color='#d1d5db'}>×</button>
    </div>
  )
}
