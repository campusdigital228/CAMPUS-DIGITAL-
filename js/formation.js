import { db } from "./firebase.js";
import { collection, query, getDocs, updateDoc, doc, getDoc, setDoc, where, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPage, h, msg, errFr, safeUrl, loadAccessible, loadPublished, accessBadge, shareButton, withBusy, fmt } from "./commun.js";
import { ensureSocialAccess } from "./social.js";
import { resourceCard } from "./ressources.js";

const { u, p, prem, admin } = await initPage();
const stars = n => "★".repeat(n) + "☆".repeat(5 - n);
const id = new URLSearchParams(location.search).get("id"), box = document.getElementById("detail");
const row = (k, v) => h("p", {}, h("b", {}, k + " : "), v || h("em", {}, "À compléter par l’administration"));
const allowed = await ensureSocialAccess({ u, p, admin, box });
if (!allowed) { /* écran « suivre nos 3 pages » affiché par ensureSocialAccess */ }
else if (!id) box.replaceChildren(h("p", { class: "msg err" }, "Formation introuvable : identifiant manquant."), h("a", { class: "btn dk", href: "formations.html" }, "Voir les formations"));
else {
  let f = null;
  try { const s = await getDoc(doc(db, "formations", id)); if (s.exists()) f = { id: s.id, ...s.data() }; }
  catch (e) {
    box.replaceChildren(h("p", { class: "msg err" }, e?.code === "permission-denied" ? (u ? "Cette formation est réservée aux abonnés Premium actifs, ou elle n’est pas publiée." : "Connecte-toi pour accéder à cette formation, ou elle est réservée aux abonnés Premium.") : errFr(e)),
      u ? h("a", { class: "btn dk", href: "abonnement.html" }, "Découvrir Premium") : h("a", { class: "btn dk", href: "connexion.html?next=" + encodeURIComponent("formation.html?id=" + id) }, "Se connecter"));
    f = false;
  }
  if (f === null) box.replaceChildren(h("p", { class: "msg err" }, "Cette formation n’existe pas ou n’est plus disponible."), h("a", { class: "btn dk", href: "formations.html" }, "Voir les formations"));
  else if (f) {
    document.title = `${f.titre} — CAMPUS DIGITAL`;
    // Historique personnel : formation consultée (silencieux en cas d'échec)
    if (u) setDoc(doc(db, "users", u.uid, "vues", f.id), { formationId: f.id, titre: f.titre || "", faculte: f.faculte || "", niveau: f.niveau || "", derniereVue: serverTimestamp(), nombre: increment(1) }, { merge: true }).catch(() => {});
    const url = safeUrl(f.url);
    const matieres = (f.matieres || "").split(/\n|;/).map(x => x.trim()).filter(Boolean);
    box.replaceChildren(h("article", { class: "card detail-card" },
      h("div", { class: "tags" }, accessBadge(f), f.faculte ? h("span", { class: "tag" }, f.faculte) : "", f.niveau ? h("span", { class: "tag" }, f.niveau) : ""),
      h("h1", {}, f.titre || "Formation"), h("p", {}, f.description || ""),
      row("Faculté de rattachement", f.faculte), row("Type", f.type), row("Niveau d’études", f.niveau), row("Durée", f.duree), row("Conditions d’accès", f.conditions),
      h("h2", {}, "Matières et unités d’enseignement"),
      matieres.length ? h("ul", {}, matieres.map(m => h("li", {}, m))) : h("p", {}, h("em", {}, "À compléter par l’administration.")),
      h("div", { class: "actions" }, url ? h("a", { class: "btn dk", href: url, target: "_blank", rel: "noopener noreferrer" }, "Consulter le contenu de la formation") : "", shareButton(f.titre || "Formation", "formation.html?id=" + encodeURIComponent(f.id)))));
    avisSection(f);
    try {
      const list = await loadAccessible("ressources", prem, [where("formationId", "==", id)]);
      const sec = document.getElementById("assoc"); sec.hidden = false;
      const paid = (await loadPublished("produits", [where("formationId", "==", id)])).filter(p => !list.some(r => r.id === (p.resourceId || p.id)));
      const cards = list.map(resourceCard).concat(paid.map(p => h("article", { class: "card" }, h("span", { class: "tag " + (p.mode === "premium" ? "pr" : "buy") }, p.mode === "premium" ? "Premium" : "Achat à l’unité"), h("h3", {}, p.titre), h("p", { class: "clamp" }, p.description || ""), h("a", { class: "btn dk", href: "bibliotheque.html?q=" + encodeURIComponent(p.titre || "") }, "Voir dans la bibliothèque"))));
      document.getElementById("ressources").replaceChildren(...(cards.length ? cards : [h("p", {}, "Aucune ressource associée pour le moment.")]));
    } catch (e) { msg(errFr(e), "err"); }
  }
}

// ---------- Avis et notes ----------
async function avisSection(f) {
  const box = document.getElementById("avis-box"), resume = document.getElementById("avis-resume"), liste = document.getElementById("avis-liste"), formBox = document.getElementById("avis-form");
  box.hidden = false;
  let reviews = [];
  try { reviews = (await getDocs(query(collection(db, "avis"), where("formationId", "==", f.id), where("visible", "==", true)))).docs.map(d => d.data()).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); }
  catch (e) { resume.replaceChildren(h("p", { class: "hint" }, "Les avis ne sont pas disponibles pour le moment.")); }
  const avg = reviews.length ? reviews.reduce((t, r) => t + r.note, 0) / reviews.length : 0;
  resume.replaceChildren(reviews.length ? h("p", {}, h("span", { class: "stars" }, stars(Math.round(avg))), " ", h("b", {}, avg.toFixed(1).replace(".", ",") + " / 5"), ` · ${reviews.length} avis`) : h("p", { class: "hint" }, "Aucun avis pour le moment. Sois le premier à donner le tien !"));
  liste.replaceChildren(...reviews.slice(0, 10).map(r => h("article", { class: "review" }, h("p", {}, h("span", { class: "stars" }, stars(r.note)), " ", h("b", {}, r.auteur || "Étudiant"), h("small", {}, " · " + fmt(r.createdAt))), r.commentaire ? h("p", {}, r.commentaire) : "")));
  if (!u) { formBox.replaceChildren(h("a", { class: "btn dk", href: "connexion.html?next=" + encodeURIComponent("formation.html?id=" + f.id) }, "Se connecter pour donner mon avis")); return; }
  const mine = reviews.find(r => r.uid === u.uid), ref = doc(db, "avis", `${u.uid}_${f.id}`);
  const note = h("select", { id: "avis-note", "aria-label": "Note" }, [5, 4, 3, 2, 1].map(n => h("option", { value: n }, `${stars(n)} (${n}/5)`)));
  const txt = h("textarea", { rows: 3, maxlength: "500", placeholder: "Ton avis (facultatif, 500 caractères maximum)", "aria-label": "Commentaire" });
  if (mine) { note.value = mine.note; txt.value = mine.commentaire || ""; }
  const send = h("button", { class: "btn dk", type: "submit" }, mine ? "Modifier mon avis" : "Publier mon avis");
  const form = h("form", {}, h("h3", {}, mine ? "Mon avis" : "Donner mon avis"), note, txt, send);
  form.addEventListener("submit", e => { e.preventDefault(); withBusy(send, async () => {
    try {
      const data = { note: Number(note.value), commentaire: txt.value.trim() };
      if (mine) await updateDoc(ref, { ...data, updatedAt: serverTimestamp() });
      else await setDoc(ref, { uid: u.uid, formationId: f.id, formationTitre: f.titre || "", ...data, auteur: p?.prenom || (p?.nom || "").split(" ")[0] || "Étudiant", visible: true, createdAt: serverTimestamp() });
      msg("Merci ! Ton avis est enregistré."); await avisSection(f);
    } catch (er) { msg(er?.code === "permission-denied" ? "Avis refusé : ouvre d’abord la formation quelques secondes (elle doit être dans ton historique) puis réessaie. Sinon, les règles Firestore à jour ne sont peut-être pas publiées." : errFr(er), "err"); }
  }); });
  formBox.replaceChildren(form);
}
