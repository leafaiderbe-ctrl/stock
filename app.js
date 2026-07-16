if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js');
  });
}

const DB_NAME = 'stockDB';
const DB_VERSION = 2;
let db;

const SEED_ITEMS = [
  {name:"Vis à bois 4x40", qty:120, location:"Atelier - Tiroir 2", category:"Outillage", photo:null},
  {name:"Ampoules LED E27", qty:6, location:"Cave - Étagère A", category:"Électroménager", photo:null},
  {name:"Filtre à café", qty:2, location:"Cuisine - Placard haut", category:"Électroménager", photo:null},
];
const SEED_LOCATIONS = ["Atelier - Tiroir 2", "Cave - Étagère A", "Cuisine - Placard haut", "Garage"];
const SEED_CATEGORIES = ["Outillage", "Électroménager", "Mobilier", "Décoration"];

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
      if(!database.objectStoreNames.contains('categories')){
        database.createObjectStore('categories', {keyPath:'name'});
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
function dbGetAllCategories(){ return idbRequest(store('categories').getAll()); }
function dbPutCategory(name){ return idbRequest(store('categories','readwrite').put({name})); }
function dbClearStore(name){ return idbRequest(store(name,'readwrite').clear()); }

async function seedIfEmpty(){
  const existingLocations = await dbGetAllLocations();
  if(existingLocations.length === 0){
    for(const loc of SEED_LOCATIONS) await dbPutLocation(loc);
  }
  const existingCategories = await dbGetAllCategories();
  if(existingCategories.length === 0){
    for(const cat of SEED_CATEGORIES) await dbPutCategory(cat);
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
let categories = [];

let activeFilter = null;
let activeCategories = new Set();
let searchTerm = "";
let editingId = null;
let pendingPhoto = null;
let pendingQty = 1;

const list = document.getElementById('list');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');
const locationChips = document.getElementById('locationChips');
const categoryChips = document.getElementById('categoryChips');
const sheetOverlay = document.getElementById('sheetOverlay');
const sheetTitle = document.getElementById('sheetTitle');
const nameInput = document.getElementById('nameInput');
const qtyDisplay = document.getElementById('qtyDisplay');
const locationSelect = document.getElementById('locationSelect');
const categorySelect = document.getElementById('categorySelect');
const photoInput = document.getElementById('photoInput');
const photoPreview = document.getElementById('photoPreview');
const deleteBtn = document.getElementById('deleteBtn');
const dimensionsInput = document.getElementById('dimensionsInput');
const conditionSelect = document.getElementById('conditionSelect');
const notesInput = document.getElementById('notesInput');

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

function renderCategoryChips(){
  let html = `<button class="chip ${activeCategories.size===0?'active':''}" data-cat="">Toutes</button>`;
  categories.forEach(cat=>{
    html += `<button class="chip ${activeCategories.has(cat)?'active':''}" data-cat="${escapeHtml(cat)}">${escapeHtml(cat)}</button>`;
  });
  categoryChips.innerHTML = html;
  categoryChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const cat = chip.dataset.cat;
      if(!cat){
        activeCategories.clear();
      } else if(activeCategories.has(cat)){
        activeCategories.delete(cat);
      } else {
        activeCategories.add(cat);
      }
      renderCategoryChips();
      renderList();
    });
  });
}

function renderCategorySelect(){
  categorySelect.innerHTML = `<option value="">Sélectionner…</option>` + categories.map(cat=>
    `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
  ).join('');
}

function renderList(){
  let filtered = items.filter(it=>{
    const matchLoc = !activeFilter || it.location === activeFilter;
    const matchCategory = activeCategories.size === 0 || activeCategories.has(it.category);
    const matchSearch = !searchTerm || it.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchLoc && matchCategory && matchSearch;
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
        ${it.category ? `<span class="card-category">${escapeHtml(it.category)}</span>` : ''}
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

  renderCategorySelect();
  categorySelect.value = it ? (it.category || "") : "";

  dimensionsInput.value = it ? (it.dimensions || "") : "";
  conditionSelect.value = it ? (it.condition || "") : "";
  notesInput.value = it ? (it.notes || "") : "";

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

document.getElementById('addCatBtn').addEventListener('click', async ()=>{
  const input = document.getElementById('newCatInput');
  const val = input.value.trim();
  if(!val) return;
  if(!categories.includes(val)){
    categories.push(val);
    await dbPutCategory(val);
  }
  renderCategorySelect();
  categorySelect.value = val;
  input.value = "";
  renderCategoryChips();
});

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }
  const category = categorySelect.value;
  if(!category){ categorySelect.focus(); return; }
  const location = locationSelect.value || locations[0] || "Sans emplacement";
  const dimensions = dimensionsInput.value.trim();
  const condition = conditionSelect.value;
  const notes = notesInput.value.trim();

  if(editingId){
    const it = items.find(i=>i.id===editingId);
    it.name = name;
    it.qty = pendingQty;
    it.location = location;
    it.category = category;
    it.photo = pendingPhoto;
    it.dimensions = dimensions;
    it.condition = condition;
    it.notes = notes;
    it.updatedAt = Date.now();
    await dbPutItem(it);
  } else {
    const newItem = {name, qty:pendingQty, location, category, photo:pendingPhoto, dimensions, condition, notes, updatedAt: Date.now()};
    newItem.id = await dbAddItem(newItem);
    items.push(newItem);
  }
  closeSheet();
  renderChips();
  renderCategoryChips();
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
    items: items.map(({id, name, qty, location, category, photo, dimensions, condition, notes, updatedAt})=>({id, name, qty, location, category, photo, dimensions, condition, notes, updatedAt})),
    locations,
    categories,
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-inventaire-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

async function exportExcel(){
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventaire');

  sheet.columns = [
    {header:'Photo', key:'photo', width:10},
    {header:'Nom du produit', key:'name', width:28},
    {header:'Quantité', key:'qty', width:12},
    {header:'Emplacement', key:'location', width:22},
    {header:'Catégorie', key:'category', width:18},
    {header:'Dimensions', key:'dimensions', width:18},
    {header:'État général', key:'condition', width:16},
    {header:'Remarques', key:'notes', width:36},
  ];
  sheet.getRow(1).font = {bold:true};

  items.forEach((it)=>{
    const row = sheet.addRow({
      photo: '',
      name: it.name,
      qty: it.qty,
      location: it.location,
      category: it.category || '',
      dimensions: it.dimensions || '',
      condition: it.condition || '',
      notes: it.notes || '',
    });
    row.height = 48;
    row.alignment = {wrapText: true, vertical: 'middle'};

    if(it.photo){
      const match = /^data:image\/(\w+);base64,(.*)$/.exec(it.photo);
      if(match){
        const ext = match[1] === 'jpg' ? 'jpeg' : match[1];
        const imageId = workbook.addImage({base64: match[2], extension: ext});
        sheet.addImage(imageId, {
          tl: {col:0, row: row.number - 1},
          br: {col:1, row: row.number},
          editAs: 'oneCell',
        });
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stock-inventaire-${new Date().toISOString().slice(0,10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('exportExcelBtn').addEventListener('click', async ()=>{
  await exportExcel();
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
    if(!confirm(`Importer remplacera tous les articles, emplacements et catégories actuels par ceux du fichier (${data.items.length} article(s)). Continuer ?`)) return;

    await dbClearStore('items');
    await dbClearStore('locations');
    await dbClearStore('categories');
    for(const loc of data.locations) await dbPutLocation(loc);
    for(const cat of (data.categories || [])) await dbPutCategory(cat);
    for(const it of data.items){
      const {id, ...rest} = it;
      await dbAddItem(rest);
    }

    items = await dbGetAllItems();
    locations = (await dbGetAllLocations()).map(l=>l.name);
    categories = (await dbGetAllCategories()).map(c=>c.name);
    activeCategories.clear();
    renderChips();
    renderCategoryChips();
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
  categories = (await dbGetAllCategories()).map(c=>c.name);
  renderChips();
  renderCategoryChips();
  renderList();
}

init();
