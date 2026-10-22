import { db } from "./firebase.js";
import { collection, getDocs, query, limit } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPage, h, errFr, loadAccessible, loadPublished, loadFacultes } from "./commun.js";
import { FAC } from "./facultes.js";

const { prem } = await initPage();
const $ = i => document.getElementById(i), q = $("q"), box = $("liste"), etat = $("etat");
let index = null, loading = null;

// Chargement différé : on ne télécharge les données qu'à la première recherche, et seulement ce qui est autorisé.
async function buildIndex() {
  const cap = limit(300);
  const [f, r, p, fac, b] = await Promise.all([
    loadAccessible("formations", prem).catch(() => []), loadAccessible("ressources", prem), loadPublished("produits", [cap]), loadFacultes(),
    getDocs(query(collection(db, "bourses"), cap)).then(s => s.docs.map(d => ({ id: d.id, ...d.data() })))
  ]);
  const facs = fac.length ? fac : FAC.map(([code, titre, description]) => ({ code, titre, description }));
  const rIds = new Set(r.map(x => x.id));
  return [
    ...facs.map(x => ({ k: "Faculté", t: x.titre, d: x.description, href: "formations.html?faculte=" + encodeURIComponent(x.code), extra: x.code })),
    ...f.map(x => ({ k: "Formation", t: x.titre, d: x.description, href: "formation.html?id=" + encodeURIComponent(x.id), extra: `${x.faculte || ""} ${x.matieres || ""}` })),
    ...r.map(x => ({ k: x.categorie || "Ressource", t: x.titre, d: x.description, href: "bibliotheque.html?q=" + encodeURIComponent(x.titre || ""), extra: `${x.auteur || ""} ${x.faculte || ""}` })),
    ...p.filter(x => !rIds.has(x.resourceId || x.id)).map(x => ({ k: x.mode === "premium" ? "Premium" : "Document payant", t: x.titre, d: x.description, href: "bibliotheque.html?q=" + encodeURIComponent(x.titre || ""), extra: `${x.categorie || ""} ${x.auteur || ""}` })),
    ...b.map(x => ({ k: "Bourse", t: x.titre, d: `${x.organisme || ""} ${x.conditions || ""}`.trim(), href: "bourses.html", extra: x.pays || "" }))
  ];
}
function webLinks(t) {
  const enc = encodeURIComponent(t || "");
  const mk = (label, url) => h("a", { class: "btn", href: t ? url : "#", target: "_blank", rel: "noopener noreferrer", "aria-disabled": t ? false : "true", onclick: e => { if (!t) { e.preventDefault(); q.focus(); } } }, label + " ↗");
  $("web").replaceChildren(mk("Google", `https://www.google.com/search?q=${enc}`), mk("Google Scholar", `https://scholar.google.com/scholar?q=${enc}`), mk("DuckDuckGo", `https://duckduckgo.com/?q=${enc}`), t ? "" : h("span", { class: "hint" }, "Saisissez d’abord un mot-clé ci-dessus."));
}
async function draw() {
  const t = q.value.trim().toLowerCase(); webLinks(q.value.trim());
  if (t.length < 2) { box.replaceChildren(); etat.textContent = "Saisissez au moins 2 caractères."; return; }
  etat.textContent = "Recherche en cours…";
  try {
    loading ||= buildIndex(); index = index || await loading;
    const r = index.filter(x => `${x.t || ""} ${x.d || ""} ${x.extra || ""}`.toLowerCase().includes(t)).slice(0, 60);
    etat.textContent = r.length ? `${r.length} résultat(s) dans CAMPUS DIGITAL.` : "Aucun résultat dans CAMPUS DIGITAL. Essayez un autre mot-clé ou la recherche sur le Web ci-dessous.";
    box.replaceChildren(...r.map(x => h("article", { class: "card" }, h("span", { class: "tag" }, x.k), h("h3", {}, x.t || "Sans titre"), h("p", { class: "clamp" }, x.d || ""), h("a", { class: "btn dk", href: x.href }, "Voir"))));
  } catch (e) { loading = null; etat.textContent = ""; box.replaceChildren(h("p", { class: "msg err" }, errFr(e))); }
}
q.value = new URLSearchParams(location.search).get("q") || "";
q.addEventListener("input", draw); draw();
