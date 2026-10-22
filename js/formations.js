import { ensureSocialAccess } from "./social.js";
import { initPage, h, msg, errFr, loadAccessible, faculteCodes, fillSelect, NIVEAUX, accessBadge, diagButton, isAdminEmail, TYPES_FORMATION } from "./commun.js";

const { u, p, prem, admin } = await initPage();
const $ = i => document.getElementById(i), box = $("liste");
fillSelect($("niveau"), NIVEAUX);
const allowed = await ensureSocialAccess({ u, p, admin, box });
if (!allowed) { $("q").hidden = true; document.querySelector(".filters").hidden = true; }
else try {
  const [data, codes] = await Promise.all([loadAccessible("formations", prem), faculteCodes()]);
  fillSelect($("faculte"), codes); fillSelect($("type"), [...new Set([...TYPES_FORMATION, ...data.map(f => f.type).filter(Boolean)])]);
  const params = new URLSearchParams(location.search), wanted = params.get("faculte");
  if (wanted) { fillSelect($("faculte"), [wanted]); $("faculte").value = wanted; $("contexte").hidden = false; $("contexte").textContent = `Formations de : ${wanted}.`; }
  $("q").value = params.get("q") || "";
  if (u && p?.nom) { const b = $("bonjour"); if (b) { b.hidden = false; b.textContent = `Bonjour ${p.prenom || p.nom} ! Voici les formations disponibles par domaine${p.faculte ? ", avec celles de ta faculté en premier" : ""}.`; } }

  const card = f => h("article", { class: "card" },
    h("div", { class: "tags" }, accessBadge(f), f.type ? h("span", { class: "tag" }, f.type) : "", f.niveau ? h("span", { class: "tag" }, f.niveau) : "", f.duree ? h("span", { class: "tag" }, f.duree) : ""),
    h("h3", {}, f.titre || "Sans titre"), h("p", { class: "clamp" }, f.description || ""),
    h("a", { class: "btn dk", href: "formation.html?id=" + encodeURIComponent(f.id) }, "Voir la formation"));

  const draw = () => {
    const t = $("q").value.trim().toLowerCase();
    const r = data.filter(f => (!t || `${f.titre || ""} ${f.description || ""} ${f.faculte || ""} ${f.matieres || ""}`.toLowerCase().includes(t)) && (!$("faculte").value || f.faculte === $("faculte").value) && (!$("niveau").value || f.niveau === $("niveau").value || f.niveau === "Tous niveaux") && (!$("type").value || f.type === $("type").value));
    if (!r.length) {
      box.replaceChildren(h("p", {}, data.length ? "Aucune formation pour ces critères." : "Aucune formation publiée pour le moment."),
        isAdminEmail(u) && !data.length ? h("div", { class: "msg inf" }, h("p", {}, "Administrateur : ajoutez et publiez des formations dans Administration › Formations. Si elles existaient déjà, lancez Diagnostic › « Migrer les contenus existants »."), h("a", { class: "btn dk", href: "admin.html" }, "Ouvrir l’administration"), " ", diagButton()) : "");
      return;
    }
    // Regroupement par domaine (faculté) ; la faculté de l'étudiant passe en premier.
    const groups = new Map();
    r.forEach(f => { const k = f.faculte || "Autres formations"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
    const keys = [...groups.keys()].sort((a, b) => (b === p?.faculte) - (a === p?.faculte) || a.localeCompare(b, "fr"));
    box.replaceChildren(...keys.map(k => h("section", { class: "domain" },
      h("h2", { class: "domain-title" }, k, " ", h("span", { class: "count" }, `${groups.get(k).length} formation${groups.get(k).length > 1 ? "s" : ""}`), k === p?.faculte ? h("span", { class: "tag free" }, "Ta faculté") : ""),
      h("div", { class: "grid" }, groups.get(k).map(card)))));
  };
  ["q", "faculte", "niveau", "type"].forEach(i => $(i).addEventListener("input", draw)); draw();
  if (!prem) msg("Les formations Premium s’affichent après activation de ton abonnement.", "inf");
} catch (e) { box.replaceChildren(...(isAdminEmail(u) ? [diagButton()] : [])); msg(errFr(e), "err"); }
