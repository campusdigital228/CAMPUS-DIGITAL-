import { db } from "./firebase.js";
import { collection, getDocs, query, where, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPage, h, msg, errFr, safeUrl, fmt, withBusy } from "./commun.js";

const { u } = await initPage();
const list = document.getElementById("missions"), mine = document.getElementById("mes-missions"), points = document.getElementById("points");
const STATUT = { en_attente: ["En attente de validation", "wait"], validee: ["Validée", "free"], rejetee: ["Refusée — à corriger", "no"] };

if (!u) {
  points.textContent = "Connecte-toi pour participer aux missions et suivre tes récompenses.";
  list.replaceChildren(h("p", {}, "La participation aux missions est réservée aux comptes connectés."), h("a", { class: "btn dk", href: "connexion.html?next=missions.html" }, "Se connecter"));
  mine.replaceChildren();
} else {
  async function render() {
    try {
      const profile = await getDoc(doc(db, "users", u.uid));
      points.textContent = `Solde actuel : ${Number(profile.data()?.points || 0)} point(s). Les points sont attribués uniquement après validation par l’équipe.`;
      const [ms, ss] = await Promise.all([
        getDocs(query(collection(db, "missions"), where("active", "==", true))),
        getDocs(query(collection(db, "mission_submissions"), where("uid", "==", u.uid)))
      ]);
      const subs = ss.docs.map(d => ({ id: d.id, ...d.data() }));
      const bySub = new Map(); subs.forEach(s => { const o = bySub.get(s.missionId); if (!o || (s.createdAt?.seconds || 0) >= (o.createdAt?.seconds || 0)) bySub.set(s.missionId, s); });

      mine.replaceChildren(...(subs.length ? subs.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).map(s => {
        const [label, cls] = STATUT[s.statut] || [s.statut, ""];
        const card = h("article", { class: "card" }, h("span", { class: "tag " + cls }, label), h("h3", {}, s.missionTitre || "Mission"),
          h("p", {}, s.statut === "validee" ? `+${Number(s.pointsAttribues || 0)} point(s)${s.bonus ? " — Bonus : " + s.bonus : ""}` : s.statut === "rejetee" ? (s.commentaireAdmin || "La preuve n’a pas été validée. Tu peux la corriger et la renvoyer.") : "Ta preuve est en cours de vérification."), h("p", { class: "hint" }, "Envoyée le " + fmt(s.createdAt)));
        if (s.statut === "validee" && s.bonusResourceId) {
          const b = h("button", { class: "btn dk", type: "button" }, "Ouvrir mon bonus");
          b.addEventListener("click", () => withBusy(b, async () => {
            try { const r = await getDoc(doc(db, "ressources", s.bonusResourceId)), url = r.exists() ? safeUrl(r.data().url) : null; if (url) { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; } else msg("Le bonus n’a pas de lien disponible pour le moment.", "err"); } catch (e) { msg(errFr(e), "err"); }
          }));
          card.append(b);
        }
        return card;
      }) : [h("p", {}, "Tu n’as pas encore soumis de mission.")]));

      if (!ms.size) { list.replaceChildren(h("p", {}, "Aucune mission active actuellement. Reviens bientôt.")); return; }
      list.replaceChildren(...ms.docs.map(d => {
        const m = { id: d.id, ...d.data() }, s = bySub.get(m.id);
        const closed = m.dateLimiteTs?.toDate && m.dateLimiteTs.toDate() < new Date();
        const card = h("article", { class: "card" }, h("span", { class: "tag" }, m.plateforme || "Mission"), closed ? h("span", { class: "tag no" }, "Clôturée") : "",
          h("h3", {}, m.titre || "Mission"), h("p", {}, m.description || ""),
          m.instructions ? h("div", { class: "instr" }, h("b", {}, "Instructions"), h("p", {}, m.instructions)) : "",
          h("p", {}, h("strong", {}, `Récompense : ${Number(m.points || 0)} point(s)`), m.bonus ? ` + bonus : ${m.bonus}` : ""),
          m.dateLimite ? h("p", { class: "hint" }, "Date limite : " + new Date(m.dateLimite + "T00:00:00").toLocaleDateString("fr-FR")) : "");
        const link = safeUrl(m.url); if (link) card.append(h("a", { class: "btn", href: link, target: "_blank", rel: "noopener noreferrer" }, "Ouvrir la mission ↗"), " ");
        if (m.ressourceId && m.ressourceTitre) card.append(h("a", { class: "btn", href: "bibliotheque.html?q=" + encodeURIComponent(m.ressourceTitre) }, "Ressource associée"));
        if (s && s.statut !== "rejetee") { card.append(h("p", { class: "msg inf" }, s.statut === "validee" ? "Mission validée : récompense déjà attribuée." : "Preuve déjà envoyée : en attente de validation.")); return card; }
        if (closed) { card.append(h("p", { class: "msg inf" }, "La date limite est dépassée : cette mission n’accepte plus de preuve.")); return card; }
        const form = h("form", { class: "mission-proof" }), proof = h("textarea", { required: true, rows: 3, maxlength: "2000", placeholder: "Lien de preuve public ou explication précise de ce que tu as fait" });
        const send = h("button", { class: "btn dk", type: "submit" }, s ? "Renvoyer la preuve corrigée" : "Envoyer pour validation");
        form.append(h("label", {}, "Ta preuve (obligatoire)"), proof, send);
        form.addEventListener("submit", e => { e.preventDefault(); withBusy(send, async () => {
          const text = proof.value.trim(); if (text.length < 8) return msg("Ajoute une preuve ou une explication plus précise (8 caractères minimum).", "err");
          try {
            const ref = doc(db, "mission_submissions", `${u.uid}_${m.id}`);
            if (s && s.id === ref.id) await updateDoc(ref, { preuve: text, statut: "en_attente", createdAt: serverTimestamp() });
            else await setDoc(ref, { uid: u.uid, email: u.email, missionId: m.id, missionTitre: m.titre || "Mission", preuve: text, statut: "en_attente", pointsDemandes: Number(m.points || 0), bonus: m.bonus || "", bonusResourceId: m.bonusResourceId || "", createdAt: serverTimestamp() });
            msg("Preuve envoyée. Les points seront attribués après vérification par l’équipe."); await render();
          } catch (er) { msg(errFr(er), "err"); }
        }); });
        card.append(form); return card;
      }));
    } catch (e) { msg(errFr(e), "err"); list.textContent = "Impossible de charger les missions."; }
  }
  await render();
}
