// Fonctions partagées : navigation, session, droits, requêtes compatibles avec les règles Firestore
import { auth, db, authReady } from "./firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, getDoc, setDoc, collection, getDocs, query, where, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export const ADMINS = ["tameclor@gmail.com", "rtameclo@gmail.com"];
export const WHATSAPP_NUMBER = "22898207231";          // format international sans +
export const WHATSAPP_DISPLAY = "+228 98 20 72 31";
export const PREMIUM_PRICE = 3000;                      // FCFA
export const PREMIUM_DAYS = 30;
export const CONTACT_EMAIL = "tameclor@gmail.com";
export const FACULTES = ["FDD", "FLLA", "FASEG", "FSHS", "FSS", "FDS", "Écoles et instituts", "Général"];
export const NIVEAUX = ["Licence 1", "Licence 2", "Licence 3", "Master", "Doctorat", "Tous niveaux"];
export const CATEGORIES = ["Cours", "Document PDF", "Livre", "Fiche de révision", "Exercices", "Annales", "Ressource complémentaire"];
export const TYPES_FORMATION = ["Licence", "Master", "Doctorat", "Cours", "Tutoriel", "Exercices", "Certificat", "Autre"];
export const MODES = ["Gratuit", "Achat à l’unité", "Inclus Premium"];

// Affichage uniquement : les vrais droits administrateur sont vérifiés par les règles Firestore
// (e-mail autorisé ET e-mail vérifié). Ici on évite simplement d'afficher des écrans inutiles.
export const isAdminEmail = u => !!u && ADMINS.includes((u.email || "").toLowerCase());
export const isAdmin = u => isAdminEmail(u) && u.emailVerified === true;
export const premium = p => !!p && p.subscriptionStatus === "active" && !!p.subscriptionExpiresAt?.toDate && p.subscriptionExpiresAt.toDate() > new Date();

export function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === "class") e.className = v; else if (k.startsWith("on")) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? "" : v);
  }
  kids.flat().forEach(c => { if (c === false || c == null) return; e.append(c instanceof Node ? c : document.createTextNode(c)); });
  return e;
}
export function msg(t, type = "ok") {
  const b = document.getElementById("msg"); if (!b) return;
  b.textContent = t || ""; b.className = "msg " + type; b.hidden = !t;
  b.setAttribute("role", type === "err" ? "alert" : "status");
  if (t) b.scrollIntoView({ block: "nearest", behavior: "smooth" });
}
export const safeUrl = u => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : null; } catch { return null; } };
export const fmt = ts => ts?.toDate ? ts.toDate().toLocaleDateString("fr-FR") : "—";
export const fcfa = n => `${Number(n || 0).toLocaleString("fr-FR")} FCFA`;
export const newest = (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);

export function errFr(e) {
  const c = e?.code || "";
  if (c.includes("permission-denied")) return "Opération refusée par Firebase. Causes possibles : règles Firestore non publiées dans la console, compte non connecté, e-mail administrateur non vérifié, ou données qui ne respectent pas les règles. (Admin : onglet « Diagnostic ».)";
  if (c.includes("failed-precondition")) return "Firestore demande un index pour cette requête. Ouvrez la console du navigateur : le message contient un lien de création.";
  if (c.includes("unavailable") || c === "auth/network-request-failed") return "Problème de réseau. Vérifiez votre connexion puis réessayez.";
  if (c.includes("unauthenticated") || c === "auth/user-token-expired" || c === "auth/requires-recent-login") return "Votre session a expiré. Reconnectez-vous.";
  const m = {
    "auth/invalid-email": "Adresse e-mail invalide.", "auth/invalid-credential": "E-mail ou mot de passe incorrect.", "auth/wrong-password": "E-mail ou mot de passe incorrect.",
    "auth/user-not-found": "Aucun compte avec cet e-mail.", "auth/email-already-in-use": "Cet e-mail est déjà utilisé. Connectez-vous ou réinitialisez votre mot de passe.",
    "auth/weak-password": "Mot de passe trop faible (6 caractères minimum).", "auth/too-many-requests": "Trop de tentatives. Patientez puis réessayez.",
    "auth/user-disabled": "Ce compte est désactivé. Contactez l’équipe sur WhatsApp.",
    "auth/popup-closed-by-user": "Connexion Google annulée.", "auth/cancelled-popup-request": "Connexion Google annulée.",
    "auth/popup-blocked": "Le navigateur a bloqué la fenêtre Google. Autorisez les fenêtres pop-up puis réessayez.",
    "auth/unauthorized-domain": "Ce domaine n’est pas autorisé pour la connexion. Ajoutez-le dans Firebase Console › Authentication › Paramètres › Domaines autorisés.",
    "auth/operation-not-allowed": "Ce mode de connexion n’est pas activé dans Firebase Console › Authentication › Méthode de connexion.",
    "auth/account-exists-with-different-credential": "Un compte existe déjà avec cet e-mail. Connectez-vous avec votre mot de passe."
  };
  return m[c] || "Erreur : " + (e?.message || "inconnue");
}
// Désactive un bouton pendant une opération asynchrone
export async function withBusy(btn, fn) {
  if (btn) { btn.disabled = true; btn.setAttribute("aria-busy", "true"); btn.classList.add("loading"); }
  try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.removeAttribute("aria-busy"); btn.classList.remove("loading"); } }
}

export async function currentUser() {
  await authReady.catch(() => {});
  return new Promise(r => { const un = onAuthStateChanged(auth, u => { un(); r(u); }); });
}
export async function getProfile(u) {
  try { const s = await getDoc(doc(db, "users", u.uid)); return s.exists() ? s.data() : {}; } catch { return {}; }
}
// Crée le profil étudiant (users/{uid}) s'il n'existe pas : jamais de doublon, lié au uid Firebase Auth.
export async function ensureProfile(u, extra = {}) {
  const ref = doc(db, "users", u.uid), s = await getDoc(ref);
  if (s.exists()) return { data: s.data(), created: false };
  const data = { nom: u.displayName || "", ...extra, email: u.email, createdAt: serverTimestamp() };
  await setDoc(ref, data);
  return { data, created: true };
}

// ---------- WhatsApp : moyen de contact et demandes de paiement (pas une preuve de paiement) ----------
export function waLink(kind, v = {}) {
  const mail = v.email ? ` E-mail de mon compte : ${v.email}.` : "";
  const T = {
    inscription: `Bonjour CAMPUS DIGITAL, j’ai besoin d’aide pour mon inscription.${mail}`,
    technique: `Bonjour CAMPUS DIGITAL, j’ai un problème technique : (décrivez le problème ici).${mail}`,
    premium: `Bonjour CAMPUS DIGITAL, je souhaite des informations sur l’abonnement Premium (${fcfa(PREMIUM_PRICE)} pour ${PREMIUM_DAYS} jours).${mail}`,
    paiement: `Bonjour CAMPUS DIGITAL, je fais une demande de paiement.\nType d’achat : ${v.type || "Achat"}\nContenu : ${v.titre || "—"}\nMontant : ${fcfa(v.montant)}\nE-mail de mon compte : ${v.email || "à préciser"}\nMerci de m’indiquer comment payer. Un administrateur validera mon accès après vérification.`,
    support: `Bonjour CAMPUS DIGITAL, j’ai besoin d’assistance : (décrivez votre demande ici).${mail}`
  };
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(T[kind] || T.support)}`;
}
// Partage d'une page par WhatsApp (lien absolu vers la page interne)
export function shareLink(titre, relUrl) {
  const url = new URL(relUrl, location.href).href;
  return `https://wa.me/?text=${encodeURIComponent(`${titre} — à découvrir sur CAMPUS DIGITAL : ${url}`)}`;
}
export const shareButton = (titre, relUrl, cls = "btn") => h("a", { class: cls, href: shareLink(titre, relUrl), target: "_blank", rel: "noopener noreferrer" }, "Partager sur WhatsApp");
export const diagButton = () => h("a", { class: "btn dk", href: "admin.html#diagnostic" }, "Ouvrir le diagnostic administrateur");
export const waButton = (kind, label, v = {}, cls = "btn") => h("a", { class: cls, href: waLink(kind, v), target: "_blank", rel: "noopener noreferrer" }, label);

// ---------- Données : requêtes qui respectent exactement ce que les règles autorisent ----------
// Les règles exigent published == true, et isPremium == false pour les non-abonnés (ressources : modeVente pour les abonnés).
export async function loadAccessible(name, prem, extra = []) {
  // Si le serveur refuse la lecture « abonné/administrateur » (jeton de session pas encore à jour après la
  // vérification de l'e-mail, règles anciennes…), on retombe sur la lecture des contenus gratuits publiés.
  try { return await loadAccessibleRaw(name, prem, extra); }
  catch (e) { if (prem && String(e?.code).includes("permission-denied")) return loadAccessibleRaw(name, false, extra); throw e; }
}
async function loadAccessibleRaw(name, prem, extra = []) {
  const ref = collection(db, name), base = [where("published", "==", true), ...extra];
  let qs;
  if (name === "ressources") {
    qs = [query(ref, ...base, where("isPremium", "==", false))];
    if (prem) qs.push(query(ref, ...base, where("modeVente", "==", "Inclus Premium")));
  } else qs = [prem ? query(ref, ...base) : query(ref, ...base, where("isPremium", "==", false))];
  const snaps = await Promise.all(qs.map(q => getDocs(q))), seen = new Map();
  snaps.forEach(s => s.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() })));
  return [...seen.values()].sort(newest);
}
export async function loadPublished(name, extra = []) {
  const s = await getDocs(query(collection(db, name), where("published", "==", true), ...extra));
  return s.docs.map(d => ({ id: d.id, ...d.data() })).sort(newest);
}
// Facultés créées par l'administration (vide si aucune : les pages utilisent alors la liste indicative intégrée)
export async function loadFacultes() {
  try { const l = await loadPublished("facultes"); return l.map(f => ({ ...f, code: f.code || f.titre })); } catch { return []; }
}
export async function faculteCodes() {
  const dyn = (await loadFacultes()).map(f => f.code);
  return [...new Set([...FACULTES, ...dyn])];
}
export function fillSelect(sel, values) {
  if (!sel) return; const cur = sel.value;
  values.forEach(o => { if (![...sel.options].some(x => x.value === o)) sel.append(h("option", { value: o }, o)); });
  if (cur) sel.value = cur;
}
// Badge d'accès : Gratuit / Premium / Achat à l'unité
export function accessBadge(it) {
  const mode = it.modeVente || (it.isPremium ? "Inclus Premium" : "Gratuit");
  if (mode === "Gratuit") return h("span", { class: "tag free" }, "Gratuit");
  if (mode === "Achat à l’unité") return h("span", { class: "tag buy" }, "Achat à l’unité");
  return h("span", { class: "tag pr" }, "Premium");
}

// ---------- En-tête, menu, pied de page ----------
export async function initPage() {
  const u = await currentUser();
  const admin = isAdmin(u);
  const p = u ? await getProfile(u) : {};
  const here = location.pathname.split("/").pop() || "index.html";
  const links = [["index.html", "Accueil"], ["facultes.html", "Facultés"], ["formations.html", "Formations"], ["bibliotheque.html", "Bibliothèque"], ["missions.html", "Missions & bonus"], ["abonnement.html", "Premium"], ["bourses.html", "Bourses"], ["recherche.html", "Recherche"], ["profil.html", "Profil"]];
  if (admin) links.push(["admin.html", "Administration"]);
  const nav = h("nav", { id: "nav", "aria-label": "Navigation principale" }, links.map(([a, t]) => h("a", { href: a, "aria-current": a === here ? "page" : false }, t)));
  if (u) nav.append(h("a", { href: "#", onclick: async e => { e.preventDefault(); await signOut(auth); location.href = "index.html"; } }, "Déconnexion"));
  else nav.append(h("a", { href: "connexion.html", class: "nav-cta", "aria-current": here === "connexion.html" ? "page" : false }, "Connexion / Inscription"));
  const burger = h("button", { id: "burger", type: "button", "aria-label": "Ouvrir le menu", "aria-expanded": "false", "aria-controls": "nav", onclick: () => { const o = nav.classList.toggle("open"); burger.setAttribute("aria-expanded", String(o)); } }, "☰");
  const bar = h("div", { class: "bar" }, h("a", { class: "logo", href: "index.html" }, "CAMPUS ", h("span", {}, "DIGITAL")), burger);
  document.getElementById("hd")?.append(bar, nav);
  document.getElementById("ft")?.append(
    h("div", { class: "footer-inner" },
      h("div", { class: "footer-brand" }, h("span", { class: "footer-mark" }, "CD"), h("div", {}, h("strong", {}, "CAMPUS DIGITAL"), h("small", {}, "Apprendre • Se former • Réussir"))),
      h("div", { class: "footer-cols" },
        h("div", {}, h("b", {}, "Explorer"), h("a", { href: "facultes.html" }, "Facultés"), h("a", { href: "formations.html" }, "Formations"), h("a", { href: "bibliotheque.html" }, "Bibliothèque"), h("a", { href: "bourses.html" }, "Bourses")),
        h("div", {}, h("b", {}, "Mon espace"), h("a", { href: "missions.html" }, "Missions & bonus"), h("a", { href: "abonnement.html" }, "Premium"), h("a", { href: "profil.html" }, "Profil"), h("a", { href: "connexion.html" }, "Connexion / Inscription")),
        h("div", {}, h("b", {}, "Contact"), waButton("support", `WhatsApp ${WHATSAPP_DISPLAY}`, { email: u?.email }, "footer-wa"), h("a", { href: `mailto:${CONTACT_EMAIL}` }, CONTACT_EMAIL), h("a", { href: "mentions.html" }, "Mentions légales"))
      ),
      h("p", { class: "footer-contact" }, `© ${new Date().getFullYear()} CAMPUS DIGITAL · Les paiements sont vérifiés manuellement par l’équipe.`)
    )
  );
  renewBanner(u, p, here);
  revealOnScroll();
  document.body.classList.add(here.replace(/\.html$/, "") + "-page");
  return { u, p, admin, prem: premium(p) || admin };
}

// Apparition douce au défilement (désactivée si l'utilisateur préfère moins d'animations)
function revealOnScroll() {
  const items = [...document.querySelectorAll("[data-reveal]")];
  if (!items.length) return;
  if (!("IntersectionObserver" in window) || matchMedia("(prefers-reduced-motion: reduce)").matches) { items.forEach(el => el.classList.add("is-visible", "revealed")); return; }
  document.documentElement.classList.add("js-motion");
  const obs = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add("is-visible", "revealed"); obs.unobserve(en.target); } }), { threshold: 0.08, rootMargin: "0px 0px -24px 0px" });
  items.forEach(el => obs.observe(el));
  // Sécurité : si l'observateur ne se déclenche pas, rien ne reste invisible.
  setTimeout(() => items.forEach(el => el.classList.add("is-visible", "revealed")), 2500);
}

// Rappel : Premium bientôt expiré (5 jours) ou déjà expiré. Fermable pour la session.
function renewBanner(u, p, here) {
  if (!u || here === "abonnement.html" || !p?.subscriptionExpiresAt?.toDate) return;
  const exp = p.subscriptionExpiresAt.toDate(), days = Math.ceil((exp - new Date()) / 864e5);
  const actif = premium(p), expired = p.subscriptionStatus === "active" && !actif;
  if (!(actif && days <= 5) && !expired) return;
  try { if (sessionStorage.getItem("cd-banner") === "1") return; } catch {}
  const text = expired ? `Ton abonnement Premium a expiré le ${exp.toLocaleDateString("fr-FR")}. Renouvelle-le pour retrouver les contenus Premium.` : `Ton Premium expire dans ${Math.max(days, 0)} jour(s) (le ${exp.toLocaleDateString("fr-FR")}). Pense à le renouveler.`;
  const close = h("button", { type: "button", class: "banner-close", "aria-label": "Fermer le rappel", onclick: () => { try { sessionStorage.setItem("cd-banner", "1"); } catch {} bar.remove(); } }, "×");
  const bar = h("div", { class: "renew-banner", role: "status" }, h("span", {}, text), h("a", { class: "btn dk", href: "abonnement.html" }, "Renouveler"), waButton("paiement", "WhatsApp", { type: "Renouvellement Premium", titre: "Premium — 30 jours", montant: PREMIUM_PRICE, email: u.email }), close);
  document.getElementById("hd")?.after(bar);
}
