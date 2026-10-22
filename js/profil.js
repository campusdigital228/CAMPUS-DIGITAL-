import { db, auth } from "./firebase.js";
import { doc, updateDoc, collection, getDocs, getDoc, query, where } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { initPage, h, msg, errFr, fmt, premium, safeUrl, withBusy, ensureProfile, faculteCodes, fillSelect, loadAccessible, NIVEAUX, waButton } from "./commun.js";

const { u, prem } = await initPage();
if (!u) location.href = "connexion.html?next=profil.html";
else {
  const $ = i => document.getElementById(i), ref = doc(db, "users", u.uid);
  fillSelect($("niveau"), NIVEAUX.filter(n => n !== "Tous niveaux"));
  $("wa").append(waButton("support", "Contacter le support", { email: u.email }));
  if (new URLSearchParams(location.search).has("bienvenue")) msg("Bienvenue sur CAMPUS DIGITAL ! Complète ta fiche étudiant ci-dessous si tu le souhaites.", "inf");
  const codes = await faculteCodes().catch(() => []);
  const none = t => h("p", { class: "hint" }, t);

  function fiche(p) {
    const rows = [["Nom complet", p.nom], ["E-mail", u.email], ["Téléphone", p.telephone], ["Université / établissement", p.universite], ["Faculté", p.faculte], ["Formation / filière", p.formation], ["Niveau d’études", p.niveau], ["Ville", p.ville], ["Inscrit(e) le", fmt(p.createdAt)]];
    $("fiche").replaceChildren(...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v && v !== "—" ? v : h("em", {}, "À compléter"))]));
  }
  function header(p, actif) {
    const nom = p.nom || u.displayName || u.email, ini = nom.split(/\s+/).map(x => x[0]).slice(0, 2).join("").toUpperCase() || "CD";
    $("avatar").textContent = ini; $("pf-nom").textContent = nom;
    $("pf-sub").textContent = [u.email, p.ville].filter(Boolean).join(" · ");
    $("pf-tags").replaceChildren(...[p.niveau, p.faculte, p.formation, p.universite].filter(Boolean).map(x => h("span", { class: "tag" }, x)), h("span", { class: "tag " + (actif ? "pr" : "free") }, actif ? "Premium actif" : "Compte gratuit"));
  }
  async function show() {
    try {
      const { data: p } = await ensureProfile(u), actif = premium(p), expire = p.subscriptionStatus === "active" && !actif;
      fillSelect($("faculte"), [...codes.filter(c => c !== "Général"), p.faculte].filter(Boolean)); fillSelect($("niveau"), [p.niveau].filter(Boolean));
      $("prenom").value = p.prenom || ""; $("nom").value = p.nomFamille ?? (p.prenom ? "" : p.nom || "");
      $("tel").value = p.telephone || ""; $("ville").value = p.ville || ""; $("univ").value = p.universite || "";
      $("faculte").value = p.faculte || ""; $("niveau").value = p.niveau || ""; $("formation").value = p.formation || "";
      header(p, actif); fiche(p);
      $("abo").textContent = actif ? "Premium actif" : expire ? "Premium expiré" : "Gratuit"; $("abo").className = "tag " + (actif ? "pr" : "");
      $("deb").textContent = fmt(p.subscriptionStartedAt); $("exp").textContent = fmt(p.subscriptionExpiresAt);
      $("s-pts").textContent = Number(p.points || 0);
      $("ver").textContent = u.emailVerified ? "✓ E-mail vérifié" : "E-mail non vérifié"; $("verif").hidden = u.emailVerified;
      await Promise.all([vues(p), docs(), missions()]);
    } catch (e) { msg(errFr(e), "err"); }
  }
  let seen = new Set();
  async function vues(p) {
    try {
      const rows = (await getDocs(collection(db, "users", u.uid, "vues"))).docs.map(d => d.data()).sort((a, b) => (b.derniereVue?.seconds || 0) - (a.derniereVue?.seconds || 0));
      seen = new Set(rows.map(r => r.formationId)); $("s-vues").textContent = rows.length;
      $("vues").replaceChildren(...(rows.length ? rows.slice(0, 12).map(r => h("article", { class: "card" }, h("div", { class: "tags" }, r.faculte ? h("span", { class: "tag" }, r.faculte) : "", r.niveau ? h("span", { class: "tag" }, r.niveau) : ""), h("h3", {}, r.titre || "Formation"), h("p", { class: "hint" }, `Dernière visite : ${fmt(r.derniereVue)} · ${r.nombre || 1} visite(s)`), h("a", { class: "btn dk", href: "formation.html?id=" + encodeURIComponent(r.formationId) }, "Reprendre"))) : [none("Tu n’as pas encore consulté de formation."), h("a", { class: "btn dk", href: "formations.html" }, "Explorer les formations")]));
      const all = await loadAccessible("formations", prem).catch(() => []);
      const reco = all.filter(f => !seen.has(f.id) && (!p.faculte || f.faculte === p.faculte) && (!p.niveau || !f.niveau || f.niveau === p.niveau || f.niveau === "Tous niveaux")).slice(0, 6);
      $("reco").replaceChildren(...(reco.length ? reco.map(f => h("article", { class: "card" }, h("div", { class: "tags" }, f.faculte ? h("span", { class: "tag" }, f.faculte) : "", f.niveau ? h("span", { class: "tag" }, f.niveau) : ""), h("h3", {}, f.titre), h("p", { class: "clamp" }, f.description || ""), h("a", { class: "btn dk", href: "formation.html?id=" + encodeURIComponent(f.id) }, "Voir la formation"))) : [none(p.faculte || p.niveau ? "Aucune nouvelle formation pour ta faculté et ton niveau pour le moment." : "Renseigne ta faculté et ton niveau (Modifier mes informations) pour recevoir des suggestions."), h("a", { class: "btn", href: "formations.html" }, "Toutes les formations")]));
    } catch (e) { $("vues").replaceChildren(none("Historique indisponible : " + errFr(e))); }
  }
  async function docs() {
    try {
      const rows = (await getDocs(query(collection(db, "achats"), where("uid", "==", u.uid), where("statut", "==", "valide")))).docs.map(d => d.data());
      $("s-docs").textContent = rows.length;
      $("docs").replaceChildren(...(rows.length ? rows.map(r => { const b = h("button", { class: "btn dk", type: "button" }, "Ouvrir");
        b.addEventListener("click", () => withBusy(b, async () => { try { const s = await getDoc(doc(db, "ressources", r.resourceId)), url = s.exists() ? safeUrl(s.data().url) : null; if (url) { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; } else msg("Lien indisponible pour le moment.", "err"); } catch (e) { msg(errFr(e), "err"); } }));
        return h("article", { class: "card" }, h("span", { class: "tag free" }, r.type === "bonus_mission" ? "Bonus mission" : "Acheté"), h("h3", {}, r.titre || r.resourceId), b); }) : [none("Aucun document débloqué pour le moment."), h("a", { class: "btn", href: "bibliotheque.html" }, "Voir la bibliothèque")]));
    } catch (e) { $("docs").replaceChildren(none(errFr(e))); }
  }
  async function missions() {
    try { $("s-miss").textContent = (await getDocs(query(collection(db, "mission_submissions"), where("uid", "==", u.uid), where("statut", "==", "validee")))).size; } catch {}
  }
  $("f").addEventListener("submit", async e => {
    e.preventDefault();
    const prenom = $("prenom").value.trim(), nomFamille = $("nom").value.trim();
    if (!prenom && !nomFamille) return msg("Indiquez au moins votre prénom ou votre nom.", "err");
    await withBusy($("save"), async () => {
      try {
        await updateDoc(ref, { prenom, nomFamille, nom: `${prenom} ${nomFamille}`.trim(), telephone: $("tel").value.trim(), ville: $("ville").value.trim(), universite: $("univ").value.trim(), faculte: $("faculte").value, niveau: $("niveau").value, formation: $("formation").value.trim() });
        msg("Profil mis à jour."); await show();
      } catch (er) { msg(errFr(er), "err"); }
    });
  });
  $("verif").addEventListener("click", () => withBusy($("verif"), async () => {
    try { await sendEmailVerification(auth.currentUser); msg("E-mail de vérification envoyé : ouvrez le lien reçu, puis rechargez cette page."); } catch (er) { msg(errFr(er), "err"); }
  }));
  await show();
}
