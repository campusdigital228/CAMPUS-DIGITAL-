import { initPage, h, loadFacultes, safeUrl, msg } from "./commun.js";
// Liste indicative utilisée tant que l'administration n'a pas créé de facultés dans l'espace Admin > Facultés.
// Les intitulés exacts et informations officielles doivent être confirmés/complétés par l'administrateur.
export const FAC = [
  ["FDD", "Faculté de Droit", "Droit et sciences juridiques (orientation indicative)."],
  ["FLLA", "Faculté des Lettres, Langues et Arts", "Lettres, langues et arts (orientation indicative)."],
  ["FASEG", "Faculté des Sciences Économiques et de Gestion", "Économie et gestion (orientation indicative)."],
  ["FSHS", "Faculté des Sciences de l'Homme et de la Société", "Sciences humaines et sociales (orientation indicative)."],
  ["FSS", "Faculté des Sciences de la Santé", "Sciences de la santé (orientation indicative)."],
  ["FDS", "Faculté des Sciences", "Sciences exactes et expérimentales (orientation indicative)."],
  ["Écoles et instituts", "Écoles et instituts", "Établissements spécialisés (orientation indicative)."]
];
if (document.getElementById("liste") && location.pathname.endsWith("facultes.html")) {
  await initPage();
  const box = document.getElementById("liste"), q = document.getElementById("q");
  let list = await loadFacultes();
  if (!list.length) {
    list = FAC.map(([code, titre, description]) => ({ code, titre, description }));
    const n = document.getElementById("note"); n.hidden = false;
    n.textContent = "Informations indicatives : l’équipe complète progressivement les fiches officielles des facultés.";
  }
  const draw = () => {
    const t = (q.value || "").toLowerCase();
    const r = list.filter(f => `${f.code} ${f.titre} ${f.description || ""} ${f.etablissement || ""}`.toLowerCase().includes(t));
    box.replaceChildren(...(r.length ? r.map(f => {
      const img = safeUrl(f.imageUrl), ext = safeUrl(f.urlOfficielle);
      return h("article", { class: "card faculty-card" },
        img ? h("img", { class: "cover", src: img, alt: "", loading: "lazy" }) : "",
        h("span", { class: "tag" }, f.code), h("h3", {}, f.titre),
        f.etablissement ? h("p", { class: "byline" }, f.etablissement) : "",
        h("p", {}, f.description || "Description à compléter par l’administration."),
        h("div", { class: "actions" }, h("a", { class: "btn dk", href: "formations.html?faculte=" + encodeURIComponent(f.code) }, "Explorer les formations"),
          ext ? h("a", { class: "btn", href: ext, target: "_blank", rel: "noopener noreferrer" }, "Site officiel ↗") : ""));
    }) : [h("p", {}, "Aucune faculté ne correspond à votre recherche.")]));
  };
  q.addEventListener("input", draw); draw();
}
