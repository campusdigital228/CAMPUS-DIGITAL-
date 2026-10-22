// Cartes de ressources et de produits payants (bibliothèque, détail d'une formation)
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { h, msg, errFr, safeUrl, fcfa, accessBadge, withBusy, waButton, shareButton } from "./commun.js";

const openUrl = url => { const w = window.open(url, "_blank", "noopener"); if (!w) location.href = url; };
const cover = it => { const c = safeUrl(it.couvertureUrl); return c ? h("img", { class: "cover", src: c, alt: "", loading: "lazy" }) : ""; };
const meta = it => h("div", { class: "tags" }, accessBadge(it), it.categorie ? h("span", { class: "tag" }, it.categorie) : "", it.niveau ? h("span", { class: "tag" }, it.niveau) : "", it.format ? h("span", { class: "tag" }, it.format) : "");
const byline = it => (it.auteur ? h("p", { class: "byline" }, "Source / auteur : " + it.auteur) : "");

// Ressource à laquelle l'étudiant a déjà accès (gratuite, Premium actif ou achat validé)
export function resourceCard(it) {
  const url = safeUrl(it.url);
  const label = it.format === "PDF" || it.categorie === "Document PDF" ? "Lire / télécharger le PDF" : it.format === "Vidéo YouTube" ? "Regarder la vidéo" : "Ouvrir la ressource";
  return h("article", { class: "card" }, cover(it), meta(it), h("h3", {}, it.titre || "Sans titre"), h("p", {}, it.description || ""), byline(it),
    url ? h("a", { class: "btn dk", href: url, target: "_blank", rel: "noopener noreferrer" }, label) : h("p", { class: "hint" }, "Le lien de cette ressource sera ajouté prochainement."),
    shareButton(it.titre || "Ressource", "bibliotheque.html?q=" + encodeURIComponent(it.titre || ""), "share-link"));
}

// Fiche du catalogue payant (collection « produits », publique, sans lien de fichier)
export function productCard(p, { user, grants, refresh }) {
  const premiumOnly = p.mode === "premium", resId = p.resourceId || p.id;
  const price = premiumOnly ? "Inclus dans Premium" : fcfa(p.prixFCFA);
  const card = h("article", { class: "card" }, cover(p), meta({ ...p, modeVente: premiumOnly ? "Inclus Premium" : "Achat à l’unité", isPremium: true }), h("h3", {}, p.titre || "Document"), h("p", {}, p.description || ""), byline(p), h("p", {}, h("strong", {}, price)));
  card.append(shareButton(p.titre || "Document", "bibliotheque.html?q=" + encodeURIComponent(p.titre || ""), "share-link"));
  if (premiumOnly) { card.append(h("a", { class: "btn dk", href: "abonnement.html" }, "Débloquer avec Premium")); return card; }
  if (!user) { card.append(h("a", { class: "btn dk", href: "connexion.html?next=bibliotheque.html" }, "Se connecter pour acheter")); return card; }
  const g = grants.get(resId), ref = doc(db, "achats", `${user.uid}_${resId}`);
  const wa = waButton("paiement", "Envoyer la demande sur WhatsApp", { type: "Achat à l’unité", titre: p.titre, montant: p.prixFCFA, email: user.email });
  if (g?.statut === "valide") {
    const b = h("button", { class: "btn dk", type: "button" }, "Ouvrir mon document");
    b.addEventListener("click", () => withBusy(b, async () => {
      try { const r = await getDoc(doc(db, "ressources", resId)), url = r.exists() ? safeUrl(r.data().url) : null; if (url) openUrl(url); else msg("Le lien de ce document n’est pas encore disponible. Contactez l’équipe.", "err"); } catch (e) { msg(errFr(e), "err"); }
    }));
    card.append(h("span", { class: "tag free" }, "Accès validé"), " ", b);
  } else if (g?.statut === "en_attente") {
    card.append(h("span", { class: "tag wait" }, "En attente de validation"), " ", wa);
  } else {
    if (g?.statut === "refuse") card.append(h("span", { class: "tag no" }, "Demande refusée"), " ");
    const b = h("button", { class: "btn dk", type: "button" }, g?.statut === "refuse" ? "Refaire la demande" : "Demander l’achat");
    b.addEventListener("click", () => withBusy(b, async () => {
      try {
        if (g?.statut === "refuse") await updateDoc(ref, { statut: "en_attente", createdAt: serverTimestamp() });
        else await setDoc(ref, { uid: user.uid, email: user.email, resourceId: resId, productId: p.id, titre: p.titre || "", prixFCFA: Number(p.prixFCFA || 0), statut: "en_attente", type: "achat", createdAt: serverTimestamp() });
        msg("Demande enregistrée. Envoyez maintenant le message WhatsApp : l’accès est débloqué après vérification du paiement.");
        await refresh();
      } catch (e) { msg(errFr(e), "err"); }
    }));
    card.append(b);
  }
  return card;
}
