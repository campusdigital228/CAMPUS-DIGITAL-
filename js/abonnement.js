import { db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPage, h, msg, errFr, fmt, fcfa, premium, withBusy, waButton, PREMIUM_PRICE } from "./commun.js";

const { u, p } = await initPage();
const etat = document.getElementById("etat"), actions = document.getElementById("actions");
document.getElementById("prix").textContent = fcfa(PREMIUM_PRICE);
const LABEL = { en_attente: "En attente de validation", validee: "Validée", rejetee: "Refusée" };

if (!u) {
  etat.replaceChildren(h("p", {}, "Connecte-toi pour voir ton abonnement et faire une demande."));
  actions.replaceChildren(h("a", { class: "btn dk", href: "connexion.html?next=abonnement.html" }, "Se connecter"), " ", waButton("premium", "Informations Premium sur WhatsApp"));
} else {
  const reqRef = doc(db, "demandes_activation", `${u.uid}_premium`);
  async function render() {
    let req = null;
    try { const s = await getDoc(reqRef); req = s.exists() ? s.data() : null; } catch (e) { msg(errFr(e), "err"); }
    const actif = premium(p), expire = p.subscriptionStatus === "active" && !actif;
    etat.replaceChildren(
      h("p", {}, h("span", { class: "tag " + (actif ? "pr" : "") }, actif ? "Premium actif" : expire ? "Premium expiré" : "Gratuit")),
      h("p", {}, `Début : ${fmt(p.subscriptionStartedAt)} · Expiration : ${fmt(p.subscriptionExpiresAt)}`),
      req ? h("p", {}, "Dernière demande : ", h("span", { class: "tag " + (req.statut === "en_attente" ? "wait" : req.statut === "validee" ? "free" : "no") }, LABEL[req.statut] || req.statut), ` (${fmt(req.createdAt)})`) : ""
    );
    const pending = req?.statut === "en_attente";
    const wa = waButton("paiement", "Envoyer la demande sur WhatsApp", { type: actif ? "Renouvellement Premium" : "Abonnement Premium", titre: "Premium — 30 jours", montant: PREMIUM_PRICE, email: u.email }, "btn dk");
    const btn = h("button", { class: "btn dk", type: "button", disabled: pending }, pending ? "Demande déjà enregistrée" : actif || expire ? "Enregistrer ma demande de renouvellement" : "Enregistrer ma demande");
    btn.addEventListener("click", () => withBusy(btn, async () => {
      try {
        const data = { uid: u.uid, email: u.email, type: "premium", montantFCFA: PREMIUM_PRICE, statut: "en_attente", createdAt: serverTimestamp() };
        if (req) await updateDoc(reqRef, { statut: "en_attente", createdAt: serverTimestamp() }); else await setDoc(reqRef, data);
        msg("Demande enregistrée. Envoie maintenant le message WhatsApp pour régler le paiement : l’activation se fait après vérification.");
        await render();
      } catch (e) { msg(errFr(e), "err"); }
    }));
    actions.replaceChildren(btn, " ", wa);
  }
  await render();
}
