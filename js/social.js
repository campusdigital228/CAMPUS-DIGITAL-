// Obligation de suivre TikTok, YouTube et la chaîne WhatsApp avant d'accéder aux formations.
// Les réseaux ne permettent pas de vérifier un abonnement automatiquement : l'étudiant envoie une capture d'écran
// de chaque page, et l'administration valide (Administration › Abonnements réseaux). Document : suivi_reseaux/{uid}.
import { db } from "./firebase.js";
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { h, msg, errFr, fmt, withBusy } from "./commun.js";

export const SOCIAL = [
  { field: "imgTiktok", nom: "TikTok", url: "https://www.tiktok.com/@campus.digital7", verbe: "Suis le compte TikTok", preuve: "Capture de la page CAMPUS DIGITAL où le bouton affiche « Abonné(e) »." },
  { field: "imgYoutube", nom: "YouTube", url: "https://youtube.com/@campusdigital-l1t?si=DnfLAT40_fy7gva9", verbe: "Abonne-toi à la chaîne YouTube", preuve: "Capture de la chaîne où le bouton affiche « Abonné(e) »." },
  { field: "imgWhatsapp", nom: "Chaîne WhatsApp", url: "https://whatsapp.com/channel/0029VbDXiPF5q08YEcfuzs1g", verbe: "Rejoins la chaîne WhatsApp", preuve: "Capture de la chaîne où tu es bien abonné(e) (bouton « Abonné(e) » ou cloche)." }
];
const MAX_CHARS = 220000; // une capture compressée ; les règles Firestore refusent au-delà de 250 000 caractères
const isImg = s => typeof s === "string" && s.startsWith("data:image/");

// Réduit la capture (côté navigateur) pour qu'elle tienne dans le document Firestore (limite 1 Mio, pas de Storage).
async function compress(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error("Choisis une image (capture d’écran).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error("Image illisible. Essaie une autre capture.")); i.src = url; });
    const k = Math.min(1, 1400 / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    let q = 0.7, out = c.toDataURL("image/jpeg", q);
    while (out.length > MAX_CHARS && q > 0.25) { q -= 0.1; out = c.toDataURL("image/jpeg", q); }
    if (out.length > MAX_CHARS) throw new Error("Capture trop lourde : recadre-la puis réessaie.");
    return out;
  } finally { URL.revokeObjectURL(url); }
}

export async function ensureSocialAccess({ u, p, admin, box }) {
  if (admin) return true;
  const next = encodeURIComponent((location.pathname.split("/").pop() || "formations.html") + location.search);
  if (!u) {
    box.replaceChildren(h("article", { class: "card" }, h("h2", {}, "Connecte-toi pour accéder aux formations"), h("p", {}, "Les formations sont réservées aux étudiants inscrits qui suivent nos 3 pages (TikTok, YouTube et chaîne WhatsApp)."), h("a", { class: "btn dk", href: "connexion.html?next=" + next }, "Se connecter / S’inscrire")));
    return false;
  }
  let s = null;
  try { const d = await getDoc(doc(db, "suivi_reseaux", u.uid)); s = d.exists() ? d.data() : null; }
  catch (e) { box.replaceChildren(h("p", { class: "msg err" }, errFr(e))); return false; }
  if (s?.statut === "valide") return true;
  renderGate(box, u, p, s); return false;
}

function renderGate(box, u, p, s) {
  const pending = s?.statut === "en_attente", rejected = s?.statut === "rejete", files = {};
  const links = h("div", { class: "grid" }, SOCIAL.map((n, i) => {
    const prev = h("img", { class: "social-prev", alt: "", hidden: true });
    const inp = h("input", { type: "file", accept: "image/*", id: "cap-" + n.field, "aria-label": "Capture " + n.nom });
    inp.addEventListener("change", async () => {
      try { files[n.field] = await compress(inp.files[0]); prev.src = files[n.field]; prev.hidden = false; msg(""); }
      catch (e) { delete files[n.field]; prev.hidden = true; inp.value = ""; msg(e.message || errFr(e), "err"); }
    });
    return h("article", { class: "card" }, h("span", { class: "tag" }, "Étape " + (i + 1)), h("h3", {}, n.nom), h("p", {}, n.verbe + ", puis reviens ici."),
      h("a", { class: "btn dk", href: n.url, target: "_blank", rel: "noopener noreferrer" }, "Ouvrir " + n.nom + " ↗"),
      pending ? "" : h("div", {}, h("label", { for: "cap-" + n.field }, "Ta capture d’écran"), h("p", { class: "hint" }, n.preuve), inp, prev));
  }));
  const parts = [h("h2", {}, "Dernière étape avant les formations"),
    h("p", {}, "Pour débloquer les formations, suis nos 3 pages puis envoie une capture d’écran de chacune. L’équipe vérifie tes captures et active ton accès.")];
  if (pending) parts.push(h("p", { class: "msg inf" }, "Tes captures ont bien été envoyées (" + fmt(s.createdAt) + "). Elles sont en cours de vérification : reviens bientôt sur cette page."), links);
  else {
    if (rejected) parts.push(h("p", { class: "msg err" }, "Tes captures n’ont pas été validées. " + (s.commentaireAdmin || "Vérifie que tu suis bien les 3 pages, puis renvoie des captures lisibles.")));
    const send = h("button", { class: "btn dk", type: "button" }, rejected ? "Renvoyer mes 3 captures" : "Envoyer mes 3 captures");
    send.addEventListener("click", () => withBusy(send, async () => {
      if (SOCIAL.some(n => !files[n.field])) return msg("Ajoute une capture pour chacune des 3 pages (TikTok, YouTube et WhatsApp).", "err");
      try {
        const data = { statut: "en_attente", imgTiktok: files.imgTiktok, imgYoutube: files.imgYoutube, imgWhatsapp: files.imgWhatsapp, createdAt: serverTimestamp() };
        const ref = doc(db, "suivi_reseaux", u.uid);
        if (s) await updateDoc(ref, data); else await setDoc(ref, { uid: u.uid, email: u.email, nom: p?.nom || "", ...data });
        msg("Captures envoyées. L’équipe va les vérifier.");
        renderGate(box, u, p, { statut: "en_attente", createdAt: { toDate: () => new Date() } });
      } catch (e) { msg(errFr(e), "err"); }
    }));
    parts.push(links, h("div", { class: "actions" }, send));
  }
  box.replaceChildren(h("section", { class: "card social-gate" }, ...parts));
}

// ---------- Administration › Abonnements réseaux ----------
export async function reseauxAdmin(v, admin) {
  const list = h("div", { class: "grid" }), hist = h("div", { class: "wrap" });
  v.replaceChildren(h("h2", {}, "Captures en attente"), h("p", { class: "hint" }, "Vérifie que chaque capture montre bien l’abonnement à la bonne page. Les images sont supprimées après ta décision."), list, h("h2", {}, "Dernières décisions"), hist);
  const decide = async (id, data) => updateDoc(doc(db, "suivi_reseaux", id), { ...data, imgTiktok: "", imgYoutube: "", imgWhatsapp: "", reviewedAt: serverTimestamp(), reviewedBy: admin?.email || "" });
  async function load() {
    try {
      const s = await getDocs(query(collection(db, "suivi_reseaux"), where("statut", "==", "en_attente")));
      list.replaceChildren(...(s.docs.length ? s.docs.map(x => {
        const d = x.data(), okB = h("button", { class: "btn dk", type: "button" }, "Valider l’accès"), noB = h("button", { class: "btn rd", type: "button" }, "Refuser");
        okB.addEventListener("click", () => withBusy(okB, async () => { try { await decide(x.id, { statut: "valide" }); msg("Accès aux formations activé."); await load(); } catch (e) { msg(errFr(e), "err"); } }));
        noB.addEventListener("click", () => withBusy(noB, async () => { const note = prompt("Motif pour l’étudiant (ex. : capture TikTok manquante) :"); if (note === null) return; try { await decide(x.id, { statut: "rejete", commentaireAdmin: note || "Captures non conformes." }); msg("Demande refusée."); await load(); } catch (e) { msg(errFr(e), "err"); } }));
        return h("article", { class: "card" }, h("span", { class: "tag wait" }, "En attente"), h("h3", {}, d.nom || d.email || x.id), h("p", {}, d.email || ""), h("p", { class: "hint" }, "Envoyé le " + fmt(d.createdAt)),
          h("div", { class: "proof-imgs" }, SOCIAL.map(n => h("figure", {}, h("figcaption", {}, n.nom), isImg(d[n.field]) ? h("a", { href: d[n.field], target: "_blank", rel: "noopener" }, h("img", { class: "social-prev", src: d[n.field], alt: "Capture " + n.nom })) : h("em", {}, "Image manquante")))), okB, " ", noB);
      }) : [h("p", {}, "Aucune demande en attente.")]));
      const done = await getDocs(query(collection(db, "suivi_reseaux"), where("statut", "in", ["valide", "rejete"]), limit(30)));
      hist.replaceChildren(done.docs.length ? h("table", {}, h("tr", {}, ["Étudiant", "Décision", "Motif"].map(t => h("th", {}, t))), ...done.docs.map(x => { const d = x.data(); return h("tr", {}, h("td", {}, d.email || x.id), h("td", {}, d.statut === "valide" ? "Validé" : "Refusé"), h("td", {}, d.commentaireAdmin || "—")); })) : h("p", {}, "Aucune décision enregistrée."));
    } catch (e) { msg(errFr(e), "err"); }
  }
  await load();
}
