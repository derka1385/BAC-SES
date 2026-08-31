import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDWUV6zEHunczghydM8BLHJtnmmnCTjjRQ",
  authDomain: "ses-revision.firebaseapp.com",
  projectId: "ses-revision",
  storageBucket: "ses-revision.firebasestorage.app",
  messagingSenderId: "327257485210",
  appId: "1:327257485210:web:ca5653aa0b0b4370121423",
  measurementId: "G-C6F4W3GVZ0",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const SES_KEYS = ["ses-ratings", "ses-studied", "ses-hl", "ses-edits"];

let currentUser = null;
let isTeacher = false;
let accountMode = "login";
let chapters = [];
let appStarted = false;
let accountTrigger = null;
let teacherTrigger = null;
let landingAudience = "student";
let landingMode = "login";
let requiredAudience = null;
let landingMessage = "";
let landingMessageOk = false;
let signupInProgress = false;
const cloudTimers = new Map();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function friendlyAuthError(error) {
  const code = error?.code || "";
  if (code.includes("invalid-credential")) return "E-mail ou mot de passe incorrect.";
  if (code.includes("email-already-in-use")) return "Un compte existe déjà avec cet e-mail.";
  if (code.includes("weak-password")) return "Choisis un mot de passe d’au moins 6 caractères.";
  if (code.includes("invalid-email")) return "Cette adresse e-mail n’est pas valide.";
  if (code.includes("too-many-requests")) return "Trop de tentatives. Réessaie un peu plus tard.";
  if (code.includes("network-request-failed")) return "Connexion internet indisponible.";
  return "Une erreur est survenue. Réessaie.";
}

function setAccountMessage(message, ok = false) {
  const element = document.getElementById("acct-msg");
  if (!element) return;
  element.textContent = message || "";
  element.className = `acct-msg${ok ? " ok" : ""}`;
}

function setSyncStatus(message, ok = true) {
  const element = document.getElementById("acct-sync");
  if (!element) return;
  element.innerHTML = `<span class="sdot" style="background:${ok ? "#22c55e" : "#ef4444"}"></span>${escapeHtml(message)}`;
}

function setLandingMessage(message, ok = false) {
  landingMessage = message || "";
  landingMessageOk = ok;
  const element = document.getElementById("landing-message");
  if (!element) return;
  element.textContent = landingMessage;
  element.className = `landing-message${ok ? " ok" : ""}`;
}

function ensureLandingUI() {
  if (document.getElementById("auth-landing")) return;
  const landing = document.createElement("section");
  landing.id = "auth-landing";
  landing.className = "auth-landing";
  landing.setAttribute("aria-labelledby", "landing-title");
  landing.innerHTML = `
    <div class="landing-orb landing-orb-one" aria-hidden="true"></div>
    <div class="landing-orb landing-orb-two" aria-hidden="true"></div>
    <div class="landing-shell">
      <div class="landing-story">
        <div class="landing-brand"><span class="landing-brand-mark">SES</span><span>Réviser les SES</span></div>
        <p class="landing-eyebrow">Terminale · Programme officiel</p>
        <h1 id="landing-title">Le cours avance.<br><em>Ta maîtrise aussi.</em></h1>
        <p class="landing-lead">Retrouve les chapitres publiés par ton professeur, révise chaque objectif et suis ta progression jusqu’au bac.</p>
        <div class="landing-benefits" aria-label="Fonctionnalités">
          <span><b>01</b> Cours par objectifs</span>
          <span><b>02</b> Flashcards adaptatives</span>
          <span><b>03</b> Progression synchronisée</span>
        </div>
      </div>
      <div class="landing-card">
        <div class="audience-tabs" role="tablist" aria-label="Type de connexion">
          <button id="student-tab" type="button" role="tab" aria-selected="true" aria-controls="landing-form" onclick="setLandingAudience('student')">Élève</button>
          <button id="teacher-tab" type="button" role="tab" aria-selected="false" aria-controls="landing-form" onclick="setLandingAudience('teacher')">Professeur</button>
        </div>
        <div id="landing-form"></div>
      </div>
    </div>`;
  document.body.prepend(landing);

  landing.querySelector(".audience-tabs")?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    window.setLandingAudience(landingAudience === "student" ? "teacher" : "student");
    document.getElementById(landingAudience === "student" ? "student-tab" : "teacher-tab")?.focus();
  });
}

function renderLanding() {
  ensureLandingUI();
  const studentTab = document.getElementById("student-tab");
  const teacherTab = document.getElementById("teacher-tab");
  studentTab?.setAttribute("aria-selected", String(landingAudience === "student"));
  teacherTab?.setAttribute("aria-selected", String(landingAudience === "teacher"));
  const form = document.getElementById("landing-form");
  if (!form) return;

  const teacher = landingAudience === "teacher";
  const signup = !teacher && landingMode === "signup";
  form.innerHTML = `
    <div class="landing-form-head">
      <span class="landing-role-icon" aria-hidden="true">${teacher ? "✦" : "↗"}</span>
      <div>
        <p class="landing-form-kicker">Espace ${teacher ? "professeur" : "élève"}</p>
        <h2>${signup ? "Créer ton compte" : `Connexion ${teacher ? "professeur" : "élève"}`}</h2>
      </div>
    </div>
    <p class="landing-form-copy">${teacher
      ? "Accède au tableau de publication et choisis quand débloquer chaque chapitre."
      : signup
        ? "Crée ton espace pour retrouver ta progression sur tous tes appareils."
        : "Connecte-toi pour retrouver les chapitres disponibles et reprendre tes révisions."}</p>
    <form id="landing-auth-form">
      <label for="landing-email">Adresse e-mail</label>
      <input id="landing-email" type="email" inputmode="email" autocomplete="username" required aria-describedby="landing-message">
      <label for="landing-password">Mot de passe</label>
      <input id="landing-password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="6" required aria-describedby="landing-message">
      <div id="landing-message" class="landing-message${landingMessageOk ? " ok" : ""}" role="status" aria-live="polite">${escapeHtml(landingMessage)}</div>
      <button id="landing-submit" class="landing-submit" type="submit">${signup ? "Créer mon compte" : `Se connecter comme ${teacher ? "professeur" : "élève"}`}</button>
    </form>
    ${teacher
      ? '<div class="teacher-access-note"><span aria-hidden="true">🔒</span><span>Accès réservé au compte autorisé par l’établissement.</span></div>'
      : `<div class="landing-links">
          ${!signup ? '<button type="button" onclick="landingResetPassword()">Mot de passe oublié ?</button>' : ""}
          <button type="button" onclick="toggleLandingMode()">${signup ? "Déjà inscrit ? Se connecter" : "Pas encore de compte ? S’inscrire"}</button>
        </div>`}`;

  document.getElementById("landing-auth-form")?.addEventListener("submit", window.landingSubmit);
}

function showLanding(visible) {
  ensureLandingUI();
  const landing = document.getElementById("auth-landing");
  landing?.classList.toggle("is-hidden", !visible);
  document.body.classList.toggle("auth-gated", visible);
  const header = document.querySelector("header");
  const main = document.querySelector("main");
  if (header) {
    header.inert = visible;
    header.setAttribute("aria-hidden", String(visible));
  }
  if (main) {
    main.inert = visible;
    main.setAttribute("aria-hidden", String(visible));
  }
  if (visible) {
    renderLanding();
    requestAnimationFrame(() => document.getElementById("landing-email")?.focus());
  }
}

window.setLandingAudience = function setLandingAudience(audience) {
  landingAudience = audience === "teacher" ? "teacher" : "student";
  if (landingAudience === "teacher") landingMode = "login";
  landingMessage = "";
  landingMessageOk = false;
  renderLanding();
  document.getElementById("landing-email")?.focus();
};

window.toggleLandingMode = function toggleLandingMode() {
  landingMode = landingMode === "login" ? "signup" : "login";
  landingMessage = "";
  landingMessageOk = false;
  renderLanding();
  document.getElementById("landing-email")?.focus();
};

window.landingResetPassword = async function landingResetPassword() {
  const email = document.getElementById("landing-email")?.value.trim() || "";
  if (!email) {
    setLandingMessage("Entre d’abord ton adresse e-mail.");
    document.getElementById("landing-email")?.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setLandingMessage("E-mail de réinitialisation envoyé.", true);
  } catch (error) {
    setLandingMessage(friendlyAuthError(error));
  }
};

window.landingSubmit = async function landingSubmit(event) {
  event?.preventDefault?.();
  const email = document.getElementById("landing-email")?.value.trim() || "";
  const password = document.getElementById("landing-password")?.value || "";
  if (!email || !password) {
    setLandingMessage("Renseigne ton e-mail et ton mot de passe.");
    return;
  }
  const button = document.getElementById("landing-submit");
  if (button) {
    button.disabled = true;
    button.textContent = landingMode === "signup" ? "Création…" : "Connexion…";
  }
  setLandingMessage("");
  try {
    if (landingAudience === "student" && landingMode === "signup") {
      signupInProgress = true;
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);
      await signOut(auth);
      signupInProgress = false;
      landingMode = "login";
      renderLanding();
      setLandingMessage("Compte créé. Vérifie tes e-mails, puis connecte-toi.", true);
      return;
    }
    requiredAudience = landingAudience;
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error) {
    signupInProgress = false;
    requiredAudience = null;
    setLandingMessage(friendlyAuthError(error));
    if (button) {
      button.disabled = false;
      button.textContent = `Se connecter comme ${landingAudience === "teacher" ? "professeur" : "élève"}`;
    }
  }
};

function focusableElements(modal) {
  return [...modal.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => element.offsetParent !== null);
}

function openModal(modal, trigger) {
  if (!modal) return;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  const items = focusableElements(modal);
  if (items[0]) items[0].focus();
  if (modal.id === "acct-modal") accountTrigger = trigger;
  if (modal.id === "teacher-modal") teacherTrigger = trigger;
}

function closeModal(modal, trigger) {
  if (!modal) return;
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  trigger?.focus?.();
}

function updateAccountButton() {
  const button = document.getElementById("acct-btn");
  if (!button) return;
  button.classList.toggle("online", Boolean(currentUser));
  button.innerHTML = `<span class="acct-dot"></span>${currentUser ? "Mon compte" : "Compte"}`;
  const teacherButton = document.getElementById("teacher-btn");
  if (teacherButton) teacherButton.hidden = !isTeacher;
}

function renderAccount() {
  const body = document.getElementById("acct-body");
  if (!body) return;
  updateAccountButton();

  if (currentUser) {
    body.innerHTML = `
      <h3 id="acct-title">Mon compte</h3>
      <div class="acct-email-box">📧 ${escapeHtml(currentUser.email || "Compte connecté")}</div>
      ${isTeacher ? '<div class="role-badge">Professeur</div>' : ""}
      <div class="acct-sync" id="acct-sync" aria-live="polite"><span class="sdot"></span>Synchronisation active</div>
      <div class="acct-note">Ta progression, tes auto-évaluations, tes surlignages et tes modifications sont synchronisés avec Firebase.</div>
      <button class="acct-primary" type="button" onclick="accountSyncNow()">Synchroniser maintenant</button>
      ${isTeacher ? '<button class="acct-secondary" type="button" onclick="closeAccount(); openTeacherPanel()">Gérer les chapitres</button>' : ""}
      <button class="acct-danger" type="button" onclick="accountSignOut()">Se déconnecter</button>`;
    return;
  }

  const isLogin = accountMode === "login";
  body.innerHTML = `
    <h3 id="acct-title">${isLogin ? "Connexion" : "Créer un compte"}</h3>
    <p class="acct-sub">Connecte-toi pour synchroniser ta progression sur tous tes appareils. Sans compte, les données restent sur cet appareil.</p>
    <label class="acct-label" for="acct-email">Adresse e-mail</label>
    <input id="acct-email" type="email" inputmode="email" autocomplete="email" required>
    <label class="acct-label" for="acct-pwd">Mot de passe</label>
    <input id="acct-pwd" type="password" autocomplete="${isLogin ? "current-password" : "new-password"}" minlength="6" required>
    <div class="acct-msg" id="acct-msg" aria-live="polite"></div>
    <button class="acct-primary" id="acct-submit" type="button" onclick="accountSubmit()">${isLogin ? "Se connecter" : "Créer mon compte"}</button>
    ${isLogin ? '<button class="acct-link" type="button" onclick="accountResetPassword()">Mot de passe oublié ?</button>' : ""}
    <button class="acct-link" type="button" onclick="toggleAcctMode()">${isLogin ? "Pas encore de compte ? En créer un" : "Déjà un compte ? Se connecter"}</button>`;
}

window.openAccount = function openAccount() {
  renderAccount();
  openModal(document.getElementById("acct-modal"), document.activeElement);
};

window.closeAccount = function closeAccount() {
  closeModal(document.getElementById("acct-modal"), accountTrigger);
};

window.toggleAcctMode = function toggleAcctMode() {
  accountMode = accountMode === "login" ? "signup" : "login";
  renderAccount();
  document.getElementById("acct-email")?.focus();
};

window.accountSubmit = async function accountSubmit() {
  const email = document.getElementById("acct-email")?.value.trim() || "";
  const password = document.getElementById("acct-pwd")?.value || "";
  if (!email || !password) {
    setAccountMessage("Renseigne ton e-mail et ton mot de passe.");
    return;
  }
  const button = document.getElementById("acct-submit");
  if (button) {
    button.disabled = true;
    button.textContent = "Connexion…";
  }
  setAccountMessage("");
  try {
    if (accountMode === "login") {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      await sendEmailVerification(result.user);
      await signOut(auth);
      accountMode = "login";
      renderAccount();
      setAccountMessage("Compte créé. Vérifie maintenant tes e-mails avant de te connecter.", true);
    }
  } catch (error) {
    setAccountMessage(friendlyAuthError(error));
    if (button) {
      button.disabled = false;
      button.textContent = accountMode === "login" ? "Se connecter" : "Créer mon compte";
    }
  }
};

window.accountResetPassword = async function accountResetPassword() {
  const email = document.getElementById("acct-email")?.value.trim() || "";
  if (!email) {
    setAccountMessage("Entre d’abord ton adresse e-mail.");
    document.getElementById("acct-email")?.focus();
    return;
  }
  try {
    await sendPasswordResetEmail(auth, email);
    setAccountMessage("E-mail de réinitialisation envoyé.", true);
  } catch (error) {
    setAccountMessage(friendlyAuthError(error));
  }
};

window.accountSignOut = async function accountSignOut() {
  await signOut(auth);
  window.closeAccount();
};

async function writeState(key) {
  if (!currentUser) return;
  const value = localStorage.getItem(key) || "";
  await setDoc(doc(db, "users", currentUser.uid, "state", key), {
    value,
    updatedAt: serverTimestamp(),
  });
}

window.cloudPush = function cloudPush(key) {
  if (!currentUser || !SES_KEYS.includes(key)) return;
  clearTimeout(cloudTimers.get(key));
  cloudTimers.set(key, setTimeout(async () => {
    try {
      await writeState(key);
      setSyncStatus("Synchronisé ✓", true);
    } catch (error) {
      console.warn("Synchronisation Firebase :", error);
      setSyncStatus("Erreur de synchronisation", false);
    }
  }, 700));
};

async function pullState() {
  if (!currentUser) return;
  for (const key of SES_KEYS) {
    const snapshot = await getDoc(doc(db, "users", currentUser.uid, "state", key));
    if (snapshot.exists()) {
      localStorage.setItem(key, snapshot.data().value || "");
    } else if (localStorage.getItem(key)) {
      await writeState(key);
    }
  }
  window.reloadSESLocalState?.();
}

window.accountSyncNow = async function accountSyncNow() {
  if (!currentUser) return;
  setSyncStatus("Synchronisation…", true);
  try {
    await Promise.all(SES_KEYS.map(writeState));
    setSyncStatus("Synchronisé ✓", true);
  } catch (error) {
    console.warn("Synchronisation Firebase :", error);
    setSyncStatus("Erreur de synchronisation", false);
  }
};

async function readTeacherRole(user) {
  if (!user) return false;
  const role = await getDoc(doc(db, "roles", user.uid));
  return role.exists() && role.data().role === "teacher";
}

async function readChapters() {
  const source = isTeacher
    ? collection(db, "chapters")
    : query(collection(db, "chapters"), where("released", "==", true));
  const snapshot = await getDocs(source);
  return snapshot.docs
    .map((chapterSnapshot) => ({
      ...chapterSnapshot.data(),
      _firestoreId: chapterSnapshot.id,
    }))
    .filter((chapter) => Number.isFinite(chapter.id))
    .sort((a, b) => a.id - b.id);
}

function ensureTeacherUI() {
  if (!document.getElementById("teacher-btn")) {
    const button = document.createElement("button");
    button.id = "teacher-btn";
    button.className = "acct-btn teacher-btn";
    button.type = "button";
    button.hidden = true;
    button.innerHTML = '<span aria-hidden="true">🎓</span> Professeur';
    button.addEventListener("click", window.openTeacherPanel);
    document.getElementById("acct-btn")?.after(button);
  }

  if (!document.getElementById("teacher-modal")) {
    const modal = document.createElement("div");
    modal.id = "teacher-modal";
    modal.className = "acct-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-hidden", "true");
    modal.setAttribute("aria-labelledby", "teacher-title");
    modal.innerHTML = `
      <div class="acct-card teacher-card">
        <button class="acct-close" type="button" onclick="closeTeacherPanel()" aria-label="Fermer le panneau professeur">✕</button>
        <div id="teacher-body"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) window.closeTeacherPanel();
    });
  }
}

function renderTeacherPanel() {
  const body = document.getElementById("teacher-body");
  if (!body) return;
  const releasedThrough = chapters.filter((chapter) => chapter.released).reduce((max, chapter) => Math.max(max, chapter.id), 0);
  body.innerHTML = `
    <div class="teacher-heading">
      <div>
        <span class="teacher-kicker">Espace professeur</span>
        <h3 id="teacher-title">Publication des chapitres</h3>
      </div>
      <span class="role-badge">${releasedThrough}/9 publiés</span>
    </div>
    <p class="acct-sub">Publie les chapitres au fil de l’année. La progression reste séquentielle : publier un chapitre publie aussi tous les précédents.</p>
    <div class="teacher-status" role="status" aria-live="polite" id="teacher-status"></div>
    ${chapters.length ? `<div class="release-list">${chapters.map((chapter) => {
      const released = Boolean(chapter.released);
      return `<button type="button" class="release-row ${released ? "released" : "locked"}" aria-pressed="${released}" onclick="teacherPublishThrough(${released ? chapter.id - 1 : chapter.id})">
        <span class="release-number">${chapter.id}</span>
        <span class="release-copy"><strong>Chapitre ${chapter.id}</strong><small>${escapeHtml(chapter.title)}</small></span>
        <span class="release-state">${released ? "Publié" : "Verrouillé"}</span>
      </button>`;
    }).join("")}</div>` : '<div class="teacher-empty"><strong>Aucun chapitre importé.</strong><br>Utilise l’outil local d’import initial fourni avec le projet.</div>'}
    <p class="teacher-help">Cliquer sur un chapitre publié le reverrouille, ainsi que les chapitres suivants.</p>`;
}

window.openTeacherPanel = function openTeacherPanel() {
  if (!isTeacher) return;
  renderTeacherPanel();
  openModal(document.getElementById("teacher-modal"), document.activeElement);
};

window.closeTeacherPanel = function closeTeacherPanel() {
  closeModal(document.getElementById("teacher-modal"), teacherTrigger);
};

window.teacherPublishThrough = async function teacherPublishThrough(chapterId) {
  if (!isTeacher || !currentUser) return;
  const status = document.getElementById("teacher-status");
  const controls = [...document.querySelectorAll("#teacher-body .release-row")];
  controls.forEach((control) => { control.disabled = true; });
  if (status) status.textContent = "Publication en cours…";
  try {
    const roleStillValid = await readTeacherRole(currentUser);
    if (!roleStillValid) {
      isTeacher = false;
      updateAccountButton();
      const roleError = new Error("Le rôle professeur n’est plus attribué à ce compte.");
      roleError.code = "ses/teacher-role-missing";
      throw roleError;
    }

    const changedChapters = chapters.filter(
      (chapter) => Boolean(chapter.released) !== (chapter.id <= chapterId),
    );
    if (!changedChapters.length) {
      if (status) status.textContent = "Les chapitres sont déjà configurés ainsi.";
      return;
    }

    const batch = writeBatch(db);
    changedChapters.forEach((chapter) => {
      batch.update(doc(db, "chapters", chapter._firestoreId || String(chapter.id)), {
        released: chapter.id <= chapterId,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
    chapters = await readChapters();
    window.replaceSESChapters?.(chapters);
    renderTeacherPanel();
    const freshStatus = document.getElementById("teacher-status");
    if (freshStatus) freshStatus.textContent = chapterId > 0 ? `Chapitres 1 à ${chapterId} publiés.` : "Tous les chapitres sont verrouillés.";
  } catch (error) {
    console.error("Publication Firebase :", error);
    if (status) {
      if (error?.code === "ses/teacher-role-missing") {
        status.textContent = "Rôle professeur introuvable. Vérifie le nouvel UID dans roles.";
      } else if (error?.code === "permission-denied") {
        status.textContent = "Firestore refuse la publication. Redéploie firestore.rules et vérifie roles/{UID}.role = teacher.";
      } else if (error?.code === "not-found") {
        status.textContent = "Un document de chapitre est introuvable dans Firestore.";
      } else {
        status.textContent = `La publication a échoué${error?.code ? ` (${error.code})` : ""}.`;
      }
    }
  } finally {
    controls.forEach((control) => { control.disabled = false; });
  }
};

async function loadPreviewIfRequested() {
  const previewMode = new URLSearchParams(location.search).get("preview");
  if (!previewMode) return null;
  if (location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return null;
  if (previewMode === "teacher") isTeacher = true;
  const module = await import("../tools/chapters-data.mjs");
  const previewChapters = module.CH.map((chapter, index) => ({ ...chapter, released: index === 0 }));
  return isTeacher ? previewChapters : previewChapters.filter((chapter) => chapter.released);
}

function initializeModalAccessibility() {
  const accountModal = document.getElementById("acct-modal");
  accountModal?.setAttribute("role", "dialog");
  accountModal?.setAttribute("aria-modal", "true");
  accountModal?.setAttribute("aria-hidden", "true");
  accountModal?.setAttribute("aria-labelledby", "acct-title");

  document.addEventListener("keydown", (event) => {
    const modal = document.querySelector(".acct-modal.open");
    if (!modal) return;
    if (event.key === "Escape") {
      event.preventDefault();
      modal.id === "teacher-modal" ? window.closeTeacherPanel() : window.closeAccount();
      return;
    }
    if (event.key !== "Tab") return;
    const items = focusableElements(modal);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
}

async function refreshApplication() {
  const preview = await loadPreviewIfRequested();
  chapters = preview || await readChapters();
  window.startSESApp?.(chapters);
  appStarted = true;
  if (currentUser) await pullState();
  updateAccountButton();
  if (document.getElementById("acct-modal")?.classList.contains("open")) renderAccount();
}

ensureTeacherUI();
initializeModalAccessibility();
showLanding(true);
document.getElementById("content").innerHTML = '<div class="welcome"><h1>Chargement des chapitres…</h1><p>Connexion sécurisée à Firebase.</p></div>';

onAuthStateChanged(auth, async (user) => {
  const previewMode = new URLSearchParams(location.search).get("preview");
  const previousUid = currentUser?.uid || null;
  currentUser = user;
  try {
    isTeacher = await readTeacherRole(user);
    if (user && signupInProgress) return;
    if (user && requiredAudience === "teacher" && !isTeacher) {
      requiredAudience = null;
      landingMessage = "Ce compte n’a pas le rôle professeur.";
      landingMessageOk = false;
      currentUser = null;
      await signOut(auth);
      showLanding(true);
      return;
    }
    requiredAudience = null;
    if (!user && previousUid) {
      SES_KEYS.forEach((key) => localStorage.removeItem(key));
      window.reloadSESLocalState?.();
    }
    if (!user && !previewMode) {
      showLanding(true);
      updateAccountButton();
      return;
    }
    showLanding(false);
    await refreshApplication();
    if (user) window.closeAccount();
  } catch (error) {
    console.error("Initialisation Firebase :", error);
    if (!appStarted) window.startSESApp?.([]);
    const content = document.getElementById("content");
    if (content) content.innerHTML = '<div class="welcome"><h1>Configuration Firebase incomplète.</h1><p>Vérifie que Firestore est créé, que les règles sont publiées et que les chapitres ont été importés.</p></div>';
  } finally {
    updateAccountButton();
  }
});
