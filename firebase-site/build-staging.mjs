import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const sourcePath = path.join(root, "legacy", "index-supabase.html");
const publicDir = path.join(import.meta.dirname, "public");
const toolsDir = path.join(import.meta.dirname, "tools");
const outputPath = path.join(publicDir, "index.html");

fs.mkdirSync(publicDir, { recursive: true });
fs.mkdirSync(toolsDir, { recursive: true });

let html = fs.readFileSync(sourcePath, "utf8");

const dataStart = html.indexOf("const CH = [];");
const appMarker = "/* =====================================================================\n   APPLICATION";
const dataEnd = html.indexOf(appMarker, dataStart);
if (dataStart < 0 || dataEnd < 0) throw new Error("Bloc de chapitres introuvable");

const chapterSource = html.slice(dataStart, dataEnd).replace(
  "const CH = [];",
  "export const CH = [];",
);
fs.writeFileSync(
  path.join(toolsDir, "chapters-data.mjs"),
  `// Donnees locales reservees a l'import initial Firestore. Ne pas deployer.\n${chapterSource}`,
);

html = html.slice(0, dataStart) + "let CH = [];\n" + html.slice(dataEnd);
html = html.replace(
  '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>',
  '<link rel="stylesheet" href="./firebase-ui.css?v=20260827-2">',
);

const accountStart = html.indexOf("/* =====================================================================\n   COMPTE & SYNCHRONISATION");
const accountEndMarker = "// Fermer la modale au clic sur le fond";
const accountEnd = html.indexOf(accountEndMarker, accountStart);
if (accountStart < 0 || accountEnd < 0) throw new Error("Bloc Supabase introuvable");
html =
  html.slice(0, accountStart) +
  "/* Compte, synchronisation et publication des chapitres : voir firebase-app.js */\n" +
  html.slice(accountEnd);

const oldBoot = "buildSidebar(); renderWelcome(); fcInit(); buildSearchIndex(); refreshMastery(); refreshStudied(); _accountBoot();";
const newBoot = `
function replaceSESChapters(chapters){
  CH = Array.isArray(chapters) ? chapters.slice().sort((a,b)=>a.id-b.id) : [];
  currentChap = null;
  searchIdx = [];
  document.getElementById('chap-list').innerHTML = '';
  document.getElementById('search-results').innerHTML = '';
  buildSidebar();
  fcInit();
  buildSearchIndex();
  refreshMastery();
  refreshStudied();
  if(CH.length) renderWelcome();
  else document.getElementById('content').innerHTML = '<div class="welcome"><h1>Les chapitres arrivent bientôt.</h1><p>Le professeur n\\'a pas encore publié de chapitre. Reviens prochainement.</p></div>';
}
function reloadSESLocalState(){
  try{ RATINGS = JSON.parse(localStorage.getItem('ses-ratings')||'{}'); }catch(e){ RATINGS={}; }
  try{ STUDIED = JSON.parse(localStorage.getItem('ses-studied')||'{}'); }catch(e){ STUDIED={}; }
  try{ HIGHLIGHTS = JSON.parse(localStorage.getItem('ses-hl')||'{}'); }catch(e){ HIGHLIGHTS={}; }
  try{ EDITS = JSON.parse(localStorage.getItem('ses-edits')||'{}'); }catch(e){ EDITS={}; }
  refreshMastery();
  refreshStudied();
  if(currentChap != null) renderChapter(currentChap);
}
window.replaceSESChapters = replaceSESChapters;
window.startSESApp = replaceSESChapters;
window.reloadSESLocalState = reloadSESLocalState;
`;
if (!html.includes(oldBoot)) throw new Error("Boot historique introuvable");
html = html.replace(oldBoot, newBoot);

html = html.replace(
  "</script>\n\n<div id=\"hl-bar\">",
  "</script>\n<script type=\"module\" src=\"./firebase-app.js?v=20260827-2\"></script>\n\n<div id=\"hl-bar\">",
);

fs.writeFileSync(outputPath, html);
console.log(`Version Firebase generee : ${outputPath}`);
console.log(`Donnees d'import generees : ${path.join(toolsDir, "chapters-data.mjs")}`);
