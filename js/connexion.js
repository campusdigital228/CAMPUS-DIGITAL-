import { auth, db, authReady } from "./firebase.js";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, GoogleAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPage, msg, errFr, isAdmin, withBusy, ensureProfile, faculteCodes, fillSelect, NIVEAUX, waButton } from "./commun.js";

const { u: existing } = await initPage(); await authReady;
const $ = i => document.getElementById(i);
let mode = "login";

// Déjà connecté : on l'indique au lieu de rediriger (évite toute boucle de redirection).
if (existing) {
  // Déjà connecté : on quitte la page de connexion (formations.html ne renvoie jamais vers connexion.html : pas de boucle).
  $("authBox").hidden = true; $("already").hidden = false;
  $("alreadyWho").textContent = `Connecté avec ${existing.email}. Redirection vers les formations…`;
  location.replace(destination(existing));
} else {
  fillSelect($("niveau"), NIVEAUX.filter(n => n !== "Tous niveaux"));
  faculteCodes().then(c => fillSelect($("faculte"), c.filter(x => x !== "Général"))).catch(() => {});
  $("waHelp").replaceChildren(waButton("inscription", "Écrire sur WhatsApp", {}, "btn"));
  setMode("login");
}

// Destination après connexion : uniquement une page interne connue (pas de redirection ouverte).
function destination(u) {
  const n = new URLSearchParams(location.search).get("next") || "";
  const ok = /^(profil|abonnement|formations|formation|bibliotheque|missions|admin|recherche|facultes|bourses)\.html(\?[\w=&%.\-]*)?$/.test(n);
  if (ok && !(n.startsWith("admin.html") && !isAdmin(u))) return n;
  return "formations.html";
}
// La création du profil ne doit jamais bloquer la redirection (3 s maximum).
const soon = p => Promise.race([p, new Promise(r => setTimeout(r, 3000))]).catch(() => {});
function setMode(m) {
  mode = m;
  $("signupW").hidden = m !== "signup"; $("pw2W").hidden = m !== "signup"; $("pwW").hidden = m === "reset";
  $("googleBox").hidden = m === "reset";
  $("pw").autocomplete = m === "signup" ? "new-password" : "current-password";
  $("go").textContent = { login: "Se connecter", signup: "Créer mon compte", reset: "Envoyer le lien de réinitialisation" }[m];
  document.querySelectorAll("[data-m]").forEach(b => { b.classList.toggle("active", b.dataset.m === m); b.setAttribute("aria-pressed", String(b.dataset.m === m)); });
  msg("");
}
document.querySelectorAll("[data-m]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.m)));
const initialMode = new URLSearchParams(location.search).get("mode");
if (!existing && ["signup", "reset"].includes(initialMode)) setMode(initialMode);

$("f").addEventListener("submit", async e => {
  e.preventDefault();
  const email = $("email").value.trim(), pw = $("pw").value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return msg("Adresse e-mail invalide.", "err");
  if (mode !== "reset" && pw.length < 6) return msg("Mot de passe : 6 caractères minimum.", "err");
  const prenom = $("prenom").value.trim(), nomFamille = $("nom").value.trim();
  if (mode === "signup") {
    if (!prenom || !nomFamille) return msg("Indiquez votre prénom et votre nom.", "err");
    if (pw !== $("pw2").value) return msg("Les deux mots de passe ne sont pas identiques.", "err");
  }
  await withBusy($("go"), async () => {
    msg("Veuillez patienter…", "inf");
    try {
      if (mode === "reset") { await sendPasswordResetEmail(auth, email); msg("Si un compte existe avec cet e-mail, un lien de réinitialisation vient d’être envoyé (vérifiez vos spams)."); return; }
      if (mode === "signup") {
        const c = await createUserWithEmailAndPassword(auth, email, pw);
        try { await sendEmailVerification(c.user); } catch {}
        const d = { prenom, nomFamille, nom: `${prenom} ${nomFamille}`.trim(), telephone: $("tel").value.trim(), universite: $("univ").value.trim(), faculte: $("faculte").value, formation: $("formation").value.trim(), niveau: $("niveau").value, ville: $("ville").value.trim() };
        Object.keys(d).forEach(k => { if (!d[k]) delete d[k]; });
        try { await setDoc(doc(db, "users", c.user.uid), { ...d, email: c.user.email, createdAt: serverTimestamp() }); }
        catch (er) { console.warn("Profil non créé :", er); msg("Compte créé, mais le profil n’a pas pu être enregistré. Complétez-le depuis « Profil ».", "err"); setTimeout(() => location.href = "profil.html", 1800); return; }
        location.href = destination(c.user);
      } else {
        const c = await signInWithEmailAndPassword(auth, email, pw);
        await soon(ensureProfile(c.user));
        location.href = destination(c.user);
      }
    } catch (er) { msg(errFr(er), "err"); }
  });
});

$("google").addEventListener("click", () => withBusy($("google"), async () => {
  msg("Ouverture de la fenêtre Google…", "inf");
  try {
    const provider = new GoogleAuthProvider(); provider.setCustomParameters({ prompt: "select_account" });
    const { user } = await signInWithPopup(auth, provider);
    const r = await Promise.race([ensureProfile(user), new Promise(x => setTimeout(x, 3000))]).catch(() => null);
    location.href = r?.created ? "profil.html?bienvenue=1" : destination(user);
  } catch (er) { msg(errFr(er), "err"); }
}));
