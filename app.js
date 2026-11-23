// Firebase modular SDK (v10+) and Chart.js are loaded from their official CDNs.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, signOut
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, addDoc, deleteDoc, doc, onSnapshot,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// 1) Replace these placeholders with your Firebase project's web app config.
// Firebase Console > Project settings > General > Your apps > Web app.
// Never commit real credentials to a public repository. Also configure Firestore Rules.
const firebaseConfig = {
  apiKey: "AIzaSyCGfOA2C_JmgR8JNx1ZfUL3DzAi3vyzb1s",
  authDomain: "finan-30bff.firebaseapp.com",
  projectId: "finan-30bff",
  storageBucket: "finan-30bff.firebasestorage.app",
  messagingSenderId: "453537332072",
  appId: "1:453537332072:web:9958aaeb59e26d242b34dd"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();

const $ = (id) => document.getElementById(id);
const authView = $("authView");
const appView = $("appView");
const loginForm = $("loginForm");
const loginButton = $("loginButton");
const googleButton = $("googleButton");
const authError = $("authError");
const modeToggle = $("modeToggle");
let isCreatingAccount = false;
let unsubscribeTransactions = null;
let transactions = [];
let expenseChart = null;
let flowChart = null;
let currency = "IDR";
let usdRate = 0.000064; // Illustrative display conversion only; update with a trusted live FX source if needed.

const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const money = (amount) => currency === "IDR" ? `IDR ${idr.format(amount)}` : usd.format(amount * usdRate);
const dateToday = new Date().toISOString().slice(0, 10);

$("txDate").value = dateToday;
$("monthFilter").value = dateToday.slice(0, 7);

function setAuthBusy(busy) {
  loginButton.disabled = busy;
  googleButton.disabled = busy;
  loginButton.innerHTML = busy ? "PLEASE WAIT…" : `${isCreatingAccount ? "CREATE ACCOUNT" : "SIGN IN"} <span>↗</span>`;
}
function showAuthError(error) {
  const messages = {
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "That email is already registered. Sign in instead.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/popup-closed-by-user": "Google sign-in was closed before completion.",
    "auth/unauthorized-domain": "This domain is not authorized in Firebase Authentication."
  };
  authError.textContent = messages[error.code] || error.message || "Authentication failed. Please try again.";
}
modeToggle.addEventListener("click", () => {
  isCreatingAccount = !isCreatingAccount;
  $("authError").textContent = "";
  modeToggle.textContent = isCreatingAccount ? "BACK TO SIGN IN" : "CREATE ACCOUNT";
  setAuthBusy(false);
});
loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authError.textContent = "";
  setAuthBusy(true);
  try {
    const email = $("email").value.trim();
    const password = $("password").value;
    if (isCreatingAccount) await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
  } catch (error) { showAuthError(error); }
  finally { setAuthBusy(false); }
});
googleButton.addEventListener("click", async () => {
  authError.textContent = "";
  setAuthBusy(true);
  try { await signInWithPopup(auth, googleProvider); }
  catch (error) { showAuthError(error); }
  finally { setAuthBusy(false); }
});
$("logoutButton").addEventListener("click", () => signOut(auth));

function setView(user) {
  // Explicitly isolate the two DOM trees. Hidden auth markup cannot overlap dashboard.
  if (user) {
    authView.hidden = true;
    authView.setAttribute("aria-hidden", "true");
    appView.hidden = false;
    appView.removeAttribute("aria-hidden");
    $("userLabel").textContent = user.email || "SIGNED IN";
    $("chapterLabel").textContent = "CHAPTER 01 // LEDGER";
  } else {
    if (unsubscribeTransactions) unsubscribeTransactions();
    unsubscribeTransactions = null;
    transactions = [];
    appView.hidden = true;
    appView.setAttribute("aria-hidden", "true");
    authView.hidden = false;
    authView.removeAttribute("aria-hidden");
    authError.textContent = "";
    renderAll();
  }
}

onAuthStateChanged(auth, (user) => {
  setView(user);
  if (user) subscribeToTransactions(user.uid);
});

function subscribeToTransactions(uid) {
  if (unsubscribeTransactions) unsubscribeTransactions();
  const txRef = collection(db, "users", uid, "transactions");
  const txQuery = query(txRef, orderBy("date", "desc"));
  unsubscribeTransactions = onSnapshot(txQuery, (snapshot) => {
    transactions = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  }, (error) => {
    $("formMessage").textContent = `Firestore: ${error.message}`;
    $("formMessage").classList.add("error");
  });
}

$("transactionForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const user = auth.currentUser;
  if (!user) return;
  const amount = Number($("txAmount").value);
  if (!Number.isFinite(amount) || amount <= 0) {
    setFormMessage("Enter an amount greater than zero.", true); return;
  }
  const button = $("saveButton");
  button.disabled = true;
  setFormMessage("SAVING TO CLOUD…");
  try {
    await addDoc(collection(db, "users", user.uid, "transactions"), {
      date: $("txDate").value,
      type: $("txType").value,
      category: $("txCategory").value,
      amount: Math.round(amount),
      note: $("txNote").value.trim(),
      createdAt: serverTimestamp()
    });
    $("transactionForm").reset();
    $("txDate").value = new Date().toISOString().slice(0, 10);
    setFormMessage("TRANSACTION SAVED.");
  } catch (error) { setFormMessage(error.message, true); }
  finally { button.disabled = false; }
});
function setFormMessage(message, isError = false) {
  const node = $("formMessage");
  node.textContent = message;
  node.classList.toggle("error", isError);
}

$("monthFilter").addEventListener("change", renderLedger);
$("typeFilter").addEventListener("change", renderLedger);
$("currencyToggle").addEventListener("click", () => {
  currency = currency === "IDR" ? "USD" : "IDR";
  $("currencyToggle").textContent = currency === "IDR" ? "IDR / USD" : "USD / IDR";
  renderAll();
});
$("addNav").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector(".entry-section").scrollIntoView({ behavior: "smooth" });
  $("txAmount").focus({ preventScroll: true });
});

function totals(items) {
  const income = items.filter(t => t.type === "income").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = items.filter(t => t.type === "expense").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return { income, expense, balance: income - expense };
}
function renderAll() {
  const total = totals(transactions);
  $("heroBalance").textContent = money(total.balance);
  $("totalBalance").textContent = money(total.balance);
  $("totalIncome").textContent = money(total.income);
  $("totalExpense").textContent = money(total.expense);
  $("transactionCount").textContent = String(transactions.length).padStart(3, "0");
  $("footerCount").textContent = `${String(transactions.length).padStart(3, "0")} RECORDS`;
  renderCharts();
  renderLedger();
}
function renderCharts() {
  const expenses = transactions.filter(t => t.type === "expense");
  const byCategory = {};
  expenses.forEach(t => byCategory[t.category] = (byCategory[t.category] || 0) + Number(t.amount || 0));
  const categories = Object.keys(byCategory);
  $("expenseChartEmpty").hidden = categories.length > 0;
  const chartColors = ["#c8ef83", "#d8b98a", "#9ca9bc", "#d88c7c", "#aaa5bd", "#7fa9a0", "#d7d4c9", "#727277"];
  const commonOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#aaa9a3", font: { family: "DM Mono", size: 9 }, boxWidth: 9, padding: 14 } }, tooltip: { backgroundColor: "#202024", titleColor: "#f2f0ea", bodyColor: "#f2f0ea", borderColor: "#55545a", borderWidth: 1, padding: 10, titleFont: { family: "DM Mono" }, bodyFont: { family: "DM Mono" }, callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } } } };
  if (expenseChart) expenseChart.destroy();
  expenseChart = new Chart($("expenseChart"), {
    type: "doughnut",
    data: { labels: categories, datasets: [{ data: categories.map(c => byCategory[c]), backgroundColor: chartColors, borderColor: "#111114", borderWidth: 3, hoverOffset: 7 }] },
    options: { ...commonOptions, cutout: "68%", plugins: { ...commonOptions.plugins, legend: { ...commonOptions.plugins.legend, position: "bottom" } } }
  });

  const monthKeys = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    monthKeys.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: d.toLocaleDateString("en-US", { month: "short" }).toUpperCase() });
  }
  const incomeData = monthKeys.map(m => transactions.filter(t => t.type === "income" && String(t.date || "").startsWith(m.key)).reduce((s,t) => s + Number(t.amount || 0), 0));
  const expenseData = monthKeys.map(m => transactions.filter(t => t.type === "expense" && String(t.date || "").startsWith(m.key)).reduce((s,t) => s + Number(t.amount || 0), 0));
  $("flowChartEmpty").hidden = transactions.length > 0;
  if (flowChart) flowChart.destroy();
  flowChart = new Chart($("flowChart"), {
    type: "bar",
    data: { labels: monthKeys.map(m => m.label), datasets: [
      { label: "INCOME", data: incomeData, backgroundColor: "#c8ef83", borderRadius: 2, maxBarThickness: 22 },
      { label: "EXPENSE", data: expenseData, backgroundColor: "#d88c7c", borderRadius: 2, maxBarThickness: 22 }
    ] },
    options: { ...commonOptions, scales: {
      x: { grid: { display: false }, ticks: { color: "#85847f", font: { family: "DM Mono", size: 9 } } },
      y: { beginAtZero: true, grid: { color: "rgba(242,240,234,.08)" }, ticks: { color: "#85847f", font: { family: "DM Mono", size: 8 }, callback: (value) => currency === "IDR" ? idr.format(value) : usd.format(value * usdRate) } }
    } }
  });
}
function renderLedger() {
  const month = $("monthFilter").value;
  const type = $("typeFilter").value;
  const filtered = transactions.filter(t => (!month || String(t.date || "").startsWith(month)) && (type === "all" || t.type === type));
  const summary = totals(filtered);
  $("monthlyNet").textContent = money(summary.balance);
  const list = $("transactionList");
  list.replaceChildren();
  if (!filtered.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.innerHTML = "NO MATCHING RECORDS.<br><span>CHANGE YOUR FILTER OR ADD A TRANSACTION.</span>";
    list.append(empty); return;
  }
  filtered.forEach(t => {
    const row = document.createElement("article");
    row.className = "transaction-row";
    const main = document.createElement("div"); main.className = "tx-main";
    const date = document.createElement("div"); date.className = "tx-date"; date.textContent = formatDate(t.date);
    const note = document.createElement("div"); note.className = "tx-note"; note.textContent = t.note || "—";
    const category = document.createElement("div"); category.className = "tx-category"; category.textContent = t.category || "OTHER";
    main.append(date, note, category);
    const badge = document.createElement("span"); badge.className = `type-badge ${t.type}`; badge.textContent = t.type === "income" ? "IN" : "OUT";
    const amount = document.createElement("span"); amount.className = "tx-amount"; amount.textContent = `${t.type === "income" ? "+" : "−"}${money(Number(t.amount || 0))}`;
    const del = document.createElement("button"); del.className = "delete-button"; del.type = "button"; del.textContent = "×"; del.setAttribute("aria-label", `Delete ${t.note || "transaction"}`);
    del.addEventListener("click", async () => {
      if (!confirm("Delete this transaction permanently?")) return;
      const user = auth.currentUser;
      if (!user) return;
      try { await deleteDoc(doc(db, "users", user.uid, "transactions", t.id)); }
      catch (error) { alert(`Could not delete transaction: ${error.message}`); }
    });
    row.append(main, badge, amount, del);
    list.append(row);
  });
}
function formatDate(value) {
  if (!value) return "DATE UNKNOWN";
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
}

// Section indicator follows scroll position without requiring a framework.
const sectionObserver = new IntersectionObserver((entries) => {
  const visible = entries.filter(e => e.isIntersecting).sort((a,b) => b.intersectionRatio - a.intersectionRatio)[0];
  if (!visible) return;
  document.querySelectorAll(".side-link").forEach(link => link.classList.toggle("active", link.getAttribute("href") === `#${visible.target.id}`));
  $("chapterLabel").textContent = visible.target.id === "analytics" ? "CHAPTER 02 // ANALYSIS" : visible.target.id === "ledger" ? "CHAPTER 04 // RECORDS" : "CHAPTER 01 // LEDGER";
}, { threshold: [0.15, 0.35, 0.6] });
["overview", "analytics", "ledger"].forEach(id => sectionObserver.observe($(id)));

// Chart.js is loaded synchronously from the CDN before this ES module in index.html.
if (typeof Chart === "undefined") {
  console.error("Chart.js did not load. Check your internet connection or CDN access.");
}
