if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js');
  });
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  initializeFirestore, persistentLocalCache, persistentSingleTabManager,
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion,
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDkFBIJIdUYvi-Nf8Imp2h4imoMSHKxN_I",
  authDomain: "inventaire-stock-498b5.firebaseapp.com",
  projectId: "inventaire-stock-498b5",
  storageBucket: "inventaire-stock-498b5.firebasestorage.app",
  messagingSenderId: "318508977574",
  appId: "1:318508977574:web:9f2c2fb4ab4c8e1709d367",
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = initializeFirestore(firebaseApp, {
  localCache: persistentLocalCache({tabManager: persistentSingleTabManager()}),
});

const itemsCol = collection(db, 'items');
const metaRef = doc(db, 'meta', 'config');

const DEFAULT_LOCATIONS = ["Container 1", "Container 2", "Container 3", "Hangar de l'huma", "CD93"];
const DEFAULT_CATEGORIES = ["Mobilier", "Mobilier loges", "Signalétique", "Textile", "Matériel production", "outillage", "consommable", "sport", "structure"];
const CONDITIONS = ["Bon état", "Endommagé", "À réparer", "Hors service"];
const DEFAULT_UNITS = ["Unités", "ML", "M2"];
const MAX_PHOTOS = 5;

let items = [];
let units = [];
let locations = [];
let categories = [];
let unsubItems = null;
let unsubMeta = null;

let activeFilter = null;
let activeCategories = new Set();
let searchTerm = "";
let editingId = null;
let newItemRef = null;
let pendingPhotos = [];
let pendingQty = 1;
let selectedIds = new Set();
let currentFilteredIds = [];

const authScreen = document.getElementById('authScreen');
const appRoot = document.getElementById('appRoot');
const authEmail = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const authError = document.getElementById('authError');

const list = document.getElementById('list');
const emptyState = document.getElementById('emptyState');
const itemCount = document.getElementById('itemCount');
const locationChips = document.getElementById('locationChips');
const categoryChips = document.getElementById('categoryChips');
const sheetOverlay = document.getElementById('sheetOverlay');
const sheetTitle = document.getElementById('sheetTitle');
const nameInput = document.getElementById('nameInput');
const qtyDisplay = document.getElementById('qtyDisplay');
const unitSelect = document.getElementById('unitSelect');
const locationSelect = document.getElementById('locationSelect');
const categorySelect = document.getElementById('categorySelect');
const photoInput = document.getElementById('photoInput');
const photoGrid = document.getElementById('photoGrid');
const deleteBtn = document.getElementById('deleteBtn');
const dimensionsInput = document.getElementById('dimensionsInput');
const conditionSelect = document.getElementById('conditionSelect');
const notesInput = document.getElementById('notesInput');
const selectAllBtn = document.getElementById('selectAllBtn');
const selectionCount = document.getElementById('selectionCount');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');

function showAuthError(message){
  authError.textContent = message;
  authError.style.display = 'block';
}
function clearAuthError(){
  authError.style.display = 'none';
  authError.textContent = '';
}

document.getElementById('authSignInBtn').addEventListener('click', async ()=>{
  clearAuthError();
  try {
    await signInWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
  } catch(e){
    showAuthError(translateAuthError(e.code));
  }
});

document.getElementById('authSignUpBtn').addEventListener('click', async ()=>{
  clearAuthError();
  try {
    await createUserWithEmailAndPassword(auth, authEmail.value.trim(), authPassword.value);
  } catch(e){
    showAuthError(translateAuthError(e.code));
  }
});

document.getElementById('signOutBtn').addEventListener('click', async ()=>{
  await signOut(auth);
});

function translateAuthError(code){
  const messages = {
    'auth/invalid-email': "Adresse email invalide.",
    'auth/user-not-found': "Aucun compte avec cet email.",
    'auth/wrong-password': "Mot de passe incorrect.",
    'auth/invalid-credential': "Email ou mot de passe incorrect.",
    'auth/email-already-in-use': "Un compte existe déjà avec cet email.",
    'auth/weak-password': "Le mot de passe doit faire au moins 6 caractères.",
    'auth/missing-password': "Merci de saisir un mot de passe.",
  };
  return messages[code] || "Une erreur est survenue. Réessaie.";
}

onAuthStateChanged(auth, (user)=>{
  if (user){
    authScreen.style.display = 'none';
    appRoot.style.display = 'block';
    startListeners();
  } else {
    authScreen.style.display = 'flex';
    appRoot.style.display = 'none';
    stopListeners();
  }
});

function startListeners(){
  unsubItems = onSnapshot(itemsCol, (snapshot)=>{
    items = snapshot.docs.map((d)=>({id: d.id, ...d.data()}));
    renderChips();
    renderList();
  });
  unsubMeta = onSnapshot(metaRef, (snap)=>{
    const data = snap.data() || {};
    units = data.units && data.units.length ? data.units : DEFAULT_UNITS;
    categories = data.categories && data.categories.length ? data.categories : DEFAULT_CATEGORIES;
    locations = data.locations && data.locations.length ? data.locations : DEFAULT_LOCATIONS;
    renderChips();
    renderCategoryChips();
    renderList();
    if(sheetOverlay.classList.contains('open')){
      const keepUnit = unitSelect.value;
      const keepCat = categorySelect.value;
      const keepLoc = locationSelect.value;
      renderUnitSelect();
      renderCategorySelect();
      renderLocationSelect();
      unitSelect.value = keepUnit;
      categorySelect.value = keepCat;
      locationSelect.value = keepLoc;
    }
  });
  getDoc(metaRef).then(snap=>{
    const data = snap.data() || {};
    const seed = {};
    if(!data.units || !data.units.length) seed.units = DEFAULT_UNITS;
    if(!data.categories || !data.categories.length) seed.categories = DEFAULT_CATEGORIES;
    if(!data.locations || !data.locations.length) seed.locations = DEFAULT_LOCATIONS;
    if(Object.keys(seed).length) setDoc(metaRef, seed, {merge:true});
  });
}

function stopListeners(){
  if (unsubItems) unsubItems();
  if (unsubMeta) unsubMeta();
  items = [];
  units = [];
  categories = [];
  locations = [];
}

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

function renderLocationSelect(){
  locationSelect.innerHTML = locations.map(loc=>
    `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`
  ).join('');
}

function renderCategorySelect(){
  categorySelect.innerHTML = `<option value="">Sélectionner…</option>` + categories.map(cat=>
    `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
  ).join('');
}

function renderUnitSelect(){
  unitSelect.innerHTML = units.map(u=>
    `<option value="${escapeHtml(u)}">${escapeHtml(u)}</option>`
  ).join('');
}

function renderList(){
  for(const id of [...selectedIds]){
    if(!items.find(it=>it.id===id)) selectedIds.delete(id);
  }

  let filtered = items.filter(it=>{
    const matchLoc = !activeFilter || it.location === activeFilter;
    const matchCategory = activeCategories.size === 0 || activeCategories.has(it.category);
    const matchSearch = !searchTerm || it.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchLoc && matchCategory && matchSearch;
  });
  currentFilteredIds = filtered.map(it=>it.id);

  itemCount.textContent = items.length + (items.length>1 ? " articles" : " article");
  renderSelectionBar();

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
      <label class="card-select">
        <input type="checkbox" data-select-id="${it.id}" ${selectedIds.has(it.id) ? 'checked' : ''}>
        <span class="check-visual"></span>
      </label>
      <div class="thumb ${getItemPhotos(it).length ? 'has-photo' : ''}" style="${getItemPhotos(it)[0] ? `background-image:url(${getItemPhotos(it)[0]})` : ''}">${getItemPhotos(it)[0] ? '' : '&#128247;'}</div>
      <div class="card-body" data-action="edit">
        <div class="card-name">${escapeHtml(it.name)}</div>
        ${it.location ? `<span class="card-loc">${escapeHtml(it.location)}</span>` : ''}
        ${it.category ? `<span class="card-category">${escapeHtml(it.category)}</span>` : ''}
      </div>
      <div class="card-actions">
        <div class="stepper">
          <button data-action="dec">–</button>
          <input type="number" inputmode="numeric" class="qty-input mono" data-action="qty" value="${it.qty}" min="0">
          <button data-action="inc">+</button>
        </div>
        ${it.unit ? `<span class="card-unit mono">${escapeHtml(it.unit)}</span>` : ''}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.card').forEach(card=>{
    const id = card.dataset.id;
    card.querySelector('[data-action="edit"]').addEventListener('click', ()=>openSheet(id));
    card.querySelector('[data-action="inc"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      changeQty(id, 1);
    });
    card.querySelector('[data-action="dec"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      changeQty(id, -1);
    });
    const qtyField = card.querySelector('[data-action="qty"]');
    qtyField.addEventListener('click', (e)=> e.stopPropagation());
    qtyField.addEventListener('change', (e)=>{
      setQty(id, e.target.value);
    });
    const thumb = card.querySelector('.thumb.has-photo');
    if(thumb){
      thumb.addEventListener('click', (e)=>{
        e.stopPropagation();
        const it = items.find(i=>i.id===id);
        openPhotoViewer(getItemPhotos(it), 0);
      });
    }
    const selectCheckbox = card.querySelector('[data-select-id]');
    selectCheckbox.addEventListener('click', (e)=> e.stopPropagation());
    selectCheckbox.addEventListener('change', (e)=>{
      if(e.target.checked) selectedIds.add(id); else selectedIds.delete(id);
      renderSelectionBar();
    });
  });
}

function renderSelectionBar(){
  const count = selectedIds.size;
  selectionCount.textContent = count > 0 ? `${count} sélectionné(s)` : '';
  bulkDeleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
  const allSelected = currentFilteredIds.length > 0 && currentFilteredIds.every(id=>selectedIds.has(id));
  selectAllBtn.textContent = allSelected ? 'Tout désélectionner' : 'Tout sélectionner';
}

selectAllBtn.addEventListener('click', ()=>{
  const allSelected = currentFilteredIds.length > 0 && currentFilteredIds.every(id=>selectedIds.has(id));
  if(allSelected){
    currentFilteredIds.forEach(id=>selectedIds.delete(id));
  } else {
    currentFilteredIds.forEach(id=>selectedIds.add(id));
  }
  renderList();
});

bulkDeleteBtn.addEventListener('click', async ()=>{
  if(selectedIds.size === 0) return;
  if(!confirm(`Supprimer ${selectedIds.size} article(s) sélectionné(s) ? Cette action est irréversible.`)) return;
  await Promise.all([...selectedIds].map(id => deleteDoc(doc(itemsCol, id))));
  selectedIds.clear();
  renderSelectionBar();
});

function getItemPhotos(it){
  if(it.photos && it.photos.length) return it.photos;
  if(it.photo) return [it.photo];
  return [];
}

const photoViewerOverlay = document.getElementById('photoViewerOverlay');
const photoViewerImg = document.getElementById('photoViewerImg');
const viewerPrevBtn = document.getElementById('viewerPrevBtn');
const viewerNextBtn = document.getElementById('viewerNextBtn');
const viewerCounter = document.getElementById('viewerCounter');
let viewerPhotos = [];
let viewerIndex = 0;

function openPhotoViewer(photos, index){
  viewerPhotos = photos;
  viewerIndex = index;
  renderPhotoViewer();
  photoViewerOverlay.classList.add('open');
}
function renderPhotoViewer(){
  photoViewerImg.src = viewerPhotos[viewerIndex];
  const multi = viewerPhotos.length > 1;
  viewerPrevBtn.style.visibility = multi ? 'visible' : 'hidden';
  viewerNextBtn.style.visibility = multi ? 'visible' : 'hidden';
  viewerCounter.textContent = multi ? `${viewerIndex+1} / ${viewerPhotos.length}` : '';
}
function closePhotoViewer(){
  photoViewerOverlay.classList.remove('open');
  photoViewerImg.src = '';
}

let touchStartX = 0;
let touchStartY = 0;
let isSwiping = false;

photoViewerOverlay.addEventListener('touchstart', (e)=>{
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
  isSwiping = false;
}, {passive:true});

photoViewerOverlay.addEventListener('touchmove', (e)=>{
  const dx = e.touches[0].clientX - touchStartX;
  const dy = e.touches[0].clientY - touchStartY;
  if(Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) isSwiping = true;
}, {passive:true});

photoViewerOverlay.addEventListener('touchend', (e)=>{
  if(!isSwiping || viewerPhotos.length <= 1) return;
  const dx = e.changedTouches[0].clientX - touchStartX;
  if(Math.abs(dx) > 40){
    if(dx < 0) viewerIndex = (viewerIndex + 1) % viewerPhotos.length;
    else viewerIndex = (viewerIndex - 1 + viewerPhotos.length) % viewerPhotos.length;
    renderPhotoViewer();
  }
});

photoViewerOverlay.addEventListener('click', ()=>{
  if(isSwiping){ isSwiping = false; return; }
  closePhotoViewer();
});
viewerPrevBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  viewerIndex = (viewerIndex - 1 + viewerPhotos.length) % viewerPhotos.length;
  renderPhotoViewer();
});
viewerNextBtn.addEventListener('click', (e)=>{
  e.stopPropagation();
  viewerIndex = (viewerIndex + 1) % viewerPhotos.length;
  renderPhotoViewer();
});

async function changeQty(id, delta){
  const it = items.find(i=>i.id===id);
  if(!it) return;
  const qty = Math.max(0, it.qty + delta);
  await updateDoc(doc(itemsCol, id), {qty, updatedAt: Date.now()});
}

async function setQty(id, value){
  const qty = Math.max(0, parseInt(value, 10) || 0);
  await updateDoc(doc(itemsCol, id), {qty, updatedAt: Date.now()});
}

function escapeHtml(str){
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openSheet(id){
  editingId = id || null;
  newItemRef = editingId ? null : doc(itemsCol);
  const it = id ? items.find(i=>i.id===id) : null;

  sheetTitle.textContent = it ? "Modifier l'article" : "Nouvel article";
  nameInput.value = it ? it.name : "";
  pendingQty = it ? it.qty : 1;
  qtyDisplay.value = pendingQty;
  pendingPhotos = it ? [...getItemPhotos(it)] : [];
  renderPhotoGrid();
  deleteBtn.style.display = it ? 'block' : 'none';

  renderLocationSelect();
  if(it) locationSelect.value = it.location;

  renderCategorySelect();
  categorySelect.value = it ? (it.category || "") : "";

  renderUnitSelect();
  unitSelect.value = it ? (it.unit || units[0]) : units[0];

  dimensionsInput.value = it ? (it.dimensions || "") : "";
  conditionSelect.value = it ? (it.condition || "") : "";
  notesInput.value = it ? (it.notes || "") : "";

  sheetOverlay.classList.add('open');
}

function closeSheet(){
  sheetOverlay.classList.remove('open');
  editingId = null;
  newItemRef = null;
}

document.getElementById('addBtn').addEventListener('click', ()=>openSheet(null));
sheetOverlay.addEventListener('click', (e)=>{ if(e.target === sheetOverlay) closeSheet(); });
document.getElementById('sheetBackBtn').addEventListener('click', closeSheet);

document.getElementById('qtyMinus').addEventListener('click', ()=>{
  pendingQty = Math.max(0, pendingQty - 1);
  qtyDisplay.value = pendingQty;
});
document.getElementById('qtyPlus').addEventListener('click', ()=>{
  pendingQty += 1;
  qtyDisplay.value = pendingQty;
});
qtyDisplay.addEventListener('input', ()=>{
  pendingQty = Math.max(0, parseInt(qtyDisplay.value, 10) || 0);
});
qtyDisplay.addEventListener('blur', ()=>{
  qtyDisplay.value = pendingQty;
});

function renderPhotoGrid(){
  let html = pendingPhotos.map((photo, i)=>`
    <div class="photo-tile" data-index="${i}" style="background-image:url(${photo})">
      <button class="photo-remove" data-index="${i}" aria-label="Supprimer la photo">&times;</button>
    </div>
  `).join('');
  if(pendingPhotos.length < MAX_PHOTOS){
    html += `<div class="photo-tile photo-add" id="photoAddTile">&#128247;</div>`;
  }
  photoGrid.innerHTML = html;

  photoGrid.querySelectorAll('.photo-tile[data-index]').forEach(tile=>{
    tile.addEventListener('click', ()=> openPhotoViewer(pendingPhotos, parseInt(tile.dataset.index)));
  });
  photoGrid.querySelectorAll('.photo-remove').forEach(btn=>{
    btn.addEventListener('click', (e)=>{
      e.stopPropagation();
      pendingPhotos.splice(parseInt(btn.dataset.index), 1);
      renderPhotoGrid();
    });
  });
  const addTile = document.getElementById('photoAddTile');
  if(addTile) addTile.addEventListener('click', ()=> photoInput.click());
}

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
      if(pendingPhotos.length < MAX_PHOTOS){
        pendingPhotos.push(canvas.toDataURL('image/jpeg', 0.7));
        renderPhotoGrid();
      }
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
  photoInput.value = "";
});

document.getElementById('addUnitBtn').addEventListener('click', async ()=>{
  const input = document.getElementById('newUnitInput');
  const val = input.value.trim();
  if(!val) return;
  if(!units.includes(val)){
    await setDoc(metaRef, {units: arrayUnion(val)}, {merge:true});
  }
  unitSelect.value = val;
  input.value = "";
});

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }
  const category = categorySelect.value;
  if(!category){ categorySelect.focus(); return; }
  const location = locationSelect.value || locations[0];
  const unit = unitSelect.value || units[0];
  const dimensions = dimensionsInput.value.trim();
  const condition = conditionSelect.value;
  const notes = notesInput.value.trim();

  const data = {
    name, qty:pendingQty, location, category, unit, photos:pendingPhotos,
    dimensions, condition, notes, updatedAt: Date.now(),
  };

  if(editingId){
    await updateDoc(doc(itemsCol, editingId), data);
  } else {
    await setDoc(newItemRef, data);
  }
  closeSheet();
});

deleteBtn.addEventListener('click', async ()=>{
  if(!editingId) return;
  await deleteDoc(doc(itemsCol, editingId));
  closeSheet();
});

document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value;
  renderList();
});

async function exportExcel(){
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventaire');

  sheet.columns = [
    {header:'Photo', key:'photo', width:10},
    {header:'Nom du produit', key:'name', width:28},
    {header:'Quantité', key:'qty', width:12},
    {header:'Unité', key:'unit', width:12},
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
      unit: it.unit || '',
      location: it.location,
      category: it.category || '',
      dimensions: it.dimensions || '',
      condition: it.condition || '',
      notes: it.notes || '',
    });
    row.height = 48;
    row.alignment = {wrapText: true, vertical: 'middle'};

    const photo = getItemPhotos(it)[0];
    if(photo){
      const match = /^data:image\/(\w+);base64,(.*)$/.exec(photo);
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

function normalizeHeader(str){
  return String(str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

const COLUMN_ALIASES = {
  name: ['nom du produit', 'nom', 'produit'],
  qty: ['quantite', 'qty', 'quantité'],
  unit: ['unite', 'unit'],
  location: ['emplacement', 'location'],
  category: ['categorie', 'category'],
  dimensions: ['dimensions', 'dimension'],
  condition: ['etat general', 'etat', 'condition'],
  notes: ['remarques', 'remarque', 'notes'],
};

function findColumnMap(headerRow){
  const map = {};
  headerRow.eachCell((cell, colNumber)=>{
    const normalized = normalizeHeader(cell.value);
    for(const [field, aliases] of Object.entries(COLUMN_ALIASES)){
      if(aliases.includes(normalized)) map[field] = colNumber;
    }
  });
  return map;
}

function matchFixedValue(raw, allowedList){
  const normalized = normalizeHeader(raw);
  if(!normalized) return null;
  return allowedList.find(v => normalizeHeader(v) === normalized) || null;
}

function matchLocation(raw){
  const normalized = normalizeHeader(raw);
  if(!normalized) return null;
  const exact = locations.find(v => normalizeHeader(v) === normalized);
  if(exact) return exact;
  return locations.find(v => normalized.startsWith(normalizeHeader(v))) || null;
}

async function importExcel(file){
  const buffer = await file.arrayBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if(!sheet){
    alert("Fichier invalide : aucune feuille trouvée.");
    return;
  }

  const colMap = findColumnMap(sheet.getRow(1));
  if(!colMap.name || !colMap.qty || !colMap.location || !colMap.category){
    alert("Colonnes manquantes ou non reconnues. Il faut au minimum : Nom du produit, Quantité, Emplacement, Catégorie.");
    return;
  }

  const validItems = [];
  const errors = [];
  const newUnits = new Set();
  const newCategories = new Set();
  const newLocations = new Set();

  for(let r = 2; r <= sheet.rowCount; r++){
    const row = sheet.getRow(r);
    if(row.cellCount === 0) continue;
    const cell = (field)=> colMap[field] ? row.getCell(colMap[field]).value : null;

    const name = String(cell('name') || '').trim();
    if(!name) continue;

    const rawLocation = String(cell('location') || '').trim();
    let location = '';
    if(rawLocation){
      location = matchLocation(rawLocation) || rawLocation;
      if(!locations.includes(location)) newLocations.add(location);
    }

    const rawCategory = String(cell('category') || '').trim();
    if(!rawCategory){ errors.push(`Ligne ${r} (${name}) : catégorie manquante.`); continue; }
    const category = matchFixedValue(rawCategory, categories) || rawCategory;
    if(!categories.includes(category)) newCategories.add(category);

    const qty = Math.max(0, parseInt(cell('qty'), 10) || 0);
    const unit = String(cell('unit') || '').trim();
    if(unit && !units.includes(unit)) newUnits.add(unit);
    const condition = matchFixedValue(cell('condition'), CONDITIONS) || '';
    const dimensions = String(cell('dimensions') || '').trim();
    const notes = String(cell('notes') || '').trim();

    validItems.push({
      name, qty, unit, location, category, dimensions, condition, notes,
      photos: [], updatedAt: Date.now(),
    });
  }

  if(validItems.length === 0){
    alert(`Aucun article valide trouvé.${errors.length ? '\n\n' + errors.join('\n') : ''}`);
    return;
  }

  const summary = `Importer ${validItems.length} article(s) dans l'inventaire partagé ?` +
    (newLocations.size ? `\n\nNouvel(s) emplacement(s) qui seront créés : ${[...newLocations].join(', ')}` : '') +
    (newCategories.size ? `\n\nNouvelle(s) catégorie(s) qui seront créées : ${[...newCategories].join(', ')}` : '') +
    (errors.length ? `\n\n${errors.length} ligne(s) ignorée(s) :\n${errors.slice(0,10).join('\n')}${errors.length>10 ? '\n…' : ''}` : '');
  if(!confirm(summary)) return;

  if(newUnits.size || newCategories.size || newLocations.size){
    const metaUpdate = {};
    if(newUnits.size) metaUpdate.units = arrayUnion(...newUnits);
    if(newCategories.size) metaUpdate.categories = arrayUnion(...newCategories);
    if(newLocations.size) metaUpdate.locations = arrayUnion(...newLocations);
    await setDoc(metaRef, metaUpdate, {merge:true});
  }
  await Promise.all(validItems.map(it => setDoc(doc(itemsCol), it)));

  alert(`${validItems.length} article(s) importé(s).${errors.length ? ` ${errors.length} ligne(s) ignorée(s).` : ''}`);
}

const importExcelInput = document.getElementById('importExcelInput');
document.getElementById('importExcelBtn').addEventListener('click', ()=> importExcelInput.click());
importExcelInput.addEventListener('change', async (e)=>{
  const file = e.target.files[0];
  if(!file) return;
  try {
    await importExcel(file);
  } catch(err){
    alert("Erreur lors de la lecture du fichier : " + err.message);
  }
  importExcelInput.value = "";
});
