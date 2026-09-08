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
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot,
  arrayUnion, arrayRemove, query, orderBy, limit, serverTimestamp, writeBatch,
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
const usersCol = collection(db, 'users');
const activityCol = collection(db, 'activity');

const DEFAULT_LOCATIONS = ["ALGECO 0", "CONTAINER 1", "CONTAINER 2", "CONTAINER 3", "HANGAR HUMA", "CENTRE TECHNIQUE", "CD93", "EVENTEAM BOULOGNE", "A DONNER", "A JETER", "PRESTA"];
const DEFAULT_CATEGORIES = ["MOBILIER", "SIGNALÉTIQUE", "TEXTILE", "MATÉRIEL PRODUCTION", "OUTILLAGE", "CONSOMMABLE", "SPORT", "STRUCTURE"];
const CONDITIONS = ["Bon état", "Usagé", "À réparer"];
const DEFAULT_UNITS = ["ML", "rouleaux", "m²", "U"];
const DEFAULT_SUBLOCATIONS = ["MALLE RÉGIE", "CAISSE PLASTIQUE", "PALETTE"];
const MAX_PHOTOS = 5;
const ADMIN_PASSWORD = "BelEte2026";

let items = [];
let units = [];
let locations = [];
let categories = [];
let subLocations = [];
let unsubItems = null;
let unsubMeta = null;

let activeFilter = null;
let activeCategories = new Set();
let activeStoredFilter = null;
let activeCreators = new Set();
let searchTerm = "";
let editingId = null;
let newItemRef = null;
let pendingPhotos = [];
let pendingQty = 1;
let selectedIds = new Set();
let currentFilteredIds = [];
let isAdmin = false;
let sheetOriginalPhotoCount = 0;
let sheetSnapshot = null;
let sheetForceClose = false;

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
const storedChips = document.getElementById('storedChips');
const creatorChips = document.getElementById('creatorChips');
const sheetOverlay = document.getElementById('sheetOverlay');
const sheetTitle = document.getElementById('sheetTitle');
const nameInput = document.getElementById('nameInput');
const qtyDisplay = document.getElementById('qtyDisplay');
const unitSelect = document.getElementById('unitSelect');
const locationSelect = document.getElementById('locationSelect');
const subLocationSelect = document.getElementById('subLocationSelect');
const categorySelect = document.getElementById('categorySelect');
const photoInput = document.getElementById('photoInput');
const photoGrid = document.getElementById('photoGrid');
const deleteBtn = document.getElementById('deleteBtn');
const storedCheckbox = document.getElementById('storedCheckbox');
const dimensionsInput = document.getElementById('dimensionsInput');
const conditionSelect = document.getElementById('conditionSelect');
const notesInput = document.getElementById('notesInput');
const sheetMetaInfo = document.getElementById('sheetMetaInfo');
const sheetMetaText = document.getElementById('sheetMetaText');
const sheetError = document.getElementById('sheetError');

function showSheetError(msg){
  sheetError.textContent = msg;
  sheetError.style.display = 'block';
}
function clearSheetError(){
  sheetError.style.display = 'none';
  sheetError.textContent = '';
}
const selectAllBtn = document.getElementById('selectAllBtn');
const selectionCount = document.getElementById('selectionCount');
const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
const bulkEditBtn = document.getElementById('bulkEditBtn');
const bulkEditOverlay = document.getElementById('bulkEditOverlay');
const bulkEditTitle = document.getElementById('bulkEditTitle');
const bulkEditLocationSelect = document.getElementById('bulkEditLocationSelect');
const bulkEditCategorySelect = document.getElementById('bulkEditCategorySelect');
const bulkEditApplyBtn = document.getElementById('bulkEditApplyBtn');

const adminOverlay = document.getElementById('adminOverlay');
const adminLoginView = document.getElementById('adminLoginView');
const adminManageView = document.getElementById('adminManageView');
const adminPasswordInput = document.getElementById('adminPasswordInput');
const adminError = document.getElementById('adminError');
const adminUnlockBtn = document.getElementById('adminUnlockBtn');
const adminLocationList = document.getElementById('adminLocationList');
const adminCategoryList = document.getElementById('adminCategoryList');
const adminNewLocationInput = document.getElementById('adminNewLocationInput');
const adminNewCategoryInput = document.getElementById('adminNewCategoryInput');
const adminSubLocationList = document.getElementById('adminSubLocationList');
const adminNewSubLocationInput = document.getElementById('adminNewSubLocationInput');
const adminUnitList = document.getElementById('adminUnitList');
const adminNewUnitInput = document.getElementById('adminNewUnitInput');
const adminAccountsList = document.getElementById('adminAccountsList');
const adminActivityList = document.getElementById('adminActivityList');
const adminActivityAccountSelect = document.getElementById('adminActivityAccountSelect');

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

async function ensureUserRecord(user){
  const uRef = doc(usersCol, user.uid);
  const snap = await getDoc(uRef);
  if(!snap.exists()){
    await setDoc(uRef, {email: user.email, createdAt: serverTimestamp()});
  } else if(snap.data().email !== user.email){
    await setDoc(uRef, {email: user.email}, {merge:true});
  }
}

function logActivity(type, itemName){
  const user = auth.currentUser;
  addDoc(activityCol, {
    type,
    itemName: itemName || '',
    userEmail: user ? user.email : 'inconnu',
    uid: user ? user.uid : null,
    createdAt: serverTimestamp(),
  }).catch(()=>{});
}

function formatDate(ts){
  if(!ts || !ts.toDate) return '';
  return ts.toDate().toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'});
}

function formatEpoch(ms){
  if(!ms) return '';
  return new Date(ms).toLocaleString('fr-FR', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'});
}

onAuthStateChanged(auth, (user)=>{
  if (user){
    authScreen.style.display = 'none';
    appRoot.style.display = 'block';
    ensureUserRecord(user);
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
    renderCreatorChips();
    renderList();
    if(isAdmin && adminOverlay.classList.contains('open')) renderAdminLists();
  });
  unsubMeta = onSnapshot(metaRef, (snap)=>{
    const data = snap.data() || {};
    units = data.units && data.units.length ? data.units : DEFAULT_UNITS;
    categories = data.categories && data.categories.length ? data.categories : DEFAULT_CATEGORIES;
    locations = data.locations && data.locations.length ? data.locations : DEFAULT_LOCATIONS;
    subLocations = data.subLocations && data.subLocations.length ? data.subLocations : DEFAULT_SUBLOCATIONS;
    renderChips();
    renderCategoryChips();
    renderStoredChips();
    renderList();
    if(isAdmin && adminOverlay.classList.contains('open')) renderAdminLists();
    if(bulkEditOverlay.classList.contains('open')){
      const keepLoc = bulkEditLocationSelect.value;
      const keepCat = bulkEditCategorySelect.value;
      renderBulkEditSelects();
      bulkEditLocationSelect.value = keepLoc;
      bulkEditCategorySelect.value = keepCat;
    }
    if(sheetOverlay.classList.contains('open')){
      const keepUnit = unitSelect.value;
      const keepCat = categorySelect.value;
      const keepLoc = locationSelect.value;
      const keepSubLoc = subLocationSelect.value;
      renderUnitSelect();
      renderCategorySelect();
      renderLocationSelect();
      renderSubLocationSelect();
      unitSelect.value = keepUnit;
      categorySelect.value = keepCat;
      locationSelect.value = keepLoc;
      subLocationSelect.value = keepSubLoc;
    }
  });
  getDoc(metaRef).then(snap=>{
    const data = snap.data() || {};
    const seed = {};
    if(!data.units || !data.units.length) seed.units = DEFAULT_UNITS;
    if(!data.categories || !data.categories.length) seed.categories = DEFAULT_CATEGORIES;
    if(!data.locations || !data.locations.length) seed.locations = DEFAULT_LOCATIONS;
    if(!data.subLocations || !data.subLocations.length) seed.subLocations = DEFAULT_SUBLOCATIONS;
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
  subLocations = [];
  activeCreators = new Set();
  isAdmin = false;
}

function renderChips(){
  let html = `<button class="chip ${activeFilter===null?'active':''}" data-loc="">Tous</button>`;
  html += `<button class="chip ${activeFilter==='__BLANK__'?'active':''}" data-loc="__BLANK__">-</button>`;
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
  html += `<button class="chip ${activeCategories.has('__BLANK__')?'active':''}" data-cat="__BLANK__">-</button>`;
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

function renderStoredChips(){
  const options = [
    {value:'', label:'Tous'},
    {value:'true', label:'Rangé'},
    {value:'false', label:'Non rangé'},
  ];
  storedChips.innerHTML = options.map(o=>{
    const isActive = activeStoredFilter === null ? o.value === '' : String(activeStoredFilter) === o.value;
    return `<button class="chip ${isActive ? 'active' : ''}" data-stored="${o.value}">${o.label}</button>`;
  }).join('');
  storedChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const val = chip.dataset.stored;
      activeStoredFilter = val === '' ? null : (val === 'true');
      renderStoredChips();
      renderList();
    });
  });
}

function sortAlpha(arr){
  return [...arr].sort((a,b)=> a.localeCompare(b, 'fr', {sensitivity:'base'}));
}

function renderCreatorChips(){
  const creators = sortAlpha([...new Set(items.map(it=>it.createdBy).filter(Boolean))]);
  const hasBlank = items.some(it=>!it.createdBy);

  let html = `<button class="chip ${activeCreators.size===0?'active':''}" data-creator="">Tous</button>`;
  if(hasBlank){
    html += `<button class="chip ${activeCreators.has('__BLANK__')?'active':''}" data-creator="__BLANK__">-</button>`;
  }
  creators.forEach(email=>{
    html += `<button class="chip ${activeCreators.has(email)?'active':''}" data-creator="${escapeHtml(email)}">${escapeHtml(email.split('@')[0])}</button>`;
  });
  creatorChips.innerHTML = html;
  creatorChips.querySelectorAll('.chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const val = chip.dataset.creator;
      if(!val){
        activeCreators.clear();
      } else if(activeCreators.has(val)){
        activeCreators.delete(val);
      } else {
        activeCreators.add(val);
      }
      renderCreatorChips();
      renderList();
    });
  });
}

function renderLocationSelect(){
  locationSelect.innerHTML = `<option value="">-</option>` + sortAlpha(locations).map(loc=>
    `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`
  ).join('');
}

function renderSubLocationSelect(){
  subLocationSelect.innerHTML = `<option value="">— Aucun —</option>` + sortAlpha(subLocations).map(loc=>
    `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`
  ).join('');
}

function renderCategorySelect(){
  categorySelect.innerHTML = `<option value="">Sélectionner…</option>` + sortAlpha(categories).map(cat=>
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
    const matchLoc = !activeFilter || (activeFilter === '__BLANK__' ? !it.location : it.location === activeFilter);
    const matchCategory = activeCategories.size === 0 || activeCategories.has(it.category) || (activeCategories.has('__BLANK__') && !it.category);
    const matchStored = activeStoredFilter === null || !!it.stored === activeStoredFilter;
    const matchCreator = activeCreators.size === 0 || activeCreators.has(it.createdBy) || (activeCreators.has('__BLANK__') && !it.createdBy);
    const matchSearch = !searchTerm || it.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchLoc && matchCategory && matchStored && matchCreator && matchSearch;
  });
  filtered.sort((a,b)=> a.name.localeCompare(b.name, 'fr', {sensitivity:'base'}));
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
    <div class="card ${it.stored ? 'stored' : ''}" data-id="${it.id}">
      <label class="card-select">
        <input type="checkbox" data-select-id="${it.id}" ${selectedIds.has(it.id) ? 'checked' : ''}>
        <span class="check-visual"></span>
      </label>
      <div class="thumb ${getItemPhotos(it).length ? 'has-photo' : ''}" style="${getItemPhotos(it)[0] ? `background-image:url(${getItemPhotos(it)[0]})` : ''}">${getItemPhotos(it)[0] ? '' : '&#128247;'}</div>
      <div class="card-body" data-action="edit">
        <div class="card-top-row">
          <span class="card-name">${escapeHtml(it.name)}</span>
          <label class="stored-toggle">
            <input type="checkbox" data-stored-id="${it.id}" ${it.stored ? 'checked' : ''}>
            <span>Rangé</span>
          </label>
          ${it.location ? `<span class="card-loc">${escapeHtml(it.location)}</span>` : ''}
          ${it.subLocation ? `<span class="card-subloc">${escapeHtml(it.subLocation)}</span>` : ''}
          ${it.category ? `<span class="card-category">${escapeHtml(it.category)}</span>` : ''}
        </div>
        <div class="card-details">
          ${it.dimensions ? `<div class="card-detail"><b>Dimensions</b>${escapeHtml(it.dimensions)}</div>` : ''}
          ${it.condition ? `<div class="card-detail"><b>État</b>${escapeHtml(it.condition)}</div>` : ''}
          ${it.notes ? `<div class="card-detail card-notes"><b>Remarques</b>${escapeHtml(it.notes)}</div>` : ''}
        </div>
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
    const storedToggle = card.querySelector('[data-stored-id]');
    storedToggle.addEventListener('click', (e)=> e.stopPropagation());
    storedToggle.addEventListener('change', (e)=>{
      toggleStored(id, e.target.checked);
    });
  });
}

async function toggleStored(id, stored){
  await updateDoc(doc(itemsCol, id), {stored, updatedAt: Date.now()});
}

function renderSelectionBar(){
  const count = selectedIds.size;
  selectionCount.textContent = count > 0 ? `${count} sélectionné(s)` : '';
  bulkDeleteBtn.style.display = count > 0 ? 'inline-block' : 'none';
  bulkEditBtn.style.display = count > 0 ? 'inline-block' : 'none';
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
  history.pushState({modal:'photo'}, '');
}
function renderPhotoViewer(){
  photoViewerImg.src = viewerPhotos[viewerIndex];
  const multi = viewerPhotos.length > 1;
  viewerPrevBtn.style.visibility = multi ? 'visible' : 'hidden';
  viewerNextBtn.style.visibility = multi ? 'visible' : 'hidden';
  viewerCounter.textContent = multi ? `${viewerIndex+1} / ${viewerPhotos.length}` : '';
}
function closePhotoViewer(){
  if(photoViewerOverlay.classList.contains('open')) history.back();
}
function hidePhotoViewer(){
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

  clearSheetError();
  sheetTitle.textContent = it ? "Modifier l'article" : "Nouvel article";
  nameInput.value = it ? it.name : "";
  storedCheckbox.checked = it ? !!it.stored : false;
  pendingQty = it ? it.qty : 1;
  qtyDisplay.value = pendingQty;
  pendingPhotos = it ? [...getItemPhotos(it)] : [];
  sheetOriginalPhotoCount = pendingPhotos.length;
  renderPhotoGrid();
  deleteBtn.style.display = it ? 'block' : 'none';

  renderLocationSelect();
  locationSelect.value = it ? (it.location || '') : '';

  renderSubLocationSelect();
  subLocationSelect.value = it ? (it.subLocation || "") : "";

  renderCategorySelect();
  categorySelect.value = it ? (it.category || "") : "";

  renderUnitSelect();
  const defaultUnit = units.includes('U') ? 'U' : units[0];
  unitSelect.value = it ? (it.unit || defaultUnit) : defaultUnit;

  dimensionsInput.value = it ? (it.dimensions || "") : "";
  conditionSelect.value = it ? (it.condition || "") : "";
  notesInput.value = it ? (it.notes || "") : "";

  const metaLines = [];
  if(it && it.createdBy) metaLines.push(`Créé par ${it.createdBy}${it.createdAt ? ' le ' + formatEpoch(it.createdAt) : ''}`);
  if(it && it.updatedBy && it.updatedAt !== it.createdAt) metaLines.push(`Modifié par ${it.updatedBy}${it.updatedAt ? ' le ' + formatEpoch(it.updatedAt) : ''}`);
  if(it && it.photosUpdatedBy) metaLines.push(`Photos ajoutées par ${it.photosUpdatedBy}${it.photosUpdatedAt ? ' le ' + formatEpoch(it.photosUpdatedAt) : ''}`);
  if(metaLines.length){
    sheetMetaText.innerHTML = metaLines.map(l=>escapeHtml(l)).join('<br>');
    sheetMetaInfo.style.display = 'block';
  } else {
    sheetMetaInfo.style.display = 'none';
  }

  sheetOverlay.classList.add('open');
  history.pushState({modal:'sheet'}, '');
  sheetSnapshot = captureSheetSnapshot();
}

function captureSheetSnapshot(){
  return JSON.stringify({
    name: nameInput.value,
    stored: storedCheckbox.checked,
    qty: pendingQty,
    unit: unitSelect.value,
    location: locationSelect.value,
    subLocation: subLocationSelect.value,
    category: categorySelect.value,
    dimensions: dimensionsInput.value,
    condition: conditionSelect.value,
    notes: notesInput.value,
    photos: pendingPhotos,
  });
}

function hasUnsavedChanges(){
  return sheetOverlay.classList.contains('open') && captureSheetSnapshot() !== sheetSnapshot;
}

function closeSheet(){
  if(!sheetOverlay.classList.contains('open')) return;
  if(hasUnsavedChanges() && !confirm("Des modifications n'ont pas été enregistrées. Quitter sans enregistrer ?")) return;
  sheetForceClose = true;
  history.back();
}

function forceCloseSheet(){
  if(!sheetOverlay.classList.contains('open')) return;
  sheetForceClose = true;
  history.back();
}

function hideSheet(){
  sheetOverlay.classList.remove('open');
  editingId = null;
  newItemRef = null;
}

function openAdmin(){
  adminPasswordInput.value = '';
  adminError.style.display = 'none';
  if(isAdmin){
    showAdminManageView();
  } else {
    adminLoginView.style.display = 'block';
    adminManageView.style.display = 'none';
  }
  adminOverlay.classList.add('open');
  history.pushState({modal:'admin'}, '');
}

function closeAdmin(){
  if(adminOverlay.classList.contains('open')) history.back();
}

function hideAdmin(){
  adminOverlay.classList.remove('open');
}

function showAdminManageView(){
  adminLoginView.style.display = 'none';
  adminManageView.style.display = 'block';
  renderAdminLists();
  loadAdminAccounts();
  loadAdminActivity();
}

async function loadAdminAccounts(){
  adminAccountsList.innerHTML = '<div class="admin-list-item"><span>Chargement…</span></div>';
  try {
    const snap = await getDocs(usersCol);
    const accounts = snap.docs.map(d=>d.data());
    accounts.sort((a,b)=> (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    adminAccountsList.innerHTML = accounts.length
      ? accounts.map(u=>`<div class="admin-list-item"><span>${escapeHtml(u.email || '?')}${u.createdAt ? ` — créé le ${formatDate(u.createdAt)}` : ''}</span></div>`).join('')
      : '<div class="admin-list-item"><span>Aucun compte enregistré.</span></div>';

    const keepSelection = adminActivityAccountSelect.value;
    const emails = accounts.map(u=>u.email).filter(Boolean).sort((a,b)=> a.localeCompare(b, 'fr', {sensitivity:'base'}));
    adminActivityAccountSelect.innerHTML = '<option value="">Tous les comptes</option>' +
      emails.map(email=>`<option value="${escapeHtml(email)}">${escapeHtml(email)}</option>`).join('');
    adminActivityAccountSelect.value = keepSelection;
  } catch(e){
    adminAccountsList.innerHTML = '<div class="admin-list-item"><span>Erreur de chargement.</span></div>';
  }
}

async function loadAdminActivity(){
  adminActivityList.innerHTML = '<div class="admin-list-item"><span>Chargement…</span></div>';
  const ACTIVITY_LABELS = {create:'Création', edit:'Modification', photo_add:'Ajout photo'};
  try {
    // Fetch a wide recent window ordered by date only (no composite index
    // needed), then filter by account client-side so a specific person's
    // activity isn't missed just because others were more active recently.
    const q = query(activityCol, orderBy('createdAt', 'desc'), limit(300));
    const snap = await getDocs(q);
    let rows = snap.docs.map(d=>d.data());
    const filterEmail = adminActivityAccountSelect.value;
    if(filterEmail) rows = rows.filter(a=> a.userEmail === filterEmail);
    rows = rows.slice(0, 50);
    adminActivityList.innerHTML = rows.length
      ? rows.map(a=>`<div class="admin-list-item"><span>${formatDate(a.createdAt)} — ${escapeHtml(a.userEmail || '?')} — ${ACTIVITY_LABELS[a.type] || a.type} — ${escapeHtml(a.itemName || '')}</span></div>`).join('')
      : '<div class="admin-list-item"><span>Aucune activité enregistrée' + (filterEmail ? ' pour ce compte' : '') + '.</span></div>';
  } catch(e){
    adminActivityList.innerHTML = '<div class="admin-list-item"><span>Erreur de chargement.</span></div>';
  }
}

adminActivityAccountSelect.addEventListener('change', loadAdminActivity);

const ADMIN_FIELD_INFO = {
  location: {label: 'emplacement', article: "l'", listGetter: ()=>locations, metaKey: 'locations'},
  category: {label: 'catégorie', article: 'la ', listGetter: ()=>categories, metaKey: 'categories'},
  subLocation: {label: 'sous-emplacement', article: 'le ', listGetter: ()=>subLocations, metaKey: 'subLocations'},
  unit: {label: 'unité', article: "l'", listGetter: ()=>units, metaKey: 'units'},
};

function renderAdminField(listEl, itemField){
  const info = ADMIN_FIELD_INFO[itemField];
  const sorted = [...info.listGetter()].sort((a,b)=> a.localeCompare(b, 'fr', {sensitivity:'base'}));
  listEl.innerHTML = sorted.map(val=>{
    const count = items.filter(it=>it[itemField]===val).length;
    return `<div class="admin-list-item">
      <span>${escapeHtml(val)}${count ? ` (${count})` : ''}</span>
      <div class="admin-list-actions">
        <button class="admin-rename-btn" data-rename="${escapeHtml(val)}" aria-label="Renommer">&#9998;</button>
        <button data-remove="${escapeHtml(val)}" aria-label="Supprimer">&times;</button>
      </div>
    </div>`;
  }).join('');
  listEl.querySelectorAll('[data-rename]').forEach(btn=>{
    btn.addEventListener('click', ()=> renameFieldValue(itemField, btn.dataset.rename));
  });
  listEl.querySelectorAll('[data-remove]').forEach(btn=>{
    btn.addEventListener('click', ()=> removeFieldValue(itemField, btn.dataset.remove));
  });
}

function renderAdminLists(){
  renderAdminField(adminLocationList, 'location');
  renderAdminField(adminCategoryList, 'category');
  renderAdminField(adminSubLocationList, 'subLocation');
  renderAdminField(adminUnitList, 'unit');
}

async function removeFieldValue(itemField, val){
  const info = ADMIN_FIELD_INFO[itemField];
  const name = `${info.article}${info.label}`;
  const count = items.filter(it=>it[itemField]===val).length;
  const msg = count > 0
    ? `${count} article(s) utilisent ${name} "${val}". Il ne sera plus proposé dans les filtres et la fiche produit, mais les articles concernés garderont cette valeur. Continuer ?`
    : `Supprimer ${name} "${val}" ?`;
  if(!confirm(msg)) return;
  await updateDoc(metaRef, {[info.metaKey]: arrayRemove(val)});
}

async function renameFieldValue(itemField, oldVal){
  const info = ADMIN_FIELD_INFO[itemField];
  const name = `${info.article}${info.label}`;
  const newVal = prompt(`Nouveau nom pour ${name} "${oldVal}" :`, oldVal);
  if(newVal === null) return;
  const trimmed = newVal.trim();
  if(!trimmed || trimmed === oldVal) return;
  if(info.listGetter().some(v => v.toLowerCase() === trimmed.toLowerCase() && v !== oldVal)){
    alert(`"${trimmed}" existe déjà.`);
    return;
  }
  const toUpdate = items.filter(it=>it[itemField]===oldVal);
  if(toUpdate.length){
    const batch = writeBatch(db);
    toUpdate.forEach(it => batch.update(doc(itemsCol, it.id), {[itemField]: trimmed}));
    await batch.commit();
  }
  await updateDoc(metaRef, {[info.metaKey]: arrayRemove(oldVal)});
  await setDoc(metaRef, {[info.metaKey]: arrayUnion(trimmed)}, {merge:true});
}

adminUnlockBtn.addEventListener('click', ()=>{
  if(adminPasswordInput.value === ADMIN_PASSWORD){
    isAdmin = true;
    showAdminManageView();
  } else {
    adminError.textContent = "Mot de passe incorrect.";
    adminError.style.display = 'block';
  }
});
adminPasswordInput.addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') adminUnlockBtn.click();
});

adminNewLocationInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') document.getElementById('adminAddLocationBtn').click(); });
document.getElementById('adminAddLocationBtn').addEventListener('click', async ()=>{
  const val = adminNewLocationInput.value.trim();
  if(!val) return;
  if(!locations.includes(val)){
    await setDoc(metaRef, {locations: arrayUnion(val)}, {merge:true});
  }
  adminNewLocationInput.value = '';
});

adminNewCategoryInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') document.getElementById('adminAddCategoryBtn').click(); });
document.getElementById('adminAddCategoryBtn').addEventListener('click', async ()=>{
  const val = adminNewCategoryInput.value.trim();
  if(!val) return;
  if(!categories.includes(val)){
    await setDoc(metaRef, {categories: arrayUnion(val)}, {merge:true});
  }
  adminNewCategoryInput.value = '';
});

adminNewSubLocationInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') document.getElementById('adminAddSubLocationBtn').click(); });
document.getElementById('adminAddSubLocationBtn').addEventListener('click', async ()=>{
  const val = adminNewSubLocationInput.value.trim();
  if(!val) return;
  if(!subLocations.includes(val)){
    await setDoc(metaRef, {subLocations: arrayUnion(val)}, {merge:true});
  }
  adminNewSubLocationInput.value = '';
});

adminNewUnitInput.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') document.getElementById('adminAddUnitBtn').click(); });
document.getElementById('adminAddUnitBtn').addEventListener('click', async ()=>{
  const val = adminNewUnitInput.value.trim();
  if(!val) return;
  if(!units.includes(val)){
    await setDoc(metaRef, {units: arrayUnion(val)}, {merge:true});
  }
  adminNewUnitInput.value = '';
});

document.getElementById('adminBtn').addEventListener('click', openAdmin);
adminOverlay.addEventListener('click', (e)=>{ if(e.target === adminOverlay) closeAdmin(); });
document.getElementById('adminBackBtn').addEventListener('click', closeAdmin);

function renderBulkEditSelects(){
  bulkEditLocationSelect.innerHTML = `<option value="">— Ne pas changer —</option>` + locations.map(loc=>
    `<option value="${escapeHtml(loc)}">${escapeHtml(loc)}</option>`
  ).join('');
  bulkEditCategorySelect.innerHTML = `<option value="">— Ne pas changer —</option>` + categories.map(cat=>
    `<option value="${escapeHtml(cat)}">${escapeHtml(cat)}</option>`
  ).join('');
}

function openBulkEdit(){
  if(selectedIds.size === 0) return;
  bulkEditTitle.textContent = `Modifier ${selectedIds.size} article(s)`;
  renderBulkEditSelects();
  bulkEditLocationSelect.value = '';
  bulkEditCategorySelect.value = '';
  bulkEditOverlay.classList.add('open');
  history.pushState({modal:'bulkEdit'}, '');
}

function closeBulkEdit(){
  if(bulkEditOverlay.classList.contains('open')) history.back();
}

function hideBulkEdit(){
  bulkEditOverlay.classList.remove('open');
}

bulkEditBtn.addEventListener('click', openBulkEdit);
bulkEditOverlay.addEventListener('click', (e)=>{ if(e.target === bulkEditOverlay) closeBulkEdit(); });
document.getElementById('bulkEditBackBtn').addEventListener('click', closeBulkEdit);

bulkEditApplyBtn.addEventListener('click', async ()=>{
  const newLoc = bulkEditLocationSelect.value;
  const newCat = bulkEditCategorySelect.value;
  if(!newLoc && !newCat){ closeBulkEdit(); return; }
  const data = {updatedAt: Date.now()};
  if(newLoc) data.location = newLoc;
  if(newCat) data.category = newCat;
  await Promise.all([...selectedIds].map(id => updateDoc(doc(itemsCol, id), data)));
  selectedIds.clear();
  renderList();
  closeBulkEdit();
});

window.addEventListener('popstate', ()=>{
  if(photoViewerOverlay.classList.contains('open')) hidePhotoViewer();
  else if(adminOverlay.classList.contains('open')) hideAdmin();
  else if(bulkEditOverlay.classList.contains('open')) hideBulkEdit();
  else if(sheetOverlay.classList.contains('open')){
    if(sheetForceClose){
      sheetForceClose = false;
      hideSheet();
    } else if(hasUnsavedChanges()){
      history.pushState({modal:'sheet'}, '');
      if(confirm("Des modifications n'ont pas été enregistrées. Quitter sans enregistrer ?")){
        forceCloseSheet();
      }
    } else {
      hideSheet();
    }
  }
});

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

document.getElementById('addSubLocationBtn').addEventListener('click', async ()=>{
  const input = document.getElementById('newSubLocationInput');
  const val = input.value.trim();
  if(!val) return;
  if(!subLocations.includes(val)){
    await setDoc(metaRef, {subLocations: arrayUnion(val)}, {merge:true});
  }
  subLocationSelect.value = val;
  input.value = "";
});

document.getElementById('saveBtn').addEventListener('click', async ()=>{
  clearSheetError();
  const name = nameInput.value.trim();
  if(!name){ nameInput.focus(); showSheetError('Le nom du produit est obligatoire.'); return; }
  const category = categorySelect.value;
  if(!category){ categorySelect.focus(); showSheetError('La catégorie est obligatoire.'); return; }
  const location = locationSelect.value;
  const subLocation = subLocationSelect.value;
  const unit = unitSelect.value || units[0];
  const dimensions = dimensionsInput.value.trim();
  const condition = conditionSelect.value;
  const notes = notesInput.value.trim();
  const userEmail = auth.currentUser ? auth.currentUser.email : 'inconnu';
  const photosChanged = pendingPhotos.length > sheetOriginalPhotoCount;
  const now = Date.now();

  const data = {
    name, qty:pendingQty, location, subLocation, category, unit, photos:pendingPhotos,
    dimensions, condition, notes, stored: storedCheckbox.checked,
    updatedAt: now, updatedBy: userEmail,
  };
  if(photosChanged){
    data.photosUpdatedAt = now;
    data.photosUpdatedBy = userEmail;
  }

  if(editingId){
    await updateDoc(doc(itemsCol, editingId), data);
    logActivity('edit', name);
  } else {
    data.createdAt = now;
    data.createdBy = userEmail;
    await setDoc(newItemRef, data);
    logActivity('create', name);
  }
  if(photosChanged){
    logActivity('photo_add', name);
  }
  forceCloseSheet();
});

deleteBtn.addEventListener('click', async ()=>{
  if(!editingId) return;
  await deleteDoc(doc(itemsCol, editingId));
  forceCloseSheet();
});

document.getElementById('searchInput').addEventListener('input', (e)=>{
  searchTerm = e.target.value;
  renderList();
});

const EXPORT_FONT = {name: 'Avenir Next'};
const EXPORT_MAIN_PHOTO_ROW_HEIGHT = 110;
const EXPORT_PHOTO_COL_WIDTH = 18;

async function exportExcel(){
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Inventaire');

  const baseColumns = [
    {header:'Photo', key:'photo', width:EXPORT_PHOTO_COL_WIDTH},
    {header:'Nom du produit', key:'name', width:28},
    {header:'Quantité', key:'qty', width:12},
    {header:'Unité', key:'unit', width:12},
    {header:'Emplacement', key:'location', width:22},
    {header:'Catégorie', key:'category', width:18},
    {header:'Dimensions', key:'dimensions', width:18},
    {header:'État général', key:'condition', width:16},
    {header:'Remarques', key:'notes', width:36},
  ];
  const maxExtraPhotos = items.reduce((max, it)=> Math.max(max, getItemPhotos(it).length - 1), 0);
  const extraPhotoColumns = Array.from({length: Math.max(0, maxExtraPhotos)}, (_, i)=>
    ({header:`Photo ${i + 2}`, key:`photo${i + 2}`, width:EXPORT_PHOTO_COL_WIDTH})
  );
  sheet.columns = [...baseColumns, ...extraPhotoColumns];

  const headerRow = sheet.getRow(1);
  headerRow.font = {...EXPORT_FONT, bold:true};
  headerRow.alignment = {wrapText:false, vertical:'middle'};

  const addPhotoToCell = (photo, colIndex, rowNumber)=>{
    const match = /^data:image\/(\w+);base64,(.*)$/.exec(photo);
    if(!match) return;
    const ext = match[1] === 'jpg' ? 'jpeg' : match[1];
    const imageId = workbook.addImage({base64: match[2], extension: ext});
    sheet.addImage(imageId, {
      tl: {col:colIndex, row: rowNumber - 1},
      br: {col:colIndex + 1, row: rowNumber},
      editAs: 'oneCell',
    });
  };

  const sortedItems = [...items].sort((a, b)=>{
    const locA = a.location || '';
    const locB = b.location || '';
    if(locA !== locB){
      if(!locA) return 1;
      if(!locB) return -1;
      return locA.localeCompare(locB, 'fr', {sensitivity:'base'});
    }
    return (a.name || '').localeCompare(b.name || '', 'fr', {sensitivity:'base'});
  });

  // Add every row first, then add images in a separate pass — interleaving
  // sheet.addImage() calls between sheet.addRow() calls corrupts ExcelJS's
  // internal row count and silently skips a row number each time.
  const rowsWithPhotos = sortedItems.map((it)=>{
    const photos = getItemPhotos(it);
    const rowData = {
      photo: '',
      name: it.name,
      qty: it.qty,
      unit: it.unit || '',
      location: it.location,
      category: it.category || '',
      dimensions: it.dimensions || '',
      condition: it.condition || '',
      notes: (it.notes || '').replace(/\r?\n/g, ' '),
    };
    photos.slice(1).forEach((_, i)=>{ rowData[`photo${i + 2}`] = ''; });

    const row = sheet.addRow(rowData);
    row.height = EXPORT_MAIN_PHOTO_ROW_HEIGHT;
    row.font = EXPORT_FONT;
    row.alignment = {wrapText:false, vertical:'middle'};

    return {rowNumber: row.number, photos};
  });

  rowsWithPhotos.forEach(({rowNumber, photos})=>{
    if(photos[0]) addPhotoToCell(photos[0], 0, rowNumber);
    photos.slice(1).forEach((photo, i)=> addPhotoToCell(photo, baseColumns.length + i, rowNumber));
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
      photos: [], stored: false,
      createdAt: Date.now(), createdBy: 'IMPORT',
      updatedAt: Date.now(), updatedBy: 'IMPORT',
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
