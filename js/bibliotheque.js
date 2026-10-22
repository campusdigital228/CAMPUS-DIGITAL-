import { db } from "./firebase.js";
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPage, h, msg, errFr, loadAccessible, loadPublished, faculteCodes, fillSelect, NIVEAUX, CATEGORIES } from "./commun.js";
import { resourceCard, productCard } from "./ressources.js";

const { u, prem } = await initPage();
const $ = i => document.getElementById(i), box = $("liste"), pay = $("payants");
let items = [], products = [], grants = new Map();
fillSelect($("niveau"), NIVEAUX);
$("q").value = new URLSearchParams(location.search).get("q") || "";

async function loadGrants() {
  grants = new Map();
  if (!u) return;
  try { (await getDocs(query(collection(db, "achats"), where("uid", "==", u.uid)))).docs.forEach(d => grants.set(d.data().resourceId, d.data())); } catch (e) { console.warn(e); }
}
function matches(it) {
  const t = $("q").value.trim().toLowerCase();
  const txt = `${it.titre || ""} ${it.description || ""} ${it.auteur || ""} ${it.categorie || ""} ${it.faculte || ""}`.toLowerCase();
  return (!t || txt.includes(t)) && ["categorie", "niveau", "faculte"].every(k => !$(k).value || it[k] === $(k).value || (k === "niveau" && it.niveau === "Tous niveaux"));
}
function draw() {
  const mine = items.filter(matches);
  box.replaceChildren(...(mine.length ? mine.map(resourceCard) : [h("p", {}, "Aucune ressource disponible pour ces critères.")]));
  // Fiches payantes : on masque celles déjà accessibles par Premium (déjà listées ci-dessus).
  const shown = products.filter(p => !(prem && p.mode === "premium")).filter(matches);
  pay.replaceChildren(...(shown.length ? shown.map(p => productCard(p, { user: u, grants, refresh })) : [h("p", {}, "Aucun contenu payant pour ces critères.")]));
}
async function refresh() { await loadGrants(); draw(); }

try {
  [items, products] = await Promise.all([loadAccessible("ressources", prem), loadPublished("produits")]);
  await loadGrants();
  fillSelect($("categorie"), [...new Set([...CATEGORIES, ...items.concat(products).map(x => x.categorie).filter(Boolean)])]);
  fillSelect($("faculte"), await faculteCodes());
  ["q", "categorie", "niveau", "faculte"].forEach(i => $(i).addEventListener("input", draw));
  draw();
  if (!prem) msg("Les ressources Premium sont réservées aux abonnés actifs : elles apparaissent dans la section « Contenus Premium et achats à l’unité ».", "inf");
} catch (e) { box.textContent = ""; msg(errFr(e), "err"); }
