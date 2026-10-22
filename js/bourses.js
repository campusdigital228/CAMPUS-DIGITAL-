import { db } from "./firebase.js";
import { collection, getDocs } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import { initPage, h, msg, errFr, safeUrl, newest } from "./commun.js";

await initPage();
const box = document.getElementById("liste");
try {
  const d = (await getDocs(collection(db, "bourses"))).docs.map(x => ({ id: x.id, ...x.data() })).sort(newest);
  box.replaceChildren(...(d.length ? d.map(b => {
    const url = safeUrl(b.urlOfficielle);
    return h("article", { class: "card" }, h("span", { class: "tag" }, b.statut || "à vérifier"), h("h3", {}, b.titre || "Bourse"),
      h("p", { class: "byline" }, [b.organisme, b.pays].filter(Boolean).join(" · ")), b.niveau ? h("p", {}, "Niveau : " + b.niveau) : "",
      h("p", {}, b.conditions || "Conditions à vérifier sur le site officiel."), h("p", {}, "Date limite : " + (b.dateLimite || "à vérifier")),
      url ? h("a", { class: "btn dk", href: url, target: "_blank", rel: "noopener noreferrer" }, "Consulter le site officiel ↗") : "");
  }) : [h("p", {}, "Aucune bourse publiée pour le moment.")]));
} catch (e) { box.textContent = ""; msg(errFr(e), "err"); }
