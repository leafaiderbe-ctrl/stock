if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js');
  });
}

const DB_NAME = 'stockDB';
const DB_VERSION = 1;
let db;

const SEED_ITEMS = [
  {name:"Vis à bois 4x40", qty:120, location:"Atelier - Tiroir 2", photo:null},
  {name:"Ampoules LED E27", qty:6, location:"Cave - Étagère A", photo:null},
  {name:"Filtre à café", qty:2, location:"Cuisine - Placard haut", photo:null},
];
const SEED_LOCATIONS = ["Atelier - Tiroir 2", "Cave - Étagère A", "Cuisine - Placard haut", "Garage"];

function openDB(){
  return new Promise((resolve, reject)=>{
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e)=>{
      const database = e.target.result;
      if(!database.objectStoreNames.contains('items')){
        database.createObjectStore('items', {keyPath:'id', autoIncrement:true});
      }
      if(!database.objectStoreNames.contains('locations')){
        database.createObjectStore('locations', {keyPath:'name'});
      }
    };
    req.onsuccess = (e)=> resolve(e.target.result);
    req.onerror = (e)=> reject(e.target.error);
  });
}

function idbRequest(request){
  return new Promise((resolve, reject)=>{
    request.onsuccess = ()=> resolve(request.result);
    request.onerror = ()=> reject(request.error);
  });
}

function store(name, mode='readonly'){
  return db.transaction(name, mode).objectStore(name);
}

function dbGetAllItems(){ return idbRequest(store('items').getAll()); }
function dbAddItem(item){ return idbRequest(store('items','readwrite').add(item)); }
function dbPutItem(item){ return idbRequest(store('items','readwrite').put(item)); }
function dbDeleteItem(id){ return idbRequest(store('items','readwrite').delete(id)); }

function dbGetAllLocations(){ return idbRequest(store('locations').getAll()); }
function dbPutLocation(name){ return idbRequest(store('locations','readwrite').put({name})); }
function dbClearStore(name){ return idbRequest(store(name,'readwrite').clear()); }

async function seedIfEmpty(){
  const existingLocations = await dbGetAllLocations();
  if(existingLocations.length === 0){
    for(const loc of SEED_LOCATIONS) await dbPutLocation(loc);
  }
  const existingItems = await dbGetAllItems();
  if(existingItems.length === 0){
    for(const it of SEED_ITEMS){
      await dbAddItem({...it, updatedAt: Date.now()});
    }
  }
}

let items = [];
let locations = [];

let activeFilter = null;
let searchTerm = "";
let editingId = null;
let pendingPhoto = null;
let pendingQty = 1;

const list = document.getElementById('list');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');
const locationChips = document.getElementById('locationChips');
const sheetOverlay = document.getElementById('sheetOverlay');
const sheetTitle = document.getElementById('sheetTitle');
const nameInput = document.getElementById('nameInput');
const qtyDisplay = document.getElementById('qtyDisplay');
const locationSelect = document.getElementById('locationSelect');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const deleteBtn = document.getElementById('deleteBtn');

function renderChips(){
  let html = `<button class="chip ${activeFilter===null?'active':''}" data-loc="">Tous</button>`;
  locations.forEach(loc=>{
    html += `<button class="chip ${activeFilter===loc?'active':''}" data-loc="${escapeHtml(loc)}">${escapeHtml(loc)}</button>`;
  });
  locationChips.innerHTML = html;
  locationChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      activeFilter = chip.dataset.loc || null;
      renderChips();
      renderList();
    });
  });
}

function renderLocationSelect(){
  locationSelect.innerHTML = locations.map(loc=>
    `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`
  ).join('');
}

function renderList(){
  let filtered = items.filter(it=>{
    const matchLoc = !activeFilter || it.location === activeFilter;
    const matchSearch = !searchTerm || it.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchLoc && matchSearch;
  });

  itemCount.textContent = items.length + (items.length>1 ? " articles" : " article");

  if(filtered.length === 0){
    list.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.innerHTML = items.length===0
      ? "&#9678;<br>Aucun article pour l'instant.<br>Ajoutez le premier avec le bouton ci-dessous."
      : "&#9678;<br>Aucun résultat pour ce filtre.";
    return;
  }
  emptyState.style.display = "none";

  list.innerHTML = filtered.map(it=>`
    <div class="card" data-id="${it.id}">
      <div class="thumb" style="${it.photo ? `background-image:url(${it.photo})` : ''}">${it.photo ? '' : '&#128247;'}</div>
      <div class="card-body" data-action="edit">
        <div class="card-name">${escapeHtml(it.name)}</div>
        <span class="card-loc">${escapeHtml(it.location)}</span>
      </div>
      <div class="card-actions">
        <div class="stepper">
          <button data-action="dec">–</button>
          <span class="qty mono">${it.qty}</span>
          <button data-action="inc">+</button>
        </div>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.card').forEach(card=>{
    const id = parseInt(card.dataset.id);
    card.querySelector('[data-action="edit"]').addEventListener('click', ()=>openSheet(id));
    card.querySelector('[data-action="inc"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      changeQty(id, 1);
    });
    card.querySelector('[data-action="dec"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      changeQty(id, -1);
    });
  });
}

async function changeQty(id, delta){
  const it = items.find(i=>i.id===id);
  if(!it) return;
  it.qty = Math.max(0, it.qty + delta);
  it.updatedAt = Date.now();
  renderList();
  await dbPutItem(it);
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openSheet(id){
  editingId = id || null;
  const it = id ? items.find(i=>i.id===id) : null;

  sheetTitle.textContent = it ? "Modifier l'article" : "Nouvel article";
  nameInput.value = it ? it.name : "";
  pendingQty = it ? it.qty : 1;
  qtyDisplay.textContent = pendingQty;
  pendingPhoto = it ? it.photo : null;
  photoPreview.style.backgroundImage = pendingPhoto ? `url(${pendingPhoto})` : '';
  photoPreview.innerHTML = pendingPhoto ? '' : '&#128247;';
  deleteBtn.style.display = it ? 'block' : 'none';

  renderLocationSelect();
  if(it) locationSelect.value = it.location;

  sheetOverlay.classList.add('open');
}

function closeSheet(){
  sheetOverlay.classList.remove('open');
  editingId = null;
}

document.getElementById('addBtn').addEventListener('click', ()=>openSheet(null));
sheetOverlay.addEventListener('click', (e)=>{ if(e.target === sheetOverlay) closeSheet(); });

document.getElementById('qtyMinus').addEventListener('click', ()=>{
  pendingQty = Math.max(0, pendingQty - 1);
  qtyDisplay.textContent = pendingQty;
});
document.getElementById('qtyPlus').addEventListener('click', ()=>{
  pendingQty += 1;
  qtyDisplay.textContent = pendingQty;
});

document.getElementById('photoBtn').addEventListener('click', ()=> photoInput.click());
photoInput.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = (ev)=>{
    const img = new Image();
    img.onload = ()=>{
      const maxSize = 400;
      let w = img.width, h = img.height;
      if(w > h && w > maxSize){ h *= maxSize/w; w = maxSize; }
      else if(h > maxSize){ w *= maxSize/h; h = maxSize; }
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(img, 0, 0, w, h);
      pendingPhoto = canvas.toDataURL('image/jpeg', 0.7);
      photoPreview.style.backgroundImage = `url(${pendingPhoto})`;
      photoPreview.innerHTML = '';
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
});

document.getElementById('addLocBtn').addEventListener('click', async ()=>{
  const input = document.getElementById('newLocInput');
  const val = input.value.trim();
  if(!val) return;
  if(!locations.includes(val)){
    locations.push(val);
    await dbPutLocation(val);
  }
  renderLocationSelect();
  locationSelect.value = val;
  input.value = "";
  renderChips();
});

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }
  const location = locationSelect.value || locations[0] || "Sans emplacement";

  if(editingId){
    const it = items.find(i=>i.id===editingId);
    it.name = name;
    it.qty = pendingQty;
    it.location = location;
    it.photo = pendingPhoto;
    it.updatedAt = Date.now();
    await dbPutItem(it);
  } else {
    const newItem = {name, qty:pendingQty, location, photo:pendingPhoto, updatedAt: Date.now()};
    newItem.id = await dbAddItem(newItem);
    items.push(newItem);
  }
  closeSheet();
  renderChips();
  renderList();
});

deleteBtn.addEventListener('click', async ()=>{
  if(!editingId) return;
  await dbDeleteItem(editingId);
  items = items.filter(i=>i.id !== editingId);
  closeSheet();
  renderChips();
  renderList();
});

document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value;
  renderList();
});

document.getElementById('exportBtn').addEventListener('click', ()=>{
  const data = {
    exportedAt: new Date().toISOString(),
    items: items.map(({id, name, qty, location, photo, updatedAt})=>({id, name, qty, location, photo, updatedAt})),
    locations,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-inventaire-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

const importInput = document.getElementById('importInput');
document.getElementById('importBtn').addEventListener('click', ()=> importInput.click());
importInput.addEventListener('change', (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = async (ev)=>{
    let data;
    try {
      data = JSON.parse(ev.target.result);
    } catch(err){
      alert("Fichier invalide : le JSON n'a pas pu être lu.");
      return;
    }
    if(!Array.isArray(data.items) || !Array.isArray(data.locations)){
      alert("Fichier invalide : structure d'inventaire inattendue.");
      return;
    }
    if(!confirm(`Importer remplacera tous les articles et emplacements actuels par ceux du fichier (${data.items.length} article(s)). Continuer ?`)) return;

    await dbClearStore('items');
    await dbClearStore('locations');
    for(const loc of data.locations) await dbPutLocation(loc);
    for(const it of data.items){
      const {id, ...rest} = it;
      await dbAddItem(rest);
    }

    items = await dbGetAllItems();
    locations = (await dbGetAllLocations()).map(l=>l.name);
    renderChips();
    renderList();
    importInput.value = "";
  };
  reader.readAsText(file);
});

async function init(){
  db = await openDB();
  await seedIfEmpty();
  items = await dbGetAllItems();
  locations = (await dbGetAllLocations()).map(l=>l.name);
  renderChips();
  renderList();
}

init();
