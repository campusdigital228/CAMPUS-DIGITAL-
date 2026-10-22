// Espace administrateur : contenus, missions, achats, Premium, diagnostic.
// Les droits réels sont contrôlés par les règles Firestore (e-mail autorisé ET vérifié) ; cet écran n'en est que le miroir.
import { auth, db } from "./firebase.js";
import { sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { collection, getDocs, getDoc, query, where, limit, addDoc, setDoc, updateDoc, deleteDoc, doc, serverTimestamp, Timestamp, increment, runTransaction, getCountFromServer, collectionGroup, writeBatch } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { reseauxAdmin } from "./social.js";
import { initPage, h, msg, errFr, fmt, fcfa, safeUrl, premium, withBusy, isAdminEmail, FACULTES, NIVEAUX, CATEGORIES, MODES, PREMIUM_DAYS, TYPES_FORMATION, faculteCodes, newest } from "./commun.js";

const { u, admin } = await initPage();
const root = document.getElementById("root");

// ---------- Configuration des contenus gérés ----------
// [clé, type, libellé, options]  types : T texte · A zone de texte · S liste · B case · N nombre · U lien https
const state = { codes: [...FACULTES], formations: [], ressources: [] };
const CFG = {
  formations: { l: "Formations", pub: true, req: ["titre"], f: () => [
    ["titre", "T", "Titre de la formation"], ["description", "A", "Description"], ["faculte", "S", "Faculté de rattachement", ["", ...state.codes], v => v || "— Choisir —"], ["niveau", "S", "Niveau d’études", NIVEAUX], ["type", "S", "Type de formation", TYPES_FORMATION],
    ["duree", "T", "Durée (si connue)"], ["conditions", "A", "Conditions d’accès (si connues — ne rien inventer)"], ["matieres", "A", "Matières / unités d’enseignement (une par ligne)"],
    ["categorie", "T", "Catégorie (facultatif)"], ["url", "U", "Lien du contenu (https://…)"], ["isPremium", "B", "Réservée aux abonnés Premium"], ["published", "B", "Publiée (visible par les étudiants)"]] },
  facultes: { l: "Facultés", pub: true, req: ["titre", "code"], f: () => [
    ["titre", "T", "Nom de la faculté"], ["code", "T", "Code court (ex. FDD) — utilisé pour relier les formations"], ["etablissement", "T", "Établissement / université (facultatif)"], ["description", "A", "Description"],
    ["imageUrl", "U", "Image (lien https, facultatif)"], ["urlOfficielle", "U", "Site officiel (facultatif)"], ["published", "B", "Publiée"]] },
  ressources: { l: "Ressources & livres", pub: true, req: ["titre"], f: () => [
    ["titre", "T", "Titre"], ["description", "A", "Description"], ["categorie", "S", "Catégorie", CATEGORIES], ["formationId", "S", "Formation associée (facultatif)", ["", ...state.formations.map(x => x.id)], id => state.formations.find(x => x.id === id)?.titre || "— Aucune —"],
    ["faculte", "S", "Faculté associée (facultatif)", ["", ...state.codes], v => v || "— Aucune —"], ["niveau", "S", "Niveau", NIVEAUX], ["format", "S", "Format", ["PDF", "Word", "Vidéo YouTube", "Lien web", "Image", "Autre"]],
    ["auteur", "T", "Auteur ou source (si disponible)"], ["couvertureUrl", "U", "Couverture (lien https, facultatif)"], ["url", "U", "Lien du fichier (https://…)"],
    ["modeVente", "S", "Mode d’accès", MODES], ["prixFCFA", "N", "Prix en FCFA (achat à l’unité)"], ["published", "B", "Publiée (visible dans la bibliothèque)"]] },
  bourses: { l: "Bourses", req: ["titre"], f: () => [
    ["titre", "T", "Titre"], ["organisme", "T", "Organisme"], ["pays", "T", "Pays"], ["niveau", "S", "Niveau", NIVEAUX], ["conditions", "A", "Conditions"], ["dateLimite", "T", "Date limite"],
    ["urlOfficielle", "U", "Lien officiel (https://…)"], ["statut", "S", "Statut", ["à vérifier", "ouverte", "clôturée"]]] }
};
const TABS = [["dashboard", "Tableau de bord"], ["formations", "Formations"], ["facultes", "Facultés"], ["ressources", "Ressources & livres"], ["missions", "Missions"], ["validations", "Preuves à valider"], ["reseaux", "Abonnements réseaux"], ["achats", "Achats"], ["demandes", "Demandes Premium"], ["abonnes", "Abonnés"], ["avis", "Avis"], ["bourses", "Bourses"], ["diagnostic", "Diagnostic"]];

async function preload() {
  state.codes = await faculteCodes().catch(() => [...FACULTES]);
  try { state.formations = (await getDocs(collection(db, "formations"))).docs.map(d => ({ id: d.id, ...d.data() })); } catch {}
  try { state.ressources = (await getDocs(collection(db, "ressources"))).docs.map(d => ({ id: d.id, ...d.data() })); } catch {}
}
function start() {
  const tabs = h("div", { class: "admin-tabs", role: "tablist" }), view = h("div", { id: "adminView" });
  root.replaceChildren(tabs, view);
  const views = { dashboard: dashboard, avis: avisAdmin, missions: missionsAdmin, validations: validations, reseaux: v => reseauxAdmin(v, u), achats: achatsAdmin, demandes: demandes, abonnes: abonnes, diagnostic: diagnostic };
  const show = async n => {
    tabs.querySelectorAll("button").forEach(b => { b.disabled = b.dataset.n === n; b.setAttribute("aria-selected", String(b.dataset.n === n)); });
    view.replaceChildren(h("p", {}, "Chargement…")); msg("");
    await preload();
    view.replaceChildren(); (views[n] || (v => crud(v, n)))(view);
  };
  TABS.forEach(([n, l]) => tabs.append(h("button", { class: "btn", type: "button", role: "tab", "data-n": n, onclick: () => show(n) }, l)));
  const wanted = location.hash.slice(1);
  show(TABS.some(t => t[0] === wanted) ? wanted : "dashboard");
}

// ---------- CRUD générique (formations, facultés, ressources, bourses) ----------
function crud(v, name) {
  const c = CFG[name], fields = c.f(); let editId = null; const inp = {};
  const form = h("form", { class: "card admin-form", novalidate: true }), list = h("div", { class: "wrap" });
  form.append(h("h2", {}, c.l), name === "ressources" || name === "formations" ? h("p", { class: "msg inf" }, "Colle un lien direct https:// (PDF, Drive public, YouTube…). Le téléversement de fichiers n’est pas activé (Firebase Storage non configuré).") : "");
  fields.forEach(([k, t, label, opts, lab]) => {
    let e;
    if (t === "A") e = h("textarea", { rows: 3 });
    else if (t === "S") e = h("select", {}, opts.map(o => h("option", { value: o }, lab ? lab(o) : o)));
    else if (t === "B") e = h("input", { type: "checkbox" });
    else if (t === "N") e = h("input", { type: "number", min: "0", step: "1", inputmode: "numeric" });
    else e = h("input", { type: "text", placeholder: t === "U" ? "https://…" : "" });
    e.id = "f_" + k; inp[k] = e;
    form.append(t === "B" ? h("label", { class: "check", for: e.id }, e, " " + label) : h("label", { for: e.id }, label), t === "B" ? "" : e);
  });
  const ok = h("button", { class: "btn dk", type: "submit" }, "Enregistrer");
  const reset = () => { editId = null; form.reset(); fields.forEach(([k, t]) => { if (k === "published" && inp[k]) inp[k].checked = true; }); ok.textContent = "Enregistrer"; };
  form.append(ok, " ", h("button", { class: "btn", type: "button", onclick: reset }, "Nouveau")); reset();

  form.addEventListener("submit", e => { e.preventDefault(); withBusy(ok, async () => {
    const d = {};
    fields.forEach(([k, t]) => { d[k] = t === "B" ? inp[k].checked : t === "N" ? Number(inp[k].value || 0) : inp[k].value.trim(); });
    for (const k of c.req) if (!d[k]) return msg(`Le champ « ${fields.find(f => f[0] === k)[2]} » est obligatoire.`, "err");
    for (const [k, t] of fields) if (t === "U" && d[k] && !safeUrl(d[k])) return msg(`Lien invalide dans « ${fields.find(f => f[0] === k)[2]} » : utilisez une adresse commençant par http:// ou https://.`, "err");
    if (name === "ressources") {
      d.isPremium = d.modeVente !== "Gratuit";
      if (d.modeVente === "Achat à l’unité" && !(d.prixFCFA >= 1)) return msg("Indiquez un prix supérieur à zéro pour un achat à l’unité.", "err");
      if (d.modeVente !== "Achat à l’unité") d.prixFCFA = 0;
      if (d.published && !d.url) return msg("Ajoutez le lien du fichier avant de publier la ressource (ou décochez « Publiée »).", "err");
    }
    if (name === "facultes" && !/^[\wÀ-ÿ' .\-]{1,40}$/.test(d.code)) return msg("Le code doit faire 40 caractères maximum (lettres, chiffres, espaces).", "err");
    try {
      d.updatedAt = serverTimestamp(); let id = editId;
      if (editId) await updateDoc(doc(db, name, editId), d); else { d.createdAt = serverTimestamp(); id = (await addDoc(collection(db, name), d)).id; }
      if (name === "ressources") await syncProduit(id, d);
      msg("Enregistré."); reset(); await preload(); await load();
    } catch (er) { msg(errFr(er), "err"); }
  }); });

  const badge = d => c.pub ? (d.published === true ? h("span", { class: "tag free" }, "Publié") : d.published === false ? h("span", { class: "tag wait" }, "Brouillon") : h("span", { class: "tag no" }, "Invisible : à migrer (onglet Diagnostic)")) : "";
  // Filtres de la liste (formations et ressources) : par faculté, type et état
  const useFilters = name === "formations" || name === "ressources";
  const flt = { q: h("input", { type: "search", placeholder: "Rechercher dans la liste…", "aria-label": "Rechercher" }),
    faculte: h("select", { "aria-label": "Faculté" }, h("option", { value: "" }, "Toutes les facultés"), ...state.codes.map(x => h("option", { value: x }, x))),
    type: h("select", { "aria-label": "Type" }, h("option", { value: "" }, name === "formations" ? "Tous les types" : "Toutes les catégories"), ...(name === "formations" ? TYPES_FORMATION : CATEGORIES).map(x => h("option", { value: x }, x))),
    etat: h("select", { "aria-label": "État" }, h("option", { value: "" }, "Tous les états"), h("option", { value: "pub" }, "Publiés"), h("option", { value: "brouillon" }, "Brouillons"), h("option", { value: "migrer" }, "À migrer")) };
  const filters = useFilters ? h("div", { class: "filters admin-filters" }, Object.values(flt)) : "";
  Object.values(flt).forEach(e => e.addEventListener("input", () => load()));
  const pass = d => !useFilters || ((!flt.q.value.trim() || `${d.titre || ""} ${d.description || ""}`.toLowerCase().includes(flt.q.value.trim().toLowerCase())) && (!flt.faculte.value || d.faculte === flt.faculte.value)
    && (!flt.type.value || (name === "formations" ? d.type : d.categorie) === flt.type.value) && (!flt.etat.value || (flt.etat.value === "pub" ? d.published === true : flt.etat.value === "brouillon" ? d.published === false : d.published === undefined)));
  const edit = (x, d) => { editId = x.id; fields.forEach(([k, t]) => { if (t === "B") inp[k].checked = !!d[k]; else { const val = d[k] ?? ""; if (t === "S" && val && ![...inp[k].options].some(o => o.value === val)) inp[k].append(h("option", { value: val }, val)); inp[k].value = val; } }); ok.textContent = "Mettre à jour"; form.scrollIntoView({ behavior: "smooth" }); };
  const tr = x => { const d = x.data();
    return h("tr", {}, h("td", {}, h("b", {}, d.titre || x.id), h("small", { class: "sub" }, [name === "formations" ? [d.type, d.niveau, d.duree].filter(Boolean).join(" · ") : name === "ressources" ? [d.categorie, d.modeVente || (d.isPremium ? "Inclus Premium" : "Gratuit")].filter(Boolean).join(" · ") : ""].join(""))), h("td", {}, badge(d)),
      h("td", { class: "row-actions" },
        h("button", { class: "btn", type: "button", onclick: () => edit(x, d) }, "Modifier"),
        c.pub ? h("button", { class: "btn", type: "button", onclick: async () => { try { await updateDoc(doc(db, name, x.id), { published: d.published !== true, updatedAt: serverTimestamp() }); if (name === "ressources") await syncProduit(x.id, { ...d, published: d.published !== true }); await load(); } catch (er) { msg(errFr(er), "err"); } } }, d.published === true ? "Dépublier" : "Publier") : "",
        h("button", { class: "btn rd", type: "button", onclick: async () => { if (!confirm(`Supprimer définitivement « ${d.titre || x.id} » ? Cette action est irréversible.`)) return; try { await deleteDoc(doc(db, name, x.id)); if (name === "ressources") { try { await deleteDoc(doc(db, "produits", x.id)); } catch {} } msg("Supprimé."); await preload(); await load(); } catch (er) { msg(errFr(er), "err"); } } }, "Supprimer"))); };
  const table = rows => h("div", { class: "wrap" }, h("table", {}, h("tr", {}, ["Titre", "État", "Actions"].map(t => h("th", {}, t))), ...rows.map(tr)));
  async function load() {
    try {
      const all = (await getDocs(collection(db, name))).docs.sort((a, b) => newest(a.data(), b.data())), rows = all.filter(x => pass(x.data()));
      if (!rows.length) { list.replaceChildren(h("p", {}, all.length ? "Aucun élément pour ces filtres." : "Aucun élément pour le moment.")); return; }
      if (name !== "formations") { list.replaceChildren(h("p", { class: "hint" }, `${rows.length} élément(s)`), table(rows)); return; }
      // Formations : regroupées par faculté, avec « Ajouter ici »
      const groups = new Map(); rows.forEach(x => { const k = x.data().faculte || "Sans faculté"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); });
      list.replaceChildren(...[...groups.entries()].sort((a, b) => a[0].localeCompare(b[0], "fr")).map(([k, g]) => h("section", { class: "admin-group" },
        h("div", { class: "group-head" }, h("h3", {}, k, " ", h("span", { class: "count" }, `${g.length}`)), h("button", { class: "btn", type: "button", onclick: () => { reset(); if ([...inp.faculte.options].some(o => o.value === k)) inp.faculte.value = k; form.scrollIntoView({ behavior: "smooth" }); inp.titre.focus(); } }, "+ Ajouter dans " + k)), table(g))));
    } catch (er) { msg(errFr(er), "err"); }
  }
  // Import de plusieurs formations d'un coup (une par ligne)
  function importCard() {
    const sel = (opts, id) => h("select", { id }, opts.map(o => h("option", { value: o }, o)));
    const fac = sel(state.codes.filter(c => c !== "Général").concat("Général"), "imp_fac"), niv = sel(NIVEAUX, "imp_niv"), typ = sel(TYPES_FORMATION, "imp_typ");
    const pub = h("input", { type: "checkbox", id: "imp_pub", checked: true }), prem = h("input", { type: "checkbox", id: "imp_prem" });
    const ta = h("textarea", { id: "imp_txt", rows: 7, placeholder: "Une formation par ligne :\nTitre | Niveau | Durée | Description\n\nExemples :\nDroit des affaires | Master | 2 ans\nIntroduction au droit civil | Licence 1\nComptabilité générale" });
    const go = h("button", { class: "btn dk", type: "button" }, "Importer ces formations");
    go.addEventListener("click", () => withBusy(go, async () => {
      const lines = ta.value.split("\n").map(l => l.trim()).filter(Boolean);
      if (!lines.length) return msg("Saisissez au moins une formation (une par ligne).", "err");
      if (lines.length > 100) return msg("100 formations maximum par import.", "err");
      const have = new Set(state.formations.map(f => `${(f.titre || "").toLowerCase()}|${f.faculte || ""}`)), toAdd = []; let skipped = 0;
      for (const l of lines) {
        const [titre, niveau, duree, ...rest] = l.split("|").map(x => x.trim());
        if (!titre) continue; if (have.has(`${titre.toLowerCase()}|${fac.value}`)) { skipped++; continue; } have.add(`${titre.toLowerCase()}|${fac.value}`);
        toAdd.push({ titre, description: rest.join(" | "), faculte: fac.value, niveau: NIVEAUX.includes(niveau) ? niveau : niv.value, type: typ.value, duree: duree || "", conditions: "", matieres: "", categorie: "", url: "", isPremium: prem.checked, published: pub.checked });
      }
      if (!toAdd.length) return msg(skipped ? "Toutes ces formations existent déjà dans cette faculté." : "Rien à importer.", "err");
      if (!confirm(`Importer ${toAdd.length} formation(s) dans « ${fac.value} »${skipped ? ` (${skipped} doublon(s) ignoré(s))` : ""} ?`)) return;
      try { const b = writeBatch(db); toAdd.forEach(d => b.set(doc(collection(db, "formations")), { ...d, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })); await b.commit(); ta.value = ""; msg(`${toAdd.length} formation(s) importée(s) dans ${fac.value}.`); await preload(); await load(); }
      catch (er) { msg(errFr(er), "err"); }
    }));
    return h("details", { class: "card admin-form" }, h("summary", {}, h("b", {}, "Importer plusieurs formations d’un coup")),
      h("p", { class: "hint" }, "Choisissez la faculté, le type et le niveau par défaut, puis collez une formation par ligne. Le niveau, la durée et la description de chaque ligne sont facultatifs (séparés par « | »). Les doublons sont ignorés."),
      h("div", { class: "form-row" }, h("div", {}, h("label", { for: "imp_fac" }, "Faculté"), fac), h("div", {}, h("label", { for: "imp_typ" }, "Type"), typ)),
      h("label", { for: "imp_niv" }, "Niveau par défaut"), niv, h("label", { for: "imp_txt" }, "Liste des formations"), ta,
      h("label", { class: "check", for: "imp_pub" }, pub, " Publier immédiatement"), h("label", { class: "check", for: "imp_prem" }, prem, " Réservées aux abonnés Premium"), go);
  }
  v.append(form, ...(name === "formations" ? [importCard()] : []), filters, list); load();
}
// Catalogue public (produits) : fiche descriptive + prix, sans lien de fichier.
async function syncProduit(id, d) {
  const ref = doc(db, "produits", id);
  if (d.modeVente === "Achat à l’unité" || d.modeVente === "Inclus Premium") {
    await setDoc(ref, { titre: d.titre || "", description: d.description || "", categorie: d.categorie || "", niveau: d.niveau || "", faculte: d.faculte || "", formationId: d.formationId || "", format: d.format || "", auteur: d.auteur || "", couvertureUrl: d.couvertureUrl || "",
      prixFCFA: d.modeVente === "Achat à l’unité" ? Number(d.prixFCFA || 0) : 0, mode: d.modeVente === "Achat à l’unité" ? "achat" : "premium", resourceId: id, published: d.published === true, updatedAt: serverTimestamp() }, { merge: true });
  } else { try { await deleteDoc(ref); } catch {} }
}

// ---------- Missions ----------
async function missionsAdmin(v) {
  let editId = null;
  const f = {}; const mk = (k, el, label) => { f[k] = el; el.id = "m_" + k; return [h("label", { for: el.id }, label), el]; };
  const form = h("form", { class: "card admin-form", novalidate: true });
  const resOpts = (first) => [h("option", { value: "" }, first), ...state.ressources.map(r => h("option", { value: r.id }, r.titre || r.id))];
  form.append(h("h2", {}, "Missions"),
    ...mk("titre", h("input", { placeholder: "Ex. Lire la fiche de révision de droit civil" }), "Titre *"),
    ...mk("plateforme", h("select", {}, ["Lecture", "Cours", "Questionnaire", "Exercice", "Activité", "YouTube", "Facebook", "TikTok", "Communauté", "Autre"].map(x => h("option", { value: x }, x))), "Type de mission"),
    ...mk("description", h("textarea", { rows: 3 }), "Description *"), ...mk("instructions", h("textarea", { rows: 3, placeholder: "Étapes à suivre et preuve attendue" }), "Instructions"),
    ...mk("url", h("input", { placeholder: "https://…" }), "Lien de la mission (facultatif)"), ...mk("dateLimite", h("input", { type: "date" }), "Date limite (facultatif)"),
    ...mk("points", h("input", { type: "number", min: "0", max: "1000", value: "5" }), "Points après validation (0–1000)"), ...mk("bonus", h("input", { placeholder: "Ex. fiche de révision offerte" }), "Bonus annoncé (texte)"),
    ...mk("bonusResourceId", h("select", {}, resOpts("Aucun document à débloquer")), "Document débloqué après validation (facultatif)"), ...mk("ressourceId", h("select", {}, resOpts("Aucune ressource associée")), "Ressource associée (facultatif)"));
  const act = h("input", { type: "checkbox", id: "m_active" }); f.active = act;
  const ok = h("button", { class: "btn dk", type: "submit" }, "Publier la mission");
  const reset = () => { editId = null; form.reset(); f.points.value = "5"; act.checked = true; ok.textContent = "Publier la mission"; };
  form.append(h("label", { class: "check", for: "m_active" }, act, " Mission active"), ok, " ", h("button", { class: "btn", type: "button", onclick: reset }, "Nouvelle mission")); reset();
  const list = h("div", { class: "grid" }); v.append(form, list);

  form.addEventListener("submit", e => { e.preventDefault(); withBusy(ok, async () => {
    const titre = f.titre.value.trim(), description = f.description.value.trim(), url = f.url.value.trim(), pts = Number(f.points.value);
    if (!titre) return msg("Le titre est obligatoire.", "err"); if (!description) return msg("La description est obligatoire.", "err");
    if (url && !safeUrl(url)) return msg("Lien invalide : utilisez une adresse https:// valide.", "err");
    if (!Number.isFinite(pts) || pts < 0 || pts > 1000) return msg("Les points doivent être compris entre 0 et 1000.", "err");
    const rid = f.ressourceId.value, d = { titre, plateforme: f.plateforme.value, description, instructions: f.instructions.value.trim(), url, points: pts, bonus: f.bonus.value.trim(), bonusResourceId: f.bonusResourceId.value, ressourceId: rid, ressourceTitre: state.ressources.find(r => r.id === rid)?.titre || "",
      dateLimite: f.dateLimite.value, dateLimiteTs: f.dateLimite.value ? Timestamp.fromDate(new Date(f.dateLimite.value + "T23:59:59")) : null, active: act.checked, updatedAt: serverTimestamp() };
    try { if (editId) await updateDoc(doc(db, "missions", editId), d); else { d.createdAt = serverTimestamp(); await addDoc(collection(db, "missions"), d); } msg(editId ? "Mission mise à jour." : "Mission publiée."); reset(); await load(); } catch (er) { msg(errFr(er), "err"); }
  }); });
  async function load() {
    try {
      const s = await getDocs(collection(db, "missions"));
      list.replaceChildren(...(s.docs.length ? s.docs.map(x => { const d = x.data();
        return h("article", { class: "card" }, h("span", { class: "tag " + (d.active ? "free" : "wait") }, d.active ? "Active" : "Inactive"), h("h3", {}, d.titre), h("p", { class: "clamp" }, d.description), h("p", { class: "hint" }, `${d.points || 0} point(s)${d.dateLimite ? " · limite " + d.dateLimite : ""}`),
          h("button", { class: "btn", type: "button", onclick: () => { editId = x.id; ["titre", "plateforme", "description", "instructions", "url", "dateLimite", "bonus", "bonusResourceId", "ressourceId"].forEach(k => f[k].value = d[k] ?? ""); f.points.value = d.points ?? 0; act.checked = !!d.active; ok.textContent = "Mettre à jour la mission"; form.scrollIntoView({ behavior: "smooth" }); } }, "Modifier"), " ",
          h("button", { class: "btn", type: "button", onclick: async () => { try { await updateDoc(doc(db, "missions", x.id), { active: !d.active, updatedAt: serverTimestamp() }); await load(); } catch (er) { msg(errFr(er), "err"); } } }, d.active ? "Désactiver" : "Activer"), " ",
          h("button", { class: "btn rd", type: "button", onclick: async () => { if (!confirm("Supprimer définitivement cette mission ?")) return; try { await deleteDoc(doc(db, "missions", x.id)); await load(); } catch (er) { msg(errFr(er), "err"); } } }, "Supprimer"));
      }) : [h("p", {}, "Aucune mission pour le moment.")]));
    } catch (er) { msg(errFr(er), "err"); }
  }
  await load();
}

// ---------- Validation des preuves : transaction = pas de double attribution de points ----------
async function validerPreuve(subId) {
  const subRef = doc(db, "mission_submissions", subId);
  // Anciennes soumissions (identifiant aléatoire) : refuser un doublon déjà validé pour la même mission.
  const first = await getDoc(subRef); if (!first.exists()) throw new Error("Preuve introuvable.");
  const dup = await getDocs(query(collection(db, "mission_submissions"), where("uid", "==", first.data().uid), where("missionId", "==", first.data().missionId), where("statut", "==", "validee")));
  if (dup.docs.some(x => x.id !== subId)) throw new Error("Cet étudiant a déjà reçu la récompense de cette mission.");
  let pts = 0;
  await runTransaction(db, async tx => {
    const s = await tx.get(subRef); if (!s.exists() || s.data().statut !== "en_attente") throw new Error("Cette preuve a déjà été traitée.");
    const sub = s.data(), m = await tx.get(doc(db, "missions", sub.missionId)); if (!m.exists()) throw new Error("La mission d’origine est introuvable.");
    const md = m.data(); pts = Math.max(0, Math.min(1000, Number(md.points || 0)));
    tx.update(subRef, { statut: "validee", pointsAttribues: pts, bonus: md.bonus || "", bonusResourceId: md.bonusResourceId || "", validatedAt: serverTimestamp() });
    if (pts > 0) tx.set(doc(db, "users", sub.uid), { points: increment(pts), updatedAt: serverTimestamp() }, { merge: true });
    if (md.bonusResourceId) tx.set(doc(db, "achats", `${sub.uid}_${md.bonusResourceId}`), { uid: sub.uid, email: sub.email, resourceId: md.bonusResourceId, statut: "valide", type: "bonus_mission", prixFCFA: 0, titre: md.bonus || "Bonus mission", validatedAt: serverTimestamp() }, { merge: true });
  });
  return pts;
}
async function refuserPreuve(subId, note) {
  await runTransaction(db, async tx => {
    const ref = doc(db, "mission_submissions", subId), s = await tx.get(ref);
    if (!s.exists() || s.data().statut !== "en_attente") throw new Error("Cette preuve a déjà été traitée.");
    tx.update(ref, { statut: "rejetee", commentaireAdmin: note, reviewedAt: serverTimestamp() });
  });
}
async function validations(v) {
  const list = h("div", { class: "grid" }), hist = h("div", { class: "wrap" });
  v.replaceChildren(h("h2", {}, "Preuves en attente"), list, h("h2", {}, "Dernières décisions"), hist);
  async function load() {
    try {
      const s = await getDocs(query(collection(db, "mission_submissions"), where("statut", "==", "en_attente")));
      list.replaceChildren(...(s.docs.length ? s.docs.map(x => { const d = x.data();
        const okB = h("button", { class: "btn dk", type: "button" }, "Valider et attribuer"), noB = h("button", { class: "btn rd", type: "button" }, "Refuser");
        okB.addEventListener("click", () => withBusy(okB, async () => { if (!confirm("Preuve vérifiée ? Attribuer les points et le bonus ?")) return; try { const pts = await validerPreuve(x.id); msg(`Preuve validée : ${pts} point(s) attribué(s).`); await load(); } catch (er) { msg(er?.code ? errFr(er) : er.message, "err"); await load(); } }));
        noB.addEventListener("click", () => withBusy(noB, async () => { const note = prompt("Motif ou conseil pour l’étudiant (facultatif) :"); if (note === null) return; try { await refuserPreuve(x.id, note || "Preuve non validée."); msg("Preuve refusée."); await load(); } catch (er) { msg(er?.code ? errFr(er) : er.message, "err"); await load(); } }));
        return h("article", { class: "card" }, h("span", { class: "tag wait" }, "En attente"), h("h3", {}, d.missionTitre || "Mission"), h("p", {}, "Étudiant : " + (d.email || d.uid)), h("p", { class: "proof" }, "Preuve : " + (d.preuve || "—")), h("p", { class: "hint" }, `Envoyée le ${fmt(d.createdAt)}`), okB, " ", noB);
      }) : [h("p", {}, "Aucune preuve en attente.")]));
      const done = await getDocs(query(collection(db, "mission_submissions"), where("statut", "in", ["validee", "rejetee"]), limit(30)));
      hist.replaceChildren(done.docs.length ? h("table", {}, h("tr", {}, ["Étudiant", "Mission", "Décision", "Points"].map(t => h("th", {}, t))), ...done.docs.map(x => { const d = x.data(); return h("tr", {}, h("td", {}, d.email || d.uid), h("td", {}, d.missionTitre || ""), h("td", {}, d.statut === "validee" ? "Validée" : "Refusée"), h("td", {}, d.pointsAttribues ?? "—")); })) : h("p", {}, "Aucune décision enregistrée."));
    } catch (er) { msg(errFr(er), "err"); }
  }
  await load();
}

// ---------- Achats à l'unité ----------
const STATUT_ACHAT = { en_attente: ["En attente", "wait"], valide: ["Validé", "free"], refuse: ["Refusé", "no"] };
async function achatsAdmin(v) {
  const pending = h("div", { class: "grid" }), form = h("form", { class: "card admin-form" }), all = h("div", { class: "wrap" });
  const email = h("input", { type: "email", required: true, placeholder: "E-mail exact du compte étudiant", id: "a_email" }), product = h("select", { required: true, id: "a_prod" });
  let products = [];
  form.append(h("h2", {}, "Débloquer un document manuellement"), h("p", {}, "À utiliser après un paiement vérifié hors demande en ligne. L’étudiant doit déjà avoir un compte."), h("label", { for: "a_email" }, "E-mail de l’étudiant"), email, h("label", { for: "a_prod" }, "Document acheté"), product, h("button", { class: "btn dk", type: "submit" }, "Confirmer le paiement et débloquer"));
  v.replaceChildren(h("h2", {}, "Demandes d’achat en attente"), pending, form, h("h2", {}, "Historique des accès"), all);
  try { products = (await getDocs(query(collection(db, "produits"), where("mode", "==", "achat")))).docs.map(x => ({ id: x.id, ...x.data() })); } catch {}
  try { const legacy = (await getDocs(query(collection(db, "produits"), where("published", "==", true)))).docs.map(x => ({ id: x.id, ...x.data() })).filter(p => !p.mode && !products.some(q => q.id === p.id)); products.push(...legacy); } catch {}
  product.replaceChildren(...(products.length ? products.map(p => h("option", { value: p.id }, `${p.titre} — ${fcfa(p.prixFCFA)}`)) : [h("option", { value: "", disabled: true }, "Aucun document payant publié")]));
  const decide = async (ref, statut) => updateDoc(ref, { statut, validatedAt: serverTimestamp(), validatedBy: u.email });
  async function load() {
    try {
      const s = await getDocs(collection(db, "achats")), rows = s.docs.map(x => ({ id: x.id, ...x.data() })).sort(newest);
      const wait = rows.filter(r => r.statut === "en_attente");
      pending.replaceChildren(...(wait.length ? wait.map(r => {
        const okB = h("button", { class: "btn dk", type: "button" }, "Valider le paiement"), noB = h("button", { class: "btn rd", type: "button" }, "Refuser");
        okB.addEventListener("click", () => withBusy(okB, async () => { if (!confirm(`Paiement de ${fcfa(r.prixFCFA)} bien reçu de ${r.email} ?`)) return; try { await decide(doc(db, "achats", r.id), "valide"); msg("Accès accordé à cet étudiant pour ce document."); await load(); } catch (er) { msg(errFr(er), "err"); } }));
        noB.addEventListener("click", () => withBusy(noB, async () => { if (!confirm("Refuser cette demande ?")) return; try { await decide(doc(db, "achats", r.id), "refuse"); await load(); } catch (er) { msg(errFr(er), "err"); } }));
        return h("article", { class: "card" }, h("span", { class: "tag wait" }, "En attente"), h("h3", {}, r.titre || r.resourceId), h("p", {}, `${r.email} · ${fcfa(r.prixFCFA)}`), h("p", { class: "hint" }, "Demande du " + fmt(r.createdAt) + " — vérifiez le paiement avant de valider."), okB, " ", noB);
      }) : [h("p", {}, "Aucune demande en attente.")]));
      all.replaceChildren(rows.length ? h("table", {}, h("tr", {}, ["Étudiant", "Document", "Montant", "Statut"].map(t => h("th", {}, t))), ...rows.slice(0, 50).map(r => { const [l, c] = STATUT_ACHAT[r.statut] || [r.statut, ""]; return h("tr", {}, h("td", {}, r.email || r.uid), h("td", {}, r.titre || r.resourceId), h("td", {}, fcfa(r.prixFCFA)), h("td", {}, h("span", { class: "tag " + c }, l))); })) : h("p", {}, "Aucun accès enregistré."));
    } catch (er) { msg(errFr(er), "err"); }
  }
  form.addEventListener("submit", e => { e.preventDefault(); const btn = form.querySelector("button[type=submit]"); withBusy(btn, async () => {
    const target = email.value.trim().toLowerCase(), p = products.find(x => x.id === product.value);
    if (!p) return msg("Choisissez un document.", "err");
    try {
      const found = await getDocs(query(collection(db, "users"), where("email", "==", target), limit(1)));
      if (found.empty) return msg("Compte introuvable : demandez à l’étudiant de créer son compte.", "err");
      if (!confirm(`Confirmer le paiement de ${fcfa(p.prixFCFA)} pour ${target} ?`)) return;
      const uid = found.docs[0].id, rid = p.resourceId || p.id;
      await setDoc(doc(db, "achats", `${uid}_${rid}`), { uid, email: target, resourceId: rid, productId: p.id, titre: p.titre, prixFCFA: Number(p.prixFCFA || 0), statut: "valide", type: "achat", validatedAt: serverTimestamp(), validatedBy: u.email }, { merge: true });
      msg("Document débloqué sur le compte de l’étudiant."); email.value = ""; await load();
    } catch (er) { msg(errFr(er), "err"); }
  }); });
  await load();
}

// ---------- Premium ----------
// Prolonge à partir de la date d'expiration si l'abonnement est encore actif, sinon à partir de maintenant.
async function activerPremium(uid) {
  const ref = doc(db, "users", uid); let exp;
  await runTransaction(db, async tx => {
    const s = await tx.get(ref), d = s.exists() ? s.data() : {}, now = new Date(), cur = d.subscriptionExpiresAt?.toDate?.(), running = d.subscriptionStatus === "active" && cur && cur > now;
    exp = new Date((running ? cur : now).getTime() + PREMIUM_DAYS * 864e5);
    const upd = { subscriptionStatus: "active", subscriptionExpiresAt: Timestamp.fromDate(exp), updatedAt: serverTimestamp() };
    if (!running) upd.subscriptionStartedAt = serverTimestamp();
    tx.set(ref, upd, { merge: true });
  });
  return exp;
}
async function demandes(v) {
  const box = h("div", { class: "wrap" }); v.replaceChildren(h("h2", {}, "Demandes d’abonnement Premium"), h("p", { class: "hint" }, "Vérifiez le paiement avant d’activer : une demande n’est pas une preuve de paiement."), box);
  async function load() {
    try {
      const rows = (await getDocs(collection(db, "demandes_activation"))).docs.map(x => ({ id: x.id, ...x.data() })).sort(newest);
      box.replaceChildren(rows.length ? h("table", {}, h("tr", {}, ["E-mail", "Type", "Date", "Statut", ""].map(t => h("th", {}, t))), ...rows.map(d => {
        const lab = { en_attente: ["En attente", "wait"], validee: ["Validée", "free"], rejetee: ["Refusée", "no"] }[d.statut] || [d.statut, ""];
        const acts = [];
        if (d.statut === "en_attente") {
          const okB = h("button", { class: "btn dk", type: "button" }, `Activer ${PREMIUM_DAYS} j`), noB = h("button", { class: "btn rd", type: "button" }, "Refuser");
          okB.addEventListener("click", () => withBusy(okB, async () => { if (!confirm(`Paiement vérifié pour ${d.email} ? Activer Premium ${PREMIUM_DAYS} jours ?`)) return; try { const exp = await activerPremium(d.uid); await updateDoc(doc(db, "demandes_activation", d.id), { statut: "validee", validatedAt: serverTimestamp() }); msg("Premium actif jusqu’au " + exp.toLocaleDateString("fr-FR")); await load(); } catch (er) { msg(errFr(er), "err"); } }));
          noB.addEventListener("click", () => withBusy(noB, async () => { try { await updateDoc(doc(db, "demandes_activation", d.id), { statut: "rejetee", validatedAt: serverTimestamp() }); await load(); } catch (er) { msg(errFr(er), "err"); } }));
          acts.push(okB, " ", noB);
        }
        return h("tr", {}, h("td", {}, d.email), h("td", {}, d.type === "premium" ? `Premium (${fcfa(d.montantFCFA)})` : d.operateur ? `Ancienne demande (${d.operateur} ${d.reference || ""})` : "—"), h("td", {}, fmt(d.createdAt)), h("td", {}, h("span", { class: "tag " + lab[1] }, lab[0])), h("td", { class: "row-actions" }, acts));
      })) : h("p", {}, "Aucune demande."));
    } catch (er) { msg(errFr(er), "err"); }
  }
  await load();
}
async function abonnes(v) {
  const form = h("form", { class: "card admin-form" }), email = h("input", { type: "email", required: true, id: "s_email", placeholder: "E-mail exact du compte étudiant" }), list = h("div", { class: "wrap" });
  form.append(h("h2", {}, "Activer Premium manuellement"), h("p", {}, "Après vérification du paiement (par WhatsApp ou Mobile Money), saisissez l’e-mail du compte. Le compte doit exister."), h("label", { for: "s_email" }, "E-mail de l’étudiant"), email, h("button", { class: "btn dk", type: "submit" }, `Activer Premium ${PREMIUM_DAYS} jours`));
  v.replaceChildren(form, h("h2", {}, "Abonnés"), list);
  form.addEventListener("submit", e => { e.preventDefault(); withBusy(form.querySelector("button"), async () => {
    const target = email.value.trim().toLowerCase();
    try {
      const found = await getDocs(query(collection(db, "users"), where("email", "==", target), limit(1)));
      if (found.empty) return msg("Compte introuvable : demandez à l’étudiant de se connecter au moins une fois.", "err");
      if (!confirm(`Activer Premium pour ${target} pendant ${PREMIUM_DAYS} jours ?`)) return;
      const exp = await activerPremium(found.docs[0].id); msg("Premium actif jusqu’au " + exp.toLocaleDateString("fr-FR")); email.value = ""; await loadList();
    } catch (er) { msg(errFr(er), "err"); }
  }); });
  async function loadList() {
    try {
      const s = await getDocs(query(collection(db, "users"), where("subscriptionStatus", "==", "active"))), rows = s.docs.map(x => ({ ...x.data(), _uid: x.id }));
      list.replaceChildren(rows.length ? h("table", {}, h("tr", {}, ["Nom", "E-mail", "Début", "Expiration", "État", ""].map(t => h("th", {}, t))), ...rows.map(d => h("tr", {}, h("td", {}, d.nom || ""), h("td", {}, d.email || ""), h("td", {}, fmt(d.subscriptionStartedAt)), h("td", {}, fmt(d.subscriptionExpiresAt)), h("td", {}, premium(d) ? "Actif" : "Expiré"),
        h("td", {}, h("button", { class: "btn rd", type: "button", onclick: async () => { if (!confirm(`Retirer Premium à ${d.email} ?`)) return; try { await updateDoc(doc(db, "users", d._uid), { subscriptionStatus: "inactive", updatedAt: serverTimestamp() }); await loadList(); } catch (er) { msg(errFr(er), "err"); } } }, "Retirer"))))) : h("p", {}, "Aucun abonnement enregistré."));
    } catch (er) { msg(errFr(er), "err"); }
  }
  await loadList();
}

// ---------- Diagnostic et migration ----------
async function diagnostic(v) {
  const out = h("pre", { class: "diag" });
  let claims = {}; try { claims = (await auth.currentUser.getIdTokenResult(true)).claims; } catch {}
  out.textContent = [`Connecté : ${u.email}`, `E-mail vérifié (navigateur) : ${u.emailVerified}`, `Jeton → email : ${claims.email} · email_verified : ${claims.email_verified}`, `Projet Firebase : ${db.app.options.projectId}`].join("\n");
  if (u.emailVerified && claims.email_verified !== true) out.textContent += "\n⚠ Votre e-mail est vérifié mais la session n’en tient pas encore compte : déconnectez-vous puis reconnectez-vous.";
  else if (claims.email_verified !== true) out.textContent += "\n⚠ E-mail non vérifié : ouvrez le lien reçu par e-mail (ou connectez-vous avec Google), puis reconnectez-vous.";
  const test = h("button", { class: "btn dk", type: "button" }, "Tester l’écriture Firestore (droits administrateur)");
  test.addEventListener("click", () => withBusy(test, async () => {
    try { const r = await addDoc(collection(db, "diagnostics"), { by: u.email, at: serverTimestamp() }); await deleteDoc(r); msg("✔ Écriture et suppression autorisées : les règles actuellement actives reconnaissent votre compte administrateur."); }
    catch (er) { msg("✘ Écriture refusée (" + (er.code || er.message) + "). Si le code est permission-denied : (1) publiez firestore.rules dans Firebase Console › Firestore › Règles ; (2) vérifiez que votre e-mail est vérifié ; (3) reconnectez-vous.", "err"); }
  }));
  const mig = h("button", { class: "btn", type: "button" }, "Migrer les contenus existants");
  mig.addEventListener("click", () => withBusy(mig, async () => {
    if (!confirm("Rendre visibles les formations/ressources existantes (published = true) et compléter le mode d’accès ? Les données existantes ne sont pas supprimées.")) return;
    try {
      let n = 0;
      for (const name of ["formations", "ressources"]) {
        for (const x of (await getDocs(collection(db, name))).docs) {
          const d = x.data(), patch = {};
          if (d.published === undefined) patch.published = true;
          if (name === "ressources" && !d.modeVente) patch.modeVente = d.isPremium ? "Inclus Premium" : "Gratuit";
          if (name === "ressources" && d.isPremium === undefined) patch.isPremium = false;
          if (Object.keys(patch).length) { await updateDoc(doc(db, name, x.id), patch); n++; }
          if (name === "ressources") await syncProduit(x.id, { ...d, ...patch });
        }
      }
      for (const x of (await getDocs(collection(db, "produits"))).docs) { if (!x.data().mode) { await updateDoc(doc(db, "produits", x.id), { mode: "achat" }); n++; } }
      msg(`Migration terminée : ${n} document(s) mis à jour.`);
    } catch (er) { msg(errFr(er), "err"); }
  }));
  v.replaceChildren(h("div", { class: "card" }, h("h2", {}, "Diagnostic des droits"), out, test),
    h("div", { class: "card" }, h("h2", {}, "Migration des anciennes données"), h("p", {}, "Les nouvelles règles n’affichent aux étudiants que les contenus avec published = true. Après avoir publié les nouvelles règles, lancez cette migration une fois pour rendre visibles vos contenus déjà enregistrés."), mig));
}

// ---------- Tableau de bord ----------
async function dashboard(v) {
  const count = q => getCountFromServer(q).then(r => r.data().count);
  const C = n => collection(db, n);
  const jobs = {
    inscrits: count(C("users")), premium: count(query(C("users"), where("subscriptionStatus", "==", "active"))),
    demPremium: count(query(C("demandes_activation"), where("statut", "==", "en_attente"))), achatsAtt: count(query(C("achats"), where("statut", "==", "en_attente"))),
    preuves: count(query(C("mission_submissions"), where("statut", "==", "en_attente"))),
    formPub: count(query(C("formations"), where("published", "==", true))), formTot: count(C("formations")),
    resPub: count(query(C("ressources"), where("published", "==", true))), resTot: count(C("ressources")), avis: count(C("avis"))
  };
  const keys = Object.keys(jobs), res = await Promise.allSettled(keys.map(k => jobs[k])), n = {};
  keys.forEach((k, i) => n[k] = res[i].status === "fulfilled" ? res[i].value : "—");
  const tile = (label, val, tab) => h("button", { class: "stat tile", type: "button", disabled: !tab, onclick: () => document.querySelector(`[data-n="${tab}"]`)?.click() }, h("b", {}, String(val)), h("span", {}, label));
  const todo = [n.demPremium, n.achatsAtt, n.preuves].reduce((t, x) => t + (Number(x) || 0), 0);
  const top = h("div", {}, h("p", { class: "hint" }, "Calcul en cours…")), cash = h("p", { class: "hint" }, "Calcul en cours…");
  v.replaceChildren(
    h("h2", {}, "Tableau de bord"), h("p", { class: todo ? "msg inf" : "hint" }, todo ? `${todo} élément(s) à traiter : touchez une case « à traiter » ci-dessous.` : "Rien à traiter pour le moment."),
    h("div", { class: "stats" }, tile("inscrits", n.inscrits), tile("abonnés Premium (actifs ou à vérifier)", n.premium, "abonnes"), tile("demandes Premium à traiter", n.demPremium, "demandes"), tile("achats à traiter", n.achatsAtt, "achats"), tile("preuves à valider", n.preuves, "validations")),
    h("div", { class: "stats" }, tile(`formations publiées (sur ${n.formTot})`, n.formPub, "formations"), tile(`ressources publiées (sur ${n.resTot})`, n.resPub, "ressources"), tile("avis reçus", n.avis, "avis")),
    n.formTot > 0 && n.formPub === 0 ? h("p", { class: "msg err" }, "Aucune formation publiée : les étudiants ne voient rien. Lancez Diagnostic › « Migrer les contenus existants » ou publiez vos formations.") : "",
    h("h3", {}, "Formations les plus consultées"), top, h("h3", {}, "Achats validés (estimation)"), cash);
  // Formations les plus consultées (collectionGroup « vues », limité à 500 lignes)
  try {
    const rows = (await getDocs(query(collectionGroup(db, "vues"), limit(500)))).docs.map(d => d.data()), tot = new Map();
    rows.forEach(r => { const t = tot.get(r.formationId) || { titre: r.titre || r.formationId, vues: 0, lecteurs: 0 }; t.vues += Number(r.nombre || 1); t.lecteurs += 1; tot.set(r.formationId, t); });
    const best = [...tot.entries()].sort((a, b) => b[1].vues - a[1].vues).slice(0, 5);
    top.replaceChildren(best.length ? h("ol", {}, best.map(([id, t]) => h("li", {}, h("a", { href: "formation.html?id=" + encodeURIComponent(id) }, t.titre), ` — ${t.vues} vue(s), ${t.lecteurs} étudiant(s)`))) : h("p", { class: "hint" }, "Pas encore de consultation enregistrée."));
  } catch (e) { top.replaceChildren(h("p", { class: "msg err" }, "Statistiques indisponibles : publiez les dernières règles Firestore (" + (e.code || e.message) + ").")); }
  try {
    const rows = (await getDocs(query(C("achats"), where("statut", "==", "valide"), limit(500)))).docs.map(d => d.data()).filter(r => r.type !== "bonus_mission");
    cash.replaceChildren(document.createTextNode(`${rows.length} document(s) vendu(s) pour ${fcfa(rows.reduce((t, r) => t + Number(r.prixFCFA || 0), 0))} (hors bonus de mission). Les abonnements ne sont pas inclus ici ; ils sont comptés dans « abonnés Premium ».`));
  } catch (e) { cash.textContent = "Indisponible : " + (e.code || e.message); }
}

// ---------- Modération des avis ----------
async function avisAdmin(v) {
  const box = h("div", { class: "wrap" }); v.replaceChildren(h("h2", {}, "Avis des étudiants"), h("p", { class: "hint" }, "Masquez un avis inapproprié (il n’est plus visible des étudiants) ou supprimez-le."), box);
  async function load() {
    try {
      const rows = (await getDocs(query(collection(db, "avis"), limit(200)))).docs.map(d => ({ id: d.id, ...d.data() })).sort(newest);
      box.replaceChildren(rows.length ? h("table", {}, h("tr", {}, ["Formation", "Note", "Auteur / commentaire", "État", ""].map(t => h("th", {}, t))), ...rows.map(r => h("tr", {},
        h("td", {}, r.formationTitre || r.formationId), h("td", {}, `${r.note}/5`), h("td", {}, h("b", {}, r.auteur || "Étudiant"), h("br"), r.commentaire || ""), h("td", {}, h("span", { class: "tag " + (r.visible ? "free" : "wait") }, r.visible ? "Visible" : "Masqué")),
        h("td", { class: "row-actions" },
          h("button", { class: "btn", type: "button", onclick: async () => { try { await updateDoc(doc(db, "avis", r.id), { visible: !r.visible }); await load(); } catch (er) { msg(errFr(er), "err"); } } }, r.visible ? "Masquer" : "Afficher"),
          h("button", { class: "btn rd", type: "button", onclick: async () => { if (!confirm("Supprimer définitivement cet avis ?")) return; try { await deleteDoc(doc(db, "avis", r.id)); await load(); } catch (er) { msg(errFr(er), "err"); } } }, "Supprimer"))))) : h("p", {}, "Aucun avis pour le moment."));
    } catch (er) { msg(errFr(er), "err"); }
  }
  await load();
}

// ---------- Contrôle d'accès à l'écran (exécuté en dernier : CFG, TABS, state… doivent être initialisés) ----------
if (!u) location.href = "connexion.html?next=admin.html";
else if (!isAdminEmail(u)) root.replaceChildren(h("p", { class: "msg err" }, "Accès réservé aux administrateurs autorisés."));
else if (!admin) {
  const b = h("button", { class: "btn dk", type: "button" }, "Renvoyer l’e-mail de vérification");
  b.addEventListener("click", () => withBusy(b, async () => { try { await sendEmailVerification(auth.currentUser); msg("E-mail de vérification envoyé à " + u.email + "."); } catch (e) { msg(errFr(e), "err"); } }));
  const r = h("button", { class: "btn", type: "button" }, "J’ai vérifié mon e-mail : actualiser");
  r.addEventListener("click", async () => { await auth.currentUser.reload(); await auth.currentUser.getIdToken(true); location.reload(); });
  root.replaceChildren(h("div", { class: "card" }, h("h2", {}, "Vérifiez votre e-mail administrateur"),
    h("p", {}, "Pour des raisons de sécurité, les règles Firestore n’accordent les droits administrateur qu’aux comptes autorisés dont l’adresse e-mail est vérifiée (ou connectés via Google)."), b, " ", r));
} else start();
