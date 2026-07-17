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
  collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, arrayUnion,
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

const LOCATIONS = ["Container 1", "Container 2", "Container 3", "Hangar de l'huma", "CD93"];
const SEED_CATEGORIES = ["Mobilier", "Mobilier loges", "Signalétique", "Textile", "Matériel production", "outillage", "consommable", "sport", "structure"];
const MAX_PHOTOS = 5;

let items = [];
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
const locationSelect = document.getElementById('locationSelect');
const categorySelect = document.getElementById('categorySelect');
const photoInput = document.getElementById('photoInput');
const photoGrid = document.getElementById('photoGrid');
const deleteBtn = document.getElementById('deleteBtn');
const dimensionsInput = document.getElementById('dimensionsInput');
const conditionSelect = document.getElementById('conditionSelect');
const notesInput = document.getElementById('notesInput');

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
    renderLocationSelect();
    setDoc(metaRef, {categories: arrayUnion(...SEED_CATEGORIES)}, {merge:true});
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
    renderCategoryChips();
    renderList();
  });
  unsubMeta = onSnapshot(metaRef, (snap)=>{
    const data = snap.data() || {};
    categories = data.categories || [];
    renderCategoryChips();
    renderList();
    if(sheetOverlay.classList.contains('open')){
      const keepCat = categorySelect.value;
      renderCategorySelect();
      categorySelect.value = keepCat;
    }
  });
}

function stopListeners(){
  if (unsubItems) unsubItems();
  if (unsubMeta) unsubMeta();
  items = [];
  categories = [];
}

function renderChips(){
  let html = `<button class="chip ${activeFilter===null?'active':''}" data-loc="">Tous</button>`;
  LOCATIONS.forEach(loc=>{
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
  locationSelect.innerHTML = LOCATIONS.map(loc=>
    `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`
  ).join('');
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
      <div class="thumb ${getItemPhotos(it).length ? 'has-photo' : ''}" style="${getItemPhotos(it)[0] ? `background-image:url(${getItemPhotos(it)[0]})` : ''}">${getItemPhotos(it)[0] ? '' : '&#128247;'}</div>
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
    const thumb = card.querySelector('.thumb.has-photo');
    if(thumb){
      thumb.addEventListener('click', (e)=>{
        e.stopPropagation();
        const it = items.find(i=>i.id===id);
        openPhotoViewer(getItemPhotos(it), 0);
      });
    }
  });
}

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
photoViewerOverlay.addEventListener('click', closePhotoViewer);
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
  qtyDisplay.textContent = pendingQty;
  pendingPhotos = it ? [...getItemPhotos(it)] : [];
  renderPhotoGrid();
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
  newItemRef = null;
}

document.getElementById('addBtn').addEventListener('click', ()=>openSheet(null));
sheetOverlay.addEventListener('click', (e)=>{ if(e.target === sheetOverlay) closeSheet(); });
document.getElementById('sheetBackBtn').addEventListener('click', closeSheet);

document.getElementById('qtyMinus').addEventListener('click', ()=>{
  pendingQty = Math.max(0, pendingQty - 1);
  qtyDisplay.textContent = pendingQty;
});
document.getElementById('qtyPlus').addEventListener('click', ()=>{
  pendingQty += 1;
  qtyDisplay.textContent = pendingQty;
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

document.getElementById('addCatBtn').addEventListener('click', async ()=>{
  const input = document.getElementById('newCatInput');
  const val = input.value.trim();
  if(!val) return;
  if(!categories.includes(val)){
    await setDoc(metaRef, {categories: arrayUnion(val)}, {merge:true});
  }
  categorySelect.value = val;
  input.value = "";
});

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); return; }
  const category = categorySelect.value;
  if(!category){ categorySelect.focus(); return; }
  const location = locationSelect.value || LOCATIONS[0];
  const dimensions = dimensionsInput.value.trim();
  const condition = conditionSelect.value;
  const notes = notesInput.value.trim();

  const data = {
    name, qty:pendingQty, location, category, photos:pendingPhotos,
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

document.getElementById('exportBtn').addEventListener('click', ()=>{
  const data = {
    exportedAt: new Date().toISOString(),
    items: items.map((it)=>({
      id: it.id, name: it.name, qty: it.qty, location: it.location, category: it.category,
      photos: getItemPhotos(it), dimensions: it.dimensions, condition: it.condition,
      notes: it.notes, updatedAt: it.updatedAt,
    })),
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
    if(!Array.isArray(data.items)){
      alert("Fichier invalide : structure d'inventaire inattendue.");
      return;
    }
    if(!confirm(`Importer ajoutera ${data.items.length} article(s) du fichier à l'inventaire partagé actuel. Continuer ?`)) return;

    if(data.categories) await setDoc(metaRef, {categories: arrayUnion(...data.categories)}, {merge:true});
    for(const it of data.items){
      const {id, photo, photos, ...rest} = it;
      rest.photos = photos && photos.length ? photos : (photo ? [photo] : []);
      await setDoc(doc(itemsCol), rest);
    }
    importInput.value = "";
  };
  reader.readAsText(file);
});
