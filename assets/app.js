// assets/app.js
/**
 * Prompt Library App – Refactored & Optimized (2026 edition)
 * - Single responsibility principle
 * - Clear separation of concerns (config, state, auth, data, ui, events)
 * - Reduced global pollution
 * - Better error handling & loading states
 * - More maintainable & scalable structure
 * - No logic duplication
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
    showToast,
    copyToClipboard,
    renderPrompts,
    applySearchFilter,
    openModalCreate,
    openModalEdit,
    closeModal,
} from "./ui.js";

// ========================= CONFIG =========================
const CONFIG = {
    SUPABASE_URL: "https://nwzoeapjzsugdtohcfyx.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_TsL3PRhhpmnVjme70W7wwg_cC4lWs8K",
    ADMIN_UID: "154151c6-65f5-45b6-8169-378d14c1ba94",
};

// ========================= STATE =========================
const state = {
    supabase: createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY),
    user: null,
    isAdmin: false,
    userPlan: "free",
    prompts: [], // current filtered list
    defaultPrompts: [], // original order snapshot for fallback sort
    editingId: null,
    originalPromptSnapshot: null,
    copyScore: new Map(), // session-only popularity
    lastCopiedAt: new Map(),
    authRefreshing: false,
};

// ========================= DOM CACHE =========================
const dom = {
    grid: document.getElementById("grid"),
    emptyState: document.getElementById("emptyState"),
    toast: document.getElementById("toast"),
    searchBar: document.getElementById("searchBar"),
    planBadge: document.getElementById("planBadge"),
    searchInput: document.getElementById("searchInput"),
    filterType: document.getElementById("filterType"),
    btnLogin: document.getElementById("btnLogin"),
    btnLogout: document.getElementById("btnLogout"),
    btnShowLogin: document.getElementById("btnShowLogin"),
    btnNew: document.getElementById("btnNew"),
    loginModal: document.getElementById("loginModal"),
    loginOverlay: document.getElementById("loginOverlay"),
    loginBox: document.getElementById("loginBox"),
    closeLoginModal: document.getElementById("closeLoginModal"),
    modal: document.getElementById("modal"),
    modalHeading: document.getElementById("modalHeading"),
    modalTitle: document.getElementById("modalTitle"),
    modalType: document.getElementById("modalType"),
    modalText: document.getElementById("modalText"),
    saveModal: document.getElementById("saveModal"),
    closeModal: document.getElementById("closeModal"),
    cancelModal: document.getElementById("cancelModal"),
    viewModal: document.getElementById("viewModal"),
    viewTitle: document.getElementById("viewTitle"),
    viewContent: document.getElementById("viewContent"),
    closeViewModal: document.getElementById("closeViewModal"),
    btnTop: document.getElementById("btnTop"),
    pricingSection: document.getElementById("pricingSection"),
    loginForm: document.getElementById("loginForm"),
    emailInput: document.getElementById("email"),
    passwordInput: document.getElementById("password"),
};

// ========================= DATA LAYER =========================
async function loadPrompts() {
    let query;

    // 🔓 Ultimate & Admin: realtime
    if (state.isAdmin || state.userPlan === "ultimate") {
        query = state.supabase
            .from("prompts")
            .select("*")
            .order("updated_at", { ascending: false });
    }
    // 🧊 Pro: bản cứng
    else if (state.userPlan === "pro") {
        query = state.supabase
            .from("prompts_copy")
            .select("*")
            .eq("user_id", state.user.id)
            .order("original_created_at", { ascending: false });
    }
    // 🆓 Free: không load
    else {
        state.prompts = [];
        renderPrompts({
            gridEl: dom.grid,
            emptyStateEl: dom.emptyState,
            list: [],
            isAdmin: false,
        });
        return;
    }

    const { data, error } = await query;

    if (error) {
        console.error("loadPrompts error:", error);
        showToast(dom.toast, "Failed to load prompts");
        return;
    }

    state.prompts = data || [];
    state.defaultPrompts = [...state.prompts];

    renderPrompts({
        gridEl: dom.grid,
        emptyStateEl: dom.emptyState,
        list: getSortedPrompts(),
        isAdmin: state.isAdmin,
    });

    applySearchFilter({
        searchInputEl: dom.searchInput,
        filterTypeEl: dom.filterType,
    });
}

function getSortedPrompts() {
    const orderIndex = new Map(state.defaultPrompts.map((p, i) => [p.id, i]));

    return [...state.prompts].sort((a, b) => {
        const scoreA = state.copyScore.get(a.id) || 0;
        const scoreB = state.copyScore.get(b.id) || 0;
        if (scoreB !== scoreA) return scoreB - scoreA;

        const timeA = state.lastCopiedAt.get(a.id) || 0;
        const timeB = state.lastCopiedAt.get(b.id) || 0;
        if (timeB !== timeA) return timeB - timeA;

        return (
            (orderIndex.get(a.id) ?? 999999) - (orderIndex.get(b.id) ?? 999999)
        );
    });
}

// ========================= AUTH LAYER =========================
async function refreshAuthUI() {
    if (state.authRefreshing) return;
    state.authRefreshing = true;

    try {
        const {
            data: { session },
            error: sessionError,
        } = await state.supabase.auth.getSession();
        if (sessionError) throw sessionError;

        state.user = session?.user ?? null;

        // Guest
        if (!state.user) {
            resetGuestUI();
            return;
        }

        // Logged-in
        await handleLoggedInUser();
    } catch (err) {
        console.error("Auth error:", err);
        showToast(dom.toast, "Auth service unavailable");
    } finally {
        state.authRefreshing = false;
    }
}

function resetGuestUI() {
    state.isAdmin = false;
    state.userPlan = "free";
    dom.btnShowLogin.classList.remove("hidden");
    dom.btnLogout.classList.add("hidden");
    dom.btnNew.classList.add("hidden");
    dom.planBadge?.classList.add("hidden");
    dom.pricingSection.classList.remove("hidden");
    dom.searchBar.classList.add("hidden");
    dom.grid.innerHTML = "";
}

async function handleLoggedInUser() {
    dom.btnShowLogin.classList.add("hidden");
    dom.btnLogout.classList.remove("hidden");

    const { data: profile, error } = await state.supabase
        .from("profiles")
        .select("plan, role")
        .eq("id", state.user.id)
        .maybeSingle();

    // ---- SET STATE TRƯỚC ----
    if (error || !profile) {
        state.userPlan = "free";
        state.isAdmin = false;
        showToast(dom.toast, "Profile not found, treated as Free");
    } else {
        state.userPlan = profile.plan || "free";
        state.isAdmin = profile.role === "admin";
    }

    // ---- PLAN BADGE ----
    dom.planBadge.classList.add("hidden");

    if (!state.isAdmin) {
        if (state.userPlan === "free") {
            dom.planBadge.textContent = "Free";
            dom.planBadge.className =
                "inline-flex items-center rounded-md bg-slate-100 px-2 py-1 text-sm font-medium text-slate-600 inset-ring inset-ring-slate-600/10";
            dom.planBadge.classList.remove("hidden");
        } else if (state.userPlan === "pro") {
            dom.planBadge.textContent = "Pro";
            dom.planBadge.className =
                "inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-sm font-medium text-blue-700 inset-ring inset-ring-blue-700/10";
            dom.planBadge.classList.remove("hidden");
        } else if (state.userPlan === "ultimate") {
            dom.planBadge.textContent = "Ultimate";
            dom.planBadge.className =
                "inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-700 inset-ring inset-ring-emerald-700/10";
            dom.planBadge.classList.remove("hidden");
        }
    }

    // ---- ADMIN UI ----
    dom.btnNew.classList.toggle("hidden", !state.isAdmin);

    if (state.userPlan === "free") {
        dom.pricingSection.classList.remove("hidden");
        dom.grid.innerHTML = "";
        return;
    }

    dom.searchBar.classList.remove("hidden");
    dom.pricingSection.classList.add("hidden");
    await loadPrompts();
}

// ========================= UI EVENT HANDLERS =========================
function setupEventListeners() {
    // Login
    dom.btnShowLogin.addEventListener("click", showLoginModal);
    dom.closeLoginModal.addEventListener("click", closeLoginModal);
    dom.loginModal.addEventListener(
        "click",
        (e) => e.target === dom.loginModal && closeLoginModal(),
    );
    dom.loginForm?.addEventListener("submit", (e) => {
        e.preventDefault();
        dom.btnLogin.click();
    });
    dom.btnLogin.addEventListener("click", handleLogin);

    // Logout
    dom.btnLogout.addEventListener("click", handleLogout);

    // New prompt (admin)
    dom.btnNew.addEventListener("click", () => {
        if (!state.isAdmin)
            return showToast(dom.toast, "Only admin can create prompts");
        state.editingId = null;
        state.originalPromptSnapshot = null;
        openModalCreate({
            modalEl: dom.modal,
            headingEl: dom.modalHeading,
            titleEl: dom.modalTitle,
            typeEl: dom.modalType,
            textEl: dom.modalText,
        });
        document.body.style.overflow = "hidden";
    });

    // Card actions (delegated)
    dom.grid.addEventListener("click", handleCardAction);

    // Modal
    dom.closeModal.addEventListener("click", closePromptModal);
    dom.cancelModal.addEventListener("click", closePromptModal);
    dom.modal.addEventListener(
        "click",
        (e) => e.target === dom.modal && closePromptModal(),
    );
    dom.saveModal.addEventListener("click", handleSavePrompt);

    // View modal
    dom.closeViewModal.addEventListener("click", () => {
        dom.viewModal.classList.add("hidden");
        document.body.style.overflow = "auto";
    });
    dom.viewModal.addEventListener(
        "click",
        (e) =>
            e.target === dom.viewModal && dom.viewModal.classList.add("hidden"),
    );

    // Search
    dom.searchInput.addEventListener("input", () =>
        applySearchFilter({
            searchInputEl: dom.searchInput,
            filterTypeEl: dom.filterType,
        }),
    );
    dom.filterType.addEventListener("change", () =>
        applySearchFilter({
            searchInputEl: dom.searchInput,
            filterTypeEl: dom.filterType,
        }),
    );

    // Scroll to top
    window.addEventListener("scroll", () =>
        dom.btnTop.classList.toggle("hidden", window.scrollY < 300),
    );
}

async function handleLogin() {
    const email = dom.emailInput.value.trim();
    const password = dom.passwordInput.value;

    if (!email || !password)
        return showToast(dom.toast, "Please enter email & password");

    const { error } = await state.supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        showToast(
            dom.toast,
            error.message.includes("Invalid login")
                ? "❌ Wrong email or password"
                : "Login failed",
        );
        return;
    }

    showToast(dom.toast, "Logged in ✅");
    closeLoginModal();
    await state.supabase.auth.refreshSession();
    await refreshAuthUI();
}

async function handleLogout() {
    await state.supabase.auth.signOut();
    showToast(dom.toast, "Logged out");
    await refreshAuthUI();
}

function showLoginModal() {
    dom.loginModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => {
        dom.loginOverlay.classList.remove("opacity-0");
        dom.loginBox.classList.remove("opacity-0", "scale-95", "translate-y-6");
    });
}

function closeLoginModal() {
    dom.loginOverlay.classList.add("opacity-0");
    dom.loginBox.classList.add("opacity-0", "scale-95", "translate-y-6");
    setTimeout(() => {
        dom.loginModal.classList.add("hidden");
        document.body.style.overflow = "auto";
    }, 300);
}

function closePromptModal() {
    closeModal(dom.modal);
    document.body.style.overflow = "auto";
}

async function handleSavePrompt() {
    if (!state.isAdmin) return showToast(dom.toast, "Only admin");

    const title = dom.modalTitle.value.trim();
    const type = dom.modalType.value;
    const prompt_text = dom.modalText.value.trim();

    if (state.editingId && state.originalPromptSnapshot) {
        const noChange =
            title === state.originalPromptSnapshot.title &&
            type === state.originalPromptSnapshot.type &&
            prompt_text === state.originalPromptSnapshot.prompt_text;

        if (noChange) return showToast(dom.toast, "No changes to save");
    }

    if (!title || !prompt_text)
        return showToast(dom.toast, "Title and prompt text are required");

    const payload = { title, type, prompt_text };

    let error;
    if (!state.editingId) {
        ({ error } = await state.supabase.from("prompts").insert(payload));
        showToast(dom.toast, error ? "Create failed" : "Created ✅");
    } else {
        ({ error } = await state.supabase
            .from("prompts")
            .update(payload)
            .eq("id", state.editingId));
        showToast(dom.toast, error ? "Update failed" : "Saved ✅");
    }

    if (!error) {
        closePromptModal();
        await loadPrompts();
    }
}

async function handleCardAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const card = e.target.closest(".prompt-card");
    if (!card) return;

    const action = btn.dataset.action;
    const id = card.dataset.id;

    if (action === "view") {
        dom.viewTitle.textContent = card.dataset.title || "Prompt";
        dom.viewContent.textContent = card.dataset.text || "";
        dom.viewModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
        return;
    }

    if (action === "copy") {
        if (state.userPlan === "free") {
            showToast(
                dom.toast,
                "Gói Free không hỗ trợ copy. Nâng cấp Pro hoặc ultimate nhé!",
            );
            return;
        }
        try {
            await copyToClipboard(card.dataset.text || "");
            showToast(dom.toast, "Copied ✅");

            state.copyScore.set(id, (state.copyScore.get(id) || 0) + 1);
            state.lastCopiedAt.set(id, Date.now());

            renderPrompts({
                gridEl: dom.grid,
                emptyStateEl: dom.emptyState,
                list: getSortedPrompts(),
                isAdmin: state.isAdmin,
            });
            applySearchFilter({
                searchInputEl: dom.searchInput,
                filterTypeEl: dom.filterType,
            });
        } catch {
            showToast(dom.toast, "Copy failed");
        }
        return;
    }

    if (!state.isAdmin) return showToast(dom.toast, "Only admin");

    if (action === "edit") {
        const prompt = state.prompts.find((p) => p.id === id);
        if (!prompt) return;

        state.editingId = id;
        state.originalPromptSnapshot = {
            title: prompt.title ?? "",
            type: prompt.type ?? "",
            prompt_text: prompt.prompt_text ?? "",
        };

        openModalEdit({
            modalEl: dom.modal,
            headingEl: dom.modalHeading,
            titleEl: dom.modalTitle,
            typeEl: dom.modalType,
            textEl: dom.modalText,
            prompt,
        });
        document.body.style.overflow = "hidden";
    }

    if (action === "delete") {
        if (!confirm("Delete this prompt?")) return;
        const { error } = await state.supabase
            .from("prompts")
            .delete()
            .eq("id", id);
        if (!error) {
            showToast(dom.toast, "Removed ✅");
            await loadPrompts();
        }
    }
}

// ========================= INIT =========================
async function init() {
    setupEventListeners();
    await refreshAuthUI();

    state.supabase.auth.onAuthStateChange((event) => {
        if (["SIGNED_IN", "SIGNED_OUT"].includes(event)) refreshAuthUI();
    });
}

init();
