const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const esc = (value) => String(value ?? "");
const API = "/api";
const storedRunId = (() => { try { return localStorage.getItem("figjamWorkflowSelectedRun"); } catch { return null; } })();
const state = {
  board:null, settings:null, inputs:[], runs:[], selectedRunId:storedRunId, selectedRun:null,
  selectedNode:null, activeView:location.hash.slice(1) || "board", boardScale:1, panX:0, panY:0,
  activeSection:null, pollTimer:null, toastTimer:null, nodesFiltered:[], imageData:null,
  viewportInitialized:false, expandedStages:new Set(), busyActions:new Set()
};

function node(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined && text !== null) el.textContent = text;
  return el;
}
function setText(selector, value) { const el = $(selector); if (el) el.textContent = esc(value); }
function attr(el, name, value) { if (value !== undefined && value !== null) el.setAttribute(name, String(value)); }
async function request(path, options = {}) {
  const config = { ...options, headers:{ ...(options.body ? {"Content-Type":"application/json"} : {}), ...(options.headers || {}) } };
  let response;
  try { response = await fetch(`${API}${path}`, config); }
  catch { setText("#connection-label","Workspace unreachable"); throw new Error("Could not reach the local workflow server. Check that it is running, then try again."); }
  setText("#connection-label","Workspace connected");
  const type = response.headers.get("content-type") || "";
  const payload = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(payload && typeof payload === "object" ? payload.error || `Request failed (${response.status})` : `Request failed (${response.status})`);
  return payload;
}
function toast(message, isError = false) {
  const el = $("#global-message");
  el.textContent = message;
  el.className = `global-message visible${isError ? " error" : ""}`;
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => { el.className = "global-message"; }, 4200);
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"});
}
function niceStatus(status) { return String(status || "unknown").replaceAll("_"," "); }
function textPreview(value, max=220) { const txt=String(value||"").trim(); return txt.length>max ? `${txt.slice(0,max)}…` : txt; }
function showView(view, {updateHash=true} = {}) {
  const allowed=["board","inputs","runs","settings"];
  if (!allowed.includes(view)) view="board";
  state.activeView=view;
  $$(".view").forEach(el => el.classList.toggle("is-visible",el.id===`view-${view}`));
  $$(".nav-item").forEach(el => el.classList.toggle("active",el.dataset.view===view));
  if (updateHash && location.hash !== `#${view}`) history.replaceState(null,"",`#${view}`);
}
function bindNavigation() {
  $$(".nav-item,[data-view]").forEach(link => link.addEventListener("click", event => {
    event.preventDefault(); const view=link.dataset.view; showView(view); if(view==="runs") loadRuns();
  }));
  window.addEventListener("hashchange",()=>showView(location.hash.slice(1),{updateHash:false}));
}
function updateCounters() {
  const count=state.board?.nodes?.filter(n=>n.executable).length ?? "—";
  setText("#stage-count",`${count} stages`); setText("#nav-stage-count",count);
  setText("#board-node-count",state.board?.nodes?.length ?? "—");
  setText("#nav-input-count",state.inputs.length); setText("#input-count",state.inputs.length);
  setText("#nav-run-count",state.runs.length); setText("#run-count",state.runs.length);
}

async function init() {
  bindNavigation();
  showView(state.activeView,{updateHash:false});
  bindBoardControls(); bindInputs(); bindRuns(); bindDialog();
  const results=await Promise.allSettled([loadBoard(),loadSettings(),loadInputs(),loadRuns()]);
  const failures=results.filter(result=>result.status==="rejected");
  if(failures.length) toast(failures[0].reason.message,true);
  updateCounters();
  $("#refresh-button").addEventListener("click",refreshAll);
}
async function refreshAll() {
  const jobs=[loadBoard(),loadSettings(),loadInputs(),loadRuns()];
  const results=await Promise.allSettled(jobs);
  const error=results.find(result=>result.status==="rejected");
  if(error) toast(error.reason.message,true); else toast("Workspace refreshed.");
  updateCounters();
}
async function loadBoard() {
  const board=await request("/board");
  state.board=board;
  $("#canvas-content").style.width=`${board.width}px`;
  $("#canvas-content").style.height=`${board.height}px`;
  $("#board-image").src=board.imageUrl;
  renderSections(); renderBoardOverlays(); renderTextIndex();
  setText("#board-node-count",board.nodes?.length ?? "—");
  setText("#stage-count",`${board.nodes?.filter(n=>n.executable).length ?? "—"} stages`);
  setText("#nav-stage-count",board.nodes?.filter(n=>n.executable).length ?? "—");
  if(!state.viewportInitialized) {
    state.viewportInitialized=true;
    setTimeout(()=>fitBoard(true),80);
  }
}
function renderSections() {
  const host=$("#section-nav"); host.replaceChildren();
  (state.board?.sections||[]).forEach(section=>{
    const button=node("button","section-chip",section.name); button.type="button";
    button.addEventListener("click",()=>focusSection(section));
    host.append(button);
  });
}
function renderBoardOverlays() {
  const board=state.board; if(!board) return;
  const host=$("#board-overlays"); host.replaceChildren();
  (board.nodes||[]).filter(item=>item.executable).forEach((item,index)=>{
    const button=node("button","board-node"); button.type="button";
    button.style.setProperty("--x",`${(Number(item.x)/board.width)*100}%`);
    button.style.setProperty("--y",`${(Number(item.y)/board.height)*100}%`);
    button.style.setProperty("--w",`${(Number(item.width)/board.width)*100}%`);
    button.style.setProperty("--h",`${(Number(item.height)/board.height)*100}%`);
    button.dataset.nodeId=item.id; button.setAttribute("aria-label",`Inspect workflow stage ${item.name}`);
    const label=node("span","board-node-label",item.name); button.append(label);
    button.addEventListener("click",()=>selectBoardNode(item,index));
    host.append(button);
  });
}
function renderTextIndex() {
  const query=($("#node-search")?.value||"").trim().toLocaleLowerCase();
  const results=(state.board?.nodes||[]).filter(item=>`${item.name||""} ${item.text||""} ${item.section||""}`.toLocaleLowerCase().includes(query));
  state.nodesFiltered=results;
  const host=$("#node-list"); if(!host)return; host.replaceChildren();
  if(!results.length){host.append(emptyState("No source text found","Try a different search. The full source index remains available."));return;}
  results.forEach(item=>{
    const button=node("button","index-entry"); button.type="button";
    const body=node("span","index-entry-text");
    if(item.name)body.append(node("strong","",item.name));
    if(item.text && item.text!==item.name)body.append(node("span","",item.text));
    if(!item.name&&!item.text)body.append(node("span","","(untitled source element)"));
    const meta=node("span","index-entry-meta",item.section||item.type||"source");
    button.append(body,meta);
    if(item.executable) button.classList.add("is-executable");
    button.addEventListener("click",()=>{
      const executableIndex=(state.board.nodes||[]).filter(n=>n.executable).findIndex(n=>n.id===item.id);
      focusCoordinates(Number(item.x)||0,Number(item.y)||0,Number(item.width)||800,Number(item.height)||300);
      selectBoardNode(item,executableIndex);
    });
    host.append(button);
  });
}
function selectBoardNode(item,index) {
  state.selectedNode=item;
  $$(".board-node").forEach(el=>el.classList.toggle("selected",el.dataset.nodeId===String(item.id)));
  const host=$("#stage-inspector-content"); host.replaceChildren();
  const id=node("div","inspector-stage-id",item.executable?`${String(index+1).padStart(2,"0")} / ${item.id}`:`SOURCE / ${item.id}`);
  const title=node("h2","",item.name||item.text||"Untitled stage");
  const badge=node("span","inspector-badge",item.role||(item.executable?"Workflow stage":"Source element"));
  host.append(id,title,badge);
  if(item.text && item.text!==item.name) host.append(node("p","inspector-copy",item.text));
  if(item.prompt) {
    const block=node("section","inspector-block"); block.append(node("h3","","Stage prompt"),node("p","inspector-copy",item.prompt)); host.append(block);
  }
  if(item.dependencies?.length) {
    const block=node("section","inspector-block"); block.append(node("h3","","Dependencies"));
    const deps=node("div","dep-list");
    item.dependencies.forEach(dep=>{const found=state.board.nodes.find(n=>n.id===dep);deps.append(node("span","dep-chip",found?.name||dep));});
    block.append(deps);host.append(block);
  }
  const allEdges=[
    ...(state.board.edges||[]).map(edge=>({...edge,isFeedback:Boolean(edge.feedback)})),
    ...(state.board.feedbackEdges||[]).map(edge=>({...edge,isFeedback:true}))
  ];
  const seenEdges=new Set();
  const related=allEdges.filter(edge=>{
    const key=edge.id??`${edge.source}:${edge.target}:${edge.label||""}`;
    if(seenEdges.has(key))return false;
    seenEdges.add(key);
    return String(edge.source)===String(item.id)||String(edge.target)===String(item.id);
  });
  if(related.length) {
    const block=node("section","inspector-block");block.append(node("h3","","Original board connections"));
    related.forEach(edge=>{
      const outgoing=String(edge.source)===String(item.id);
      const otherId=outgoing?edge.target:edge.source;
      const other=state.board.nodes.find(candidate=>String(candidate.id)===String(otherId));
      const row=node("div","edge-record");
      row.append(node("span","edge-direction",outgoing?"OUTGOING":"INCOMING"));
      row.append(node("strong","",`${item.id} ${outgoing?"→":"←"} ${otherId}`));
      row.append(node("span","edge-label",edge.label||"Unlabelled connection"));
      if(edge.isFeedback)row.append(node("span","edge-feedback","FEEDBACK · NON-BLOCKING"));
      if(other?.name||other?.text)row.append(node("span","edge-other-name",other.name||other.text));
      block.append(row);
    });
    host.append(block);
  }
  const meta=node("section","inspector-block"); meta.className="inspector-block inspector-meta";
  const details=[["Section",item.section||"Unsectioned"],["Type",item.type||"—"],["Run role",item.executable?"Executable":"Source element"]];
  details.forEach(([label,value])=>{const cell=node("div");cell.append(node("span","",label),node("strong","",value));meta.append(cell);});host.append(meta);
  setText("#inspector-index",item.executable?`${String(index+1).padStart(2,"0")} / ${state.board.nodes.filter(n=>n.executable).length}`:"SOURCE NODE");
  setText("#canvas-coordinate",`${item.section||"BOARD"} / ${item.id}`);
}
function fitBoard(initial=false) {
  if(!state.board)return;
  const viewport=$("#canvas-viewport"), w=viewport.clientWidth,h=viewport.clientHeight;
  const nodes=state.board.nodes.filter(n=>n.executable);
  let bounds={x:0,y:0,w:state.board.width,h:state.board.height};
  if(initial && nodes.length) {
    const x0=Math.min(...nodes.map(n=>Number(n.x)||0)),y0=Math.min(...nodes.map(n=>Number(n.y)||0));
    const x1=Math.max(...nodes.map(n=>(Number(n.x)||0)+(Number(n.width)||0))),y1=Math.max(...nodes.map(n=>(Number(n.y)||0)+(Number(n.height)||0)));
    bounds={x:x0-1200,y:y0-900,w:x1-x0+2400,h:y1-y0+1800};
  }
  const scale=Math.min((w-42)/bounds.w,(h-42)/bounds.h);
  state.boardScale=Math.max(.004,Math.min(.18,scale));
  state.panX=(w-bounds.w*state.boardScale)/2-bounds.x*state.boardScale;
  state.panY=(h-bounds.h*state.boardScale)/2-bounds.y*state.boardScale;
  applyBoardTransform();
}
function applyBoardTransform() {
  $("#canvas-content").style.transform=`translate(${state.panX}px,${state.panY}px) scale(${state.boardScale})`;
  setText("#zoom-readout",`${Math.round(state.boardScale*100)}%`);
}
function zoomAt(factor,clientX,clientY) {
  const viewport=$("#canvas-viewport"),rect=viewport.getBoundingClientRect();
  const x=clientX===undefined?rect.width/2:clientX-rect.left,y=clientY===undefined?rect.height/2:clientY-rect.top;
  const next=Math.max(.004,Math.min(.4,state.boardScale*factor));
  const ratio=next/state.boardScale;
  state.panX=x-(x-state.panX)*ratio;state.panY=y-(y-state.panY)*ratio;state.boardScale=next;applyBoardTransform();
}
function focusCoordinates(x,y,w,h) {
  const viewport=$("#canvas-viewport"),vw=viewport.clientWidth,vh=viewport.clientHeight;
  const scale=Math.min((vw-70)/Math.max(w,1),(vh-70)/Math.max(h,1));
  state.boardScale=Math.max(.006,Math.min(.3,scale));
  state.panX=(vw-w*state.boardScale)/2-x*state.boardScale;
  state.panY=(vh-h*state.boardScale)/2-y*state.boardScale;applyBoardTransform();
}
function focusSection(section) {
  state.activeSection=section.id;
  $$(".section-chip").forEach(button=>button.classList.toggle("selected",button.textContent===section.name));
  focusCoordinates(section.x,section.y,section.width,section.height);
  setText("#canvas-coordinate",`SECTION / ${section.name}`);
}
function bindBoardControls() {
  $("#fit-board").addEventListener("click",()=>fitBoard(false));
  $("#zoom-in").addEventListener("click",()=>zoomAt(1.22));
  $("#zoom-out").addEventListener("click",()=>zoomAt(.82));
  $("#toggle-text-index").addEventListener("click",()=>{
    const panel=$("#text-index-panel"),open=panel.hidden;
    panel.hidden=!open;$("#toggle-text-index").setAttribute("aria-expanded",String(open));
    setText("#toggle-text-index",open?"Close full text index ↙":"Open full text index ↗");
    if(open)$("#node-search").focus();
  });
  $("#node-search").addEventListener("input",renderTextIndex);
  const viewport=$("#canvas-viewport");
  let pointer=null;
  viewport.addEventListener("pointerdown",event=>{
    if(event.target.closest(".board-node"))return;
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:state.panX,startY:state.panY,space:event.button===1||event.shiftKey||event.target.dataset.pan==="true"};
    if(event.button===1||event.shiftKey){viewport.setPointerCapture(event.pointerId);viewport.classList.add("is-panning");}
  });
  viewport.addEventListener("pointermove",event=>{
    if(!pointer||pointer.id!==event.pointerId)return;
    if(event.buttons===1||pointer.space){viewport.setPointerCapture(event.pointerId);viewport.classList.add("is-panning");state.panX=pointer.startX+event.clientX-pointer.x;state.panY=pointer.startY+event.clientY-pointer.y;applyBoardTransform();}
  });
  const stop=()=>{pointer=null;viewport.classList.remove("is-panning");};
  viewport.addEventListener("pointerup",stop);viewport.addEventListener("pointercancel",stop);
  viewport.addEventListener("wheel",event=>{event.preventDefault();zoomAt(event.deltaY<0?1.09:.92,event.clientX,event.clientY);},{passive:false});
  viewport.addEventListener("keydown",event=>{
    const step=55;
    if(event.key==="+"||event.key==="="){event.preventDefault();zoomAt(1.2);}
    else if(event.key==="-"){event.preventDefault();zoomAt(.83);}
    else if(event.key==="0"){event.preventDefault();fitBoard(false);}
    else if(event.key==="ArrowLeft"){event.preventDefault();state.panX+=step;applyBoardTransform();}
    else if(event.key==="ArrowRight"){event.preventDefault();state.panX-=step;applyBoardTransform();}
    else if(event.key==="ArrowUp"){event.preventDefault();state.panY+=step;applyBoardTransform();}
    else if(event.key==="ArrowDown"){event.preventDefault();state.panY-=step;applyBoardTransform();}
  });
  let space=false;
  window.addEventListener("keydown",event=>{if(event.code==="Space"&&(document.activeElement===document.body||document.activeElement===viewport)){space=true;event.preventDefault();}});
  window.addEventListener("keyup",event=>{if(event.code==="Space"){space=false;viewport.classList.remove("is-panning");}});
  viewport.addEventListener("pointerdown",event=>{if(space){pointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:state.panX,startY:state.panY,space:true};viewport.setPointerCapture(event.pointerId);viewport.classList.add("is-panning");}});
  $("#input-kind").addEventListener("change",updateInputKind);
  window.addEventListener("resize",()=>{if(!state.selectedNode)fitBoard(true);});
}

async function loadSettings() {
  state.settings=await request("/settings");renderSettings();
  const banner=$("#provider-blocked-banner");
  banner.hidden=Boolean(state.settings.provider?.configured);
}
function renderSettings() {
  const host=$("#settings-content");host.replaceChildren();
  const provider=state.settings?.provider||{},limits=state.settings?.limits||{};
  const card=node("section","settings-card");
  card.append(node("div","eyebrow","PROVIDER STATUS"),node("h2","","Model connection"));
  const status=node("div","provider-state");
  const light=node("span",`provider-light${provider.configured?" ready":""}`);
  const statusText=node("div");
  statusText.append(node("strong","",provider.configured?"Provider configured":"Provider not configured"));
  statusText.append(node("p","",provider.error || (provider.configured?`${provider.provider||"Provider"} · ${provider.model||"Model configured"}`:"Connect a model provider in Replit before running agents.")));
  status.append(light,statusText);card.append(status);
  const details=node("dl","settings-details");
  [["Provider",provider.provider||"Not connected"],["Model",provider.model||"—"],["Endpoint",provider.baseUrl||"Not available"],["Credentials","Never displayed"]].forEach(([label,value])=>{const wrap=node("div"),dt=node("dt","",label),dd=node("dd","",value);wrap.append(dt,dd);details.append(wrap);});
  card.append(details);host.append(card);
  const limitsCard=node("section","settings-card");
  limitsCard.append(node("div","eyebrow","WORKSPACE LIMITS"),node("h2","","Local guardrails"));
  const limitDetails=node("dl","settings-details");
  [["Inputs per workspace",limits.maxInputs],["Text limit",limits.maxTextLength?`${Number(limits.maxTextLength).toLocaleString()} characters`:"—"],["Image size",limits.maxImageBytes?`${(limits.maxImageBytes/1024/1024).toFixed(0)} MB`:"—"],["Run capacity",limits.maxRuns]].forEach(([label,value])=>{const wrap=node("div");wrap.append(node("dt","",label),node("dd","",value??"—"));limitDetails.append(wrap);});
  limitsCard.append(limitDetails);host.append(limitsCard);
  const notes=node("section","settings-card full");
  notes.append(node("div","eyebrow","PERSISTENCE & SAFETY"),node("h2","","Local by design"));
  const noteGrid=node("dl","settings-details");
  [["Persistence",state.settings?.persistence||"Workspace disk"],["Safety boundary",state.settings?.safety||"Human review is required."]].forEach(([label,value])=>{const wrap=node("div");wrap.append(node("dt","",label),node("dd","",value));noteGrid.append(wrap);});
  notes.append(noteGrid);host.append(notes);
}

async function loadInputs() {
  state.inputs=await request("/inputs");renderInputs();renderRunInputSelection();updateCounters();
}
function updateInputKind() {
  const image=$("#input-kind").value==="image";
  $("#input-text-group").hidden=image;$("#input-image-group").hidden=!image;
  $("#input-text").required=!image;$("#input-image").required=image;
}
function bindInputs() {
  $("#input-text").maxLength=12000;
  $("#image-description").maxLength=12000;
  // The native file picker works on phones and desktops; no unimplemented drop affordance.
  setText("#file-label","Choose an image");
  $("#input-text").addEventListener("input",()=>setText("#text-length",$("#input-text").value.length));
  $("#input-image").addEventListener("change",async event=>{
    const file=event.target.files?.[0];state.imageData=null;
    if(!file){setText("#file-label","Choose an image or drop it here");return;}
    if(file.size>4*1024*1024){event.target.value="";setText("#file-label","File exceeds 4 MB");$("#input-form-error").textContent="Image files must be 4 MB or smaller.";return;}
    if(!["image/png","image/jpeg","image/webp"].includes(file.type)){event.target.value="";$("#input-form-error").textContent="Choose a PNG, JPEG or WebP image.";return;}
    try{state.imageData=await readAsDataURL(file);setText("#file-label",`${file.name} · ${(file.size/1024).toFixed(0)} KB`);$("#input-form-error").textContent="";}
    catch{state.imageData=null;$("#input-form-error").textContent="Could not read this image file.";}
  });
  $("#input-form").addEventListener("submit",async event=>{
    event.preventDefault();const form=event.currentTarget;const kind=$("#input-kind").value;
    const text=kind==="image"?$("#image-description").value:$("#input-text").value;
    const error=$("#input-form-error"),submit=$("#add-input-button");error.textContent="";
    if(kind!=="image"&&!text.trim()){error.textContent="Add non-empty source text before saving.";return;}
    if(kind==="image"&&!state.imageData){error.textContent="Choose a supported image file first.";return;}
    const data={kind,title:$("#input-title").value.trim(),text:text.trim()};
    if(kind==="image")data.imageData=state.imageData;
    submit.disabled=true;
    try{await request("/inputs",{method:"POST",body:JSON.stringify(data)});form.reset();state.imageData=null;updateInputKind();setText("#file-label","Choose an image or drop it here");setText("#text-length","0");await loadInputs();toast("Source material added.");}
    catch(err){error.textContent=err.message;}
    finally{submit.disabled=false;}
  });
}
function readAsDataURL(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file);});}
function renderInputs() {
  const host=$("#input-list");host.replaceChildren();
  if(!state.inputs.length){host.append(emptyState("No source material yet","Add notes, research, a chat transcript or an image. Nothing is pre-seeded."));return;}
  state.inputs.forEach(input=>{
    const card=node("article","input-card");
    const mark=node("span","input-kind-mark",({notes:"N",chat:"C",research:"R",image:"I"})[input.kind]||"S");
    const content=node("div");
    content.append(node("h3","",input.title||({notes:"Raw notes",chat:"LLM chat",research:"Research snippet",image:"Screenshot or sketch"})[input.kind]||"Source input"));
    content.append(node("div","input-card-meta",`${String(input.kind||"source").toUpperCase()} · ADDED ${formatDate(input.createdAt)}`));
    if(input.text)content.append(node("p","input-card-preview",input.text));
    if(input.kind==="image"&&input.imageUrl){const img=node("img","input-thumb");img.src=input.imageUrl;img.alt=input.title?`Source image: ${input.title}`:"Attached source image";content.append(img);}
    const del=node("button","delete-button","Remove");del.type="button";del.setAttribute("aria-label",`Remove ${input.title||input.kind} source`);
    del.addEventListener("click",async()=>{
      if(del.disabled)return;del.disabled=true;del.textContent="Removing…";
      try{await deleteInput(input);}finally{if(del.isConnected){del.disabled=false;del.textContent="Remove";}}
    });card.append(mark,content,del);host.append(card);
  });
}
async function deleteInput(input) {
  if(!confirm(`Remove “${input.title||input.kind}” from the source library? Existing run snapshots will remain intact.`))return;
  try{await request(`/inputs/${encodeURIComponent(input.id)}`,{method:"DELETE"});await loadInputs();toast("Source removed. Existing run snapshots are unchanged.");}
  catch(error){toast(error.message,true);}
}
function emptyState(title,description) { const wrap=node("div","empty-state");wrap.append(node("strong","",title),node("p","",description));return wrap; }

function bindRuns() {
  $("#run-title").maxLength=160;
  $("#run-goal").maxLength=6000;
  $("#new-run-button").addEventListener("click",openRunDialog);
  $("#empty-create-run").addEventListener("click",openRunDialog);
  $("#run-form").addEventListener("submit",createRun);
}
function bindDialog() {
  const dialog=$("#run-dialog");
  $("#close-run-dialog").addEventListener("click",()=>dialog.close());
  $("#cancel-run-dialog").addEventListener("click",()=>dialog.close());
  dialog.addEventListener("click",event=>{if(event.target===dialog)dialog.close();});
}
function openRunDialog() {
  $("#run-form-error").textContent="";$("#run-form").reset();renderRunInputSelection();
  const dialog=$("#run-dialog");if(typeof dialog.showModal==="function")dialog.showModal();else dialog.setAttribute("open","");
  $("#run-title").focus();
}
function renderRunInputSelection() {
  const host=$("#run-input-selection");if(!host)return;host.replaceChildren();
  if(!state.inputs.length){host.append(emptyState("No source material available","Add at least one input before creating a run."));setText("#selected-input-count","0 selected");updateSelectedInputCount();return;}
  state.inputs.forEach(input=>{
    const label=node("label","source-choice"),checkbox=node("input");checkbox.type="checkbox";checkbox.value=input.id;
    checkbox.addEventListener("change",updateSelectedInputCount);
    label.append(checkbox,node("span","",`${input.title||input.kind} · ${input.kind}`));host.append(label);
  });
  updateSelectedInputCount();
}
function selectedRunInputs() {
  const selectedIds=new Set($$("#run-input-selection input:checked").map(input=>input.value));
  return state.inputs.filter(input=>selectedIds.has(String(input.id)));
}
function runInputValidation(inputs=selectedRunInputs()) {
  const maxInputs=Math.min(10,Number(state.settings?.limits?.maxInputs)||10);
  const imageCount=inputs.filter(input=>input.kind==="image").length;
  const textLength=inputs.reduce((total,input)=>total+String(input.text||"").length,0);
  const errors=[];
  if(inputs.length<1)errors.push("Select at least 1 source input.");
  if(inputs.length>maxInputs)errors.push(`Select no more than ${maxInputs} inputs.`);
  if(imageCount>3)errors.push("A run can include at most 3 images.");
  if(textLength>30000)errors.push(`Selected source text is ${textLength.toLocaleString()} characters; the limit is 30,000.`);
  return {errors,imageCount,textLength,maxInputs};
}
function updateSelectedInputCount() {
  const inputs=selectedRunInputs(),validation=runInputValidation(inputs);
  setText("#selected-input-count",`${inputs.length} selected · ${validation.imageCount} images · ${validation.textLength.toLocaleString()} / 30,000 text chars`);
  const hint=$("#run-selection-hint");
  if(hint) {
    hint.textContent=validation.errors.length?validation.errors.join(" "):`Requirements: 1–${validation.maxInputs} inputs, no more than 3 images, up to 30,000 source-text characters.`;
    hint.classList.toggle("has-error",validation.errors.length>0);
  }
  const submit=$("#create-run-submit");
  if(submit)submit.disabled=validation.errors.length>0||state.busyActions.has("create-run");
}
async function createRun(event) {
  event.preventDefault();const error=$("#run-form-error"),button=$("#create-run-submit");error.textContent="";
  const title=$("#run-title").value.trim(),goal=$("#run-goal").value.trim();
  if(!title||!goal){error.textContent="A title and goal are required.";return;}
  const selected=selectedRunInputs(),validation=runInputValidation(selected);
  if(validation.errors.length){error.textContent=validation.errors.join(" ");updateSelectedInputCount();return;}
  const inputIds=selected.map(input=>input.id);
  if(state.busyActions.has("create-run"))return;
  state.busyActions.add("create-run");
  button.disabled=true;
  try {
    const run=await request("/runs",{method:"POST",body:JSON.stringify({title,inputIds,goal})});
    $("#run-dialog").close();state.runs=[run,...state.runs.filter(existing=>existing.id!==run.id)];rememberSelectedRun(run.id);
    renderRunList();await loadRun(run.id);showView("runs");toast("Draft saved. It has not contacted a model provider.");
  } catch(err){error.textContent=err.message;}
  finally{state.busyActions.delete("create-run");updateSelectedInputCount();}
}
async function loadRuns() {
  state.runs=await request("/runs");renderRunList();updateCounters();
  if(state.selectedRunId&&state.runs.some(run=>run.id===state.selectedRunId))await loadRun(state.selectedRunId);
  else if(state.runs.length)await loadRun(state.runs[0].id);
  else {state.selectedRunId=null;state.selectedRun=null;rememberSelectedRun(null);renderRunDetail();}
}
function rememberSelectedRun(id) {
  state.selectedRunId=id;
  try{if(id===null)localStorage.removeItem("figjamWorkflowSelectedRun");else localStorage.setItem("figjamWorkflowSelectedRun",String(id));}catch{}
}
function renderRunList() {
  const host=$("#run-list");host.replaceChildren();
  if(!state.runs.length){host.append(emptyState("No runs saved","Create a draft when you are ready to assemble a workflow run."));return;}
  state.runs.forEach(run=>{
    const button=node("button",`run-list-item${run.id===state.selectedRunId?" selected":""}`);button.type="button";
    button.append(node("strong","",run.title||"Untitled run"));
    const meta=node("span","run-list-meta"),status=node("span");
    const dot=node("i",`status-dot ${run.status}`);status.append(dot,document.createTextNode(niceStatus(run.status)));
    const progress=node("span","",`${run.completed??0} / ${run.total??"—"} · ${formatDate(run.updatedAt||run.createdAt)}`);
    meta.append(status,progress);button.append(meta);
    button.addEventListener("click",()=>loadRun(run.id));host.append(button);
  });
}
async function loadRun(id,{quiet=false}={}) {
  rememberSelectedRun(id);
  try{
    state.selectedRun=await request(`/runs/${encodeURIComponent(id)}`);
    syncRunListFromDetail(state.selectedRun);
    renderRunList();renderRunDetail();updatePoll();
  }
  catch(error){if(!quiet)toast(error.message,true);throw error;}
}
function syncRunListFromDetail(run) {
  const stages=Object.values(run.stages||{}),summary={
    id:run.id,title:run.title,status:run.status,createdAt:run.createdAt,updatedAt:run.updatedAt,
    completed:stages.filter(stage=>stage.status==="completed").length,total:stages.length,
    revisionOf:run.revisionOf,error:run.error
  };
  const existing=state.runs.findIndex(item=>String(item.id)===String(run.id));
  if(existing<0)state.runs.unshift(summary);else state.runs[existing]={...state.runs[existing],...summary};
  state.runs.sort((a,b)=>new Date(b.updatedAt||b.createdAt||0)-new Date(a.updatedAt||a.createdAt||0));
  updateCounters();
}
function updatePoll() {
  clearInterval(state.pollTimer);state.pollTimer=null;
  if(state.selectedRun&&["queued","running"].includes(state.selectedRun.status)){
    state.pollTimer=setInterval(()=>loadRun(state.selectedRunId,{quiet:true}).catch(()=>{}),1500);
  }
}
function renderRunDetail() {
  const run=state.selectedRun,host=$("#run-detail"),previousScroll=host.scrollTop;host.replaceChildren();if(!run){return;}
  const head=node("header","run-detail-head"),titleWrap=node("div","run-detail-title");
  titleWrap.append(node("div","eyebrow",`RUN / ${String(run.id).slice(0,12)}`),node("h2","",run.title||"Untitled run"),node("p","",`${niceStatus(run.status).toUpperCase()} · CREATED ${formatDate(run.createdAt)}`));
  const actions=node("div","run-actions");
  const actionable=run.status;
  if(["draft","failed","blocked","interrupted","cancelled"].includes(actionable))actions.append(actionButton(actionable==="draft"?"Start run":"Retry / resume","run-start",()=>startRun(run.id)));
  if(["queued","running"].includes(actionable))actions.append(actionButton("Cancel run","run-cancel",()=>cancelRun(run.id),"button-secondary"));
  actions.append(actionButton("JSON export","export-json",()=>exportRun(run.id,"json"),"button-secondary"));
  actions.append(actionButton("Markdown export","export-md",()=>exportRun(run.id,"md"),"button-secondary"));
  if(!["draft","queued","running"].includes(run.status))actions.append(actionButton("Revise from review","run-revise",()=>reviseRun(run.id),"button-secondary"));
  head.append(titleWrap,actions);host.append(head);
  if(run.revisionOf) {
    const lineage=node("div","run-lineage"),label=node("span","", "REVISION OF");
    const parent=node("button","lineage-link",String(run.revisionOf));parent.type="button";
    parent.addEventListener("click",()=>{showView("runs");loadRun(run.revisionOf).catch(()=>{});});
    lineage.append(label,parent);host.append(lineage);
  }
  if(run.error){const banner=node("div","run-error-banner",run.error);banner.setAttribute("role","alert");host.append(banner);}
  const summary=node("section","run-summary"),goal=node("div","run-goal",run.goal||"No goal recorded.");
  const statbox=node("div","run-summary-stats");
  const stageValues=Object.values(run.stages||{}),completed=stageValues.filter(stage=>stage.status==="completed").length;
  [[completed,"DONE"],[stageValues.length,"STAGES"],[stageValues.reduce((sum,s)=>sum+(Number(s.attempts)||0),0),"ATTEMPTS"]].forEach(([value,label])=>{const cell=node("div");cell.append(node("strong","",value),node("span","",label));statbox.append(cell);});
  summary.append(goal,statbox);host.append(summary);
  const stageHeading=node("div","run-section-heading");stageHeading.append(node("h3","","Stage record"),node("span","",`${completed} / ${stageValues.length} completed`));host.append(stageHeading);
  const list=node("div","stage-list");
  const stages=Object.values(run.stages||{});
  const stageOrder=(state.board?.nodes||[]).filter(n=>n.executable).map(n=>n.id);
  stages.sort((a,b)=>{const ai=stageOrder.indexOf(a.id),bi=stageOrder.indexOf(b.id);return (ai<0?1e6:ai)-(bi<0?1e6:bi);});
  if(!stages.length)list.append(emptyState("No stages in this run","The server returned no stage records."));
  stages.forEach((stage,index)=>list.append(renderRunStage(stage,index)));
  host.append(list);
  const tails=node("div","run-tail-grid");
  tails.append(renderEvents(run.events||[]),renderFeedback(run.feedback||[]),renderSourceSnapshots(run.inputs||[]));
  host.append(tails);
  host.scrollTop=previousScroll;
}
function actionButton(label,id,callback,style="") {
  const button=node("button",`button ${style||"button-primary"}`,label);button.type="button";button.id=id;
  button.disabled=state.busyActions.has(`${id}:${state.selectedRunId}`);
  button.addEventListener("click",async()=>{
    const key=`${id}:${state.selectedRunId}`;
    if(state.busyActions.has(key))return;
    state.busyActions.add(key);button.disabled=true;
    try{await callback();}
    finally {
      state.busyActions.delete(key);
      if(state.selectedRun)renderRunDetail();
    }
  });
  return button;
}
function renderRunStage(stage,index) {
  const runId=String(state.selectedRun?.id||""),key=`${runId}:${stage.id}`;
  const expanded=state.expandedStages.has(key);
  const wrap=node("article","run-stage"),button=node("button","stage-row");button.type="button";button.setAttribute("aria-expanded",String(expanded));
  const number=node("span","stage-number",String(index+1).padStart(2,"0"));
  const title=node("strong","",stage.name||stage.id);
  const status=node("span","stage-status",niceStatus(stage.status));
  const toggle=node("span","stage-toggle",expanded?"−":"＋");button.append(number,title,status,toggle);
  const details=node("div","stage-expanded");details.hidden=!expanded;
  button.addEventListener("click",()=>{details.hidden=!details.hidden;button.setAttribute("aria-expanded",String(!details.hidden));toggle.textContent=details.hidden?"＋":"−";if(details.hidden)state.expandedStages.delete(key);else state.expandedStages.add(key);});
  if(stage.dependencies?.length){const dep=node("p");dep.append(document.createTextNode("Depends on: "));dep.append(document.createTextNode(stage.dependencies.join(", ")));details.append(dep);}
  if(stage.prompt){details.append(artifactBlock("Stage prompt",stage.prompt));}
  if(stage.startedAt||stage.finishedAt||stage.durationMs!==undefined||stage.attempts!==undefined){
    const meta=node("p","stage-timing",`Attempts ${stage.attempts??0} · Duration ${stage.durationMs!=null?`${stage.durationMs} ms`:"—"} · Started ${formatDate(stage.startedAt)} · Finished ${formatDate(stage.finishedAt)}`);details.append(meta);
  }
  if(stage.error){const error=node("p","warning-text",stage.error);details.append(error);}
  if(stage.output){
    const output=stage.output;
    if(output.summary)details.append(artifactBlock("Summary",output.summary));
    if(output.artifact)details.append(artifactBlock("Artifact",output.artifact));
    if(output.claims?.length)details.append(renderClaims(output.claims));
    if(output.decisions?.length)details.append(renderDecisions(output.decisions));
    if(output.warnings?.length){const block=node("div","artifact-box");block.append(node("h4","","Warnings"));output.warnings.forEach(warning=>block.append(node("p","warning-text",displayValue(warning))));details.append(block);}
  } else if(!stage.error) details.append(node("p","inspector-copy","No output recorded for this stage."));
  wrap.append(button,details);return wrap;
}
function displayValue(value) {
  if(typeof value==="string")return value;
  if(value===undefined)return "";
  try{return JSON.stringify(value,null,2)??"";}catch{return String(value);}
}
function artifactBlock(title,content) {const block=node("div","artifact-box");block.append(node("h4","",title),node("p","",displayValue(content)));return block;}
function renderClaims(claims) {
  const block=node("div","artifact-box");block.append(node("h4","","Claims & evidence"));
  const ul=node("ul","record-list");
  claims.forEach(claim=>{
    const li=node("li");li.append(document.createTextNode(displayValue(claim.statement||claim)));
    if(claim.evidence!==undefined&&claim.evidence!==null)li.append(node("p","",`Evidence: ${displayValue(claim.evidence)}`));
    if(claim.confidence!==undefined)li.append(node("span","confidence",`Confidence ${displayValue(claim.confidence)}`));
    ul.append(li);
  });
  block.append(ul);return block;
}
function renderDecisions(decisions) {
  const block=node("div","artifact-box");block.append(node("h4","","Decisions"));
  const ul=node("ul","record-list");
  decisions.forEach(decision=>{
    const li=node("li");li.append(document.createTextNode(displayValue(decision.decision||decision)));
    if(decision.rationale!==undefined&&decision.rationale!==null)li.append(node("p","",displayValue(decision.rationale)));
    ul.append(li);
  });
  block.append(ul);return block;
}
function renderEvents(events) {
  const section=node("section","run-tail-panel");section.append(node("h3","","Run events"));
  if(!events.length)section.append(node("div","event-row","No events recorded."));
  events.slice().reverse().forEach(event=>{const row=node("div","event-row");row.append(node("time","",`${formatDate(event.at)} · ${event.type||"event"}`),node("span","",event.message||event.stageId||""));section.append(row);});
  return section;
}
function renderFeedback(feedback) {
  const section=node("section","run-tail-panel");section.append(node("h3","","Review feedback"));
  if(!feedback.length)section.append(node("div","event-row","No review feedback recorded."));
  feedback.forEach(item=>{
    const card=node("article","feedback-card");
    card.append(node("strong","",`${item.source||"Review"} → ${item.target||"Stage"}`));
    if(item.edgeId)card.append(node("span","feedback-edge-id",`EDGE ${item.edgeId}`));
    if(item.label)card.append(node("p","",item.label));
    if(item.output!==undefined&&item.output!==null)card.append(renderStructuredOutput(item.output));
    section.append(card);
  });
  return section;
}
function renderStructuredOutput(output) {
  if(typeof output!=="object"||output===null)return artifactBlock("Feedback output",output);
  const block=node("div","feedback-output");
  const known=new Set(["summary","artifact","claims","decisions","warnings","error"]);
  if(output.summary!==undefined)block.append(artifactBlock("Summary",output.summary));
  if(output.artifact!==undefined)block.append(artifactBlock("Artifact",output.artifact));
  if(Array.isArray(output.claims)&&output.claims.length)block.append(renderClaims(output.claims));
  if(Array.isArray(output.decisions)&&output.decisions.length)block.append(renderDecisions(output.decisions));
  if(output.warnings!==undefined)block.append(artifactBlock("Warnings",output.warnings));
  if(output.error!==undefined)block.append(artifactBlock("Error",output.error));
  Object.entries(output).filter(([key])=>!known.has(key)).forEach(([key,value])=>block.append(artifactBlock(key,value)));
  if(!block.childNodes.length)block.append(artifactBlock("Feedback output",output));
  return block;
}
function renderSourceSnapshots(inputs) {
  const section=node("section","run-tail-panel");section.append(node("h3","","Source snapshots"));
  if(!inputs.length)section.append(node("div","source-snapshot","No source inputs attached."));
  inputs.forEach(input=>{
    const row=node("article","source-snapshot");
    row.append(node("strong","",input.title||input.kind||"Source"),document.createTextNode(` · ${input.kind||"input"}`));
    if(input.text)row.append(node("div","source-snapshot-text",input.text));
    if(input.imageUrl){const image=node("img","source-snapshot-image");image.src=input.imageUrl;image.alt=input.title?`Run source image: ${input.title}`:"Run source image";row.append(image);}
    section.append(row);
  });
  return section;
}
async function startRun(id) {
  const run=state.selectedRun?.id===id?state.selectedRun:state.runs.find(item=>String(item.id)===String(id));
  const retry=run?.status!=="draft";
  const message=[
    "Starting may trigger up to 24 paid model requests.",
    "Source material attached to this run will be sent to the configured provider.",
    retry?"Retry keeps completed stages and reruns eligible failed work.":"This starts the saved draft and schedules its eligible stages.",
    "If you cancel, an in-flight provider request may still finish and incur cost."
  ].join("\n\n");
  if(!confirm(message))return;
  try{await request(`/runs/${encodeURIComponent(id)}/start`,{method:"POST",body:"{}"});toast("Run start requested.");await loadRun(id);}
  catch(error){toast(error.message,true);try{await loadRun(id);}catch{}}
}
async function cancelRun(id) {
  if(!confirm("Cancel scheduling for this run? An in-flight provider request may still finish and incur cost; its output will be discarded."))return;
  try{await request(`/runs/${encodeURIComponent(id)}/cancel`,{method:"POST",body:"{}"});toast("Cancellation saved.");await loadRun(id);}
  catch(error){toast(error.message,true);try{await loadRun(id);}catch{}}
}
async function reviseRun(id) {
  const goal=prompt("Optional: add explicit review direction for the new draft. Leave blank to use the recorded feedback.");
  if(goal===null)return;
  try{const run=await request(`/runs/${encodeURIComponent(id)}/revise`,{method:"POST",body:JSON.stringify(goal.trim()?{goal:goal.trim()}:{})});state.selectedRunId=run.id;state.runs=[run,...state.runs.filter(item=>item.id!==run.id)];renderRunList();await loadRun(run.id);toast("New revision draft created. It has not been started.");}
  catch(error){toast(error.message,true);}
}
async function exportRun(id,format) {
  try{
    const response=await fetch(`${API}/runs/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`);
    if(!response.ok){let message=`Export failed (${response.status})`;try{message=(await response.json()).error||message;}catch{}throw new Error(message);}
    const blob=await response.blob(),url=URL.createObjectURL(blob),anchor=node("a");
    anchor.href=url;anchor.download=`workflow-run-${id}.${format==="md"?"md":"json"}`;document.body.append(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);toast(`${format.toUpperCase()} export downloaded.`);
  }catch(error){toast(error.message,true);}
}

init();
