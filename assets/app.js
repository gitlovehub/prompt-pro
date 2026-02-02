// assets/app.js
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

// ===== CONFIG =====
const SUPABASE_URL = "https://nwzoeapjzsugdtohcfyx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_TsL3PRhhpmnVjme70W7wwg_cC4lWs8K";
const ADMIN_UID = "154151c6-65f5-45b6-8169-378d14c1ba94";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== DOM =====
const gridEl = document.getElementById("grid");
const emptyStateEl = document.getElementById("emptyState");
const toastEl = document.getElementById("toast");

const searchInputEl = document.getElementById("searchInput");
const filterTypeEl = document.getElementById("filterType");

const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const btnShowLogin = document.getElementById("btnShowLogin");
const btnNew = document.getElementById("btnNew");
const loginForm = document.getElementById("loginForm");

const emailEl = document.getElementById("email");
const passEl = document.getElementById("password");

const modalEl = document.getElementById("modal");
const modalHeadingEl = document.getElementById("modalHeading");
const modalTitleEl = document.getElementById("modalTitle");
const modalTypeEl = document.getElementById("modalType");
const modalTextEl = document.getElementById("modalText");
const saveModalBtn = document.getElementById("saveModal");
const closeModalBtn = document.getElementById("closeModal");
const cancelModalBtn = document.getElementById("cancelModal");

const viewModal = document.getElementById("viewModal");
const viewTitle = document.getElementById("viewTitle");
const viewContent = document.getElementById("viewContent");
const closeViewModal = document.getElementById("closeViewModal");

const loginModal = document.getElementById("loginModal");
const loginOverlay = document.getElementById("loginOverlay");
const loginBox = document.getElementById("loginBox");
const closeLoginModal = document.getElementById("closeLoginModal");
const btnTop = document.getElementById("btnTop");
const pricingSection = document.getElementById("pricingSection");

// ===== STATE =====
let sessionUser = null;
let isAdmin = false;
let prompts = [];
let editingId = null;
let originalPromptSnapshot = null;

const lastCopiedAt = new Map(); // key: promptId, value: number (timestamp)
const copyScore = new Map(); // key: promptId, value: number
let defaultPrompts = []; // lưu list gốc theo DB

// ===== LOAD PROMPTS =====
async function loadPrompts() {
    const { data, error } = await supabase
        .from("prompts")
        .select("*")
        .order("updated_at", { ascending: false });

    if (error) {
        console.error(error);
        showToast(toastEl, "Load failed");
        return;
    }

    prompts = data || [];
    defaultPrompts = [...prompts]; // ✅ snapshot đúng lúc load

    renderPrompts({ gridEl, emptyStateEl, list: getSortedPrompts(), isAdmin });
    applySearchFilter({ searchInputEl, filterTypeEl });
}

function getSortedPrompts() {
    const orderIndex = new Map(defaultPrompts.map((p, i) => [p.id, i]));

    return [...prompts].sort((a, b) => {
        const sa = copyScore.get(a.id) || 0;
        const sb = copyScore.get(b.id) || 0;

        // 1) điểm copy cao hơn lên trước
        if (sb !== sa) return sb - sa;

        // 2) nếu điểm bằng nhau, cái copy gần nhất lên trước
        const ta = lastCopiedAt.get(a.id) || 0;
        const tb = lastCopiedAt.get(b.id) || 0;
        if (tb !== ta) return tb - ta;

        // 3) nếu vẫn bằng, giữ theo thứ tự mặc định khi load
        return (
            (orderIndex.get(a.id) ?? 999999) - (orderIndex.get(b.id) ?? 999999)
        );
    });
}

// ===== AUTH UI =====
async function refreshAuthUI() {
    const {
        data: { session },
    } = await supabase.auth.getSession();

    sessionUser = session?.user ?? null;

    // ===== GUEST =====
    if (!sessionUser) {
        isAdmin = false;

        btnShowLogin.classList.remove("hidden");
        btnLogout.classList.add("hidden");
        btnNew.classList.add("hidden");

        pricingSection.classList.remove("hidden");
        gridEl.innerHTML = ""; // không load prompt

        return;
    }

    // ===== LOGGED IN =====
    isAdmin = sessionUser.id === ADMIN_UID;

    btnShowLogin.classList.add("hidden");
    btnLogout.classList.remove("hidden");

    // 👉 ADMIN thì vẫn thấy nút New
    btnNew.classList.toggle("hidden", !isAdmin);

    // ===== LẤY QUYỀN USER =====
    const { data: profile } = await supabase
        .from("profiles")
        .select("plan, role")
        .eq("id", sessionUser.id)
        .maybeSingle();

    // ===== ADMIN BYPASS =====
    if (profile?.role === "admin") {
        pricingSection.classList.add("hidden");
        await loadPrompts();
        return;
    }

    // ===== KHÓA NỘI DUNG =====
    if (!profile || profile.plan === "free") {
        pricingSection.classList.remove("hidden");
        gridEl.innerHTML = "";
        btnNew.classList.add("hidden");
        return;
    }

    // ===== ĐƯỢC PHÉP XEM PROMPT =====
    pricingSection.classList.add("hidden");
    await loadPrompts();
}

// ===== EVENTS =====
loginForm?.addEventListener("submit", async (e) => {
    e.preventDefault();
    btnLogin.click();
});

btnShowLogin.addEventListener("click", () => {
    loginModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
        loginOverlay.classList.remove("opacity-0");
        loginBox.classList.remove("opacity-0", "scale-95", "translate-y-6");
    });
});

btnLogin.addEventListener("click", async () => {
    const email = emailEl.value.trim();
    const password = passEl.value;

    if (!email || !password) {
        return showToast(toastEl, "Nhập email & password");
    }

    const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
    });
    if (error) {
        console.error(error);
        return showToast(toastEl, "Login failed");
    }

    showToast(toastEl, "Logged in ✅");
    closeLogin();
    await refreshAuthUI();
});

btnLogout.addEventListener("click", async () => {
    await supabase.auth.signOut();
    showToast(toastEl, "Logged out");
    await refreshAuthUI();
    location.reload();
});

function closeLogin() {
    loginOverlay.classList.add("opacity-0");
    loginBox.classList.add("opacity-0", "scale-95", "translate-y-6");

    setTimeout(() => {
        loginModal.classList.add("hidden");
        document.body.style.overflow = "auto";
    }, 300);
}

closeLoginModal.addEventListener("click", closeLogin);
loginModal.addEventListener("click", (e) => {
    if (e.target === loginModal) closeLogin();
});

closeViewModal.addEventListener("click", () => {
    viewModal.classList.add("hidden");
    document.body.style.overflow = "auto";
});

viewModal.addEventListener("click", (e) => {
    if (e.target === viewModal) viewModal.classList.add("hidden");
});

// ===== NEW PROMPT (ADMIN) =====
btnNew.addEventListener("click", () => {
    if (!isAdmin) return showToast(toastEl, "Only admin");

    editingId = null;
    originalPromptSnapshot = null;

    openModalCreate({
        modalEl,
        headingEl: modalHeadingEl,
        titleEl: modalTitleEl,
        typeEl: modalTypeEl,
        textEl: modalTextEl,
    });
    document.body.style.overflow = "hidden";
});

// ===== CARD ACTIONS =====
gridEl.addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const card = e.target.closest(".prompt-card");
    if (!card) return;

    const action = btn.dataset.action;
    const id = card.dataset.id;

    if (action === "view") {
        viewTitle.textContent = card.dataset.title || "Prompt";
        viewContent.textContent = card.dataset.text || "";
        viewModal.classList.remove("hidden");
        document.body.style.overflow = "hidden";
        return;
    }

    // COPY (guest allowed)
    if (action === "copy") {
        try {
            await copyToClipboard(card.dataset.text || "");
            showToast(toastEl, "Copied ✅");

            // tăng điểm copy trong phiên hiện tại
            copyScore.set(id, (copyScore.get(id) || 0) + 1);
            lastCopiedAt.set(id, Date.now());

            // render lại để card nhảy lên đầu
            renderPrompts({
                gridEl,
                emptyStateEl,
                list: getSortedPrompts(),
                isAdmin,
            });
            applySearchFilter({ searchInputEl, filterTypeEl });
        } catch {
            showToast(toastEl, "Copy failed");
        }
        return;
    }

    // ADMIN CHECK
    if (!isAdmin) return showToast(toastEl, "Only admin");

    if (action === "edit") {
        const p = prompts.find((x) => x.id === id);
        if (!p) return;

        editingId = id;

        originalPromptSnapshot = {
            title: p.title ?? "",
            type: p.type ?? "",
            prompt_text: p.prompt_text ?? "",
        };

        openModalEdit({
            modalEl,
            headingEl: modalHeadingEl,
            titleEl: modalTitleEl,
            typeEl: modalTypeEl,
            textEl: modalTextEl,
            prompt: p,
        });
        document.body.style.overflow = "hidden";
    }

    if (action === "delete") {
        if (!confirm("Do you want to remove this Prompt?")) return;
        const { error } = await supabase.from("prompts").delete().eq("id", id);
        if (!error) {
            showToast(toastEl, "Removed ✅");
            await loadPrompts();
        }
    }
});

// ===== MODAL =====
closeModalBtn.addEventListener("click", () => {
    closeModal(modalEl);
    document.body.style.overflow = "auto";
});

cancelModalBtn.addEventListener("click", () => {
    closeModal(modalEl);
    document.body.style.overflow = "auto";
});

modalEl.addEventListener("click", (e) => {
    if (e.target === modalEl) {
        closeModal(modalEl);
        document.body.style.overflow = "auto";
    }
});

saveModalBtn.addEventListener("click", async () => {
    if (!isAdmin) return showToast(toastEl, "Only admin");

    const title = modalTitleEl.value.trim();
    const type = modalTypeEl.value;
    const prompt_text = modalTextEl.value.trim();

    // ===== CHECK KHÔNG CÓ THAY ĐỔI (CHỈ ÁP DỤNG KHI EDIT) =====
    if (editingId && originalPromptSnapshot) {
        const isChanged =
            title !== originalPromptSnapshot.title ||
            type !== originalPromptSnapshot.type ||
            prompt_text !== originalPromptSnapshot.prompt_text;

        if (!isChanged) {
            showToast(toastEl, "No changes to save");
            return;
        }
    }

    if (!title || !prompt_text) {
        return showToast(toastEl, "Title and prompt are required");
    }

    const payload = { title, type, prompt_text };

    if (!editingId) {
        await supabase.from("prompts").insert(payload);
        showToast(toastEl, "Created ✅");
    } else {
        await supabase.from("prompts").update(payload).eq("id", editingId);
        showToast(toastEl, "Saved ✅");
    }

    closeModal(modalEl);
    document.body.style.overflow = "auto";
    await loadPrompts();
});

window.addEventListener("scroll", () => {
    btnTop.classList.toggle("hidden", window.scrollY < 300);
});

// ===== SEARCH =====
searchInputEl.addEventListener("input", () =>
    applySearchFilter({ searchInputEl, filterTypeEl }),
);
filterTypeEl.addEventListener("change", () =>
    applySearchFilter({ searchInputEl, filterTypeEl }),
);

// ===== INIT =====
await refreshAuthUI();
supabase.auth.onAuthStateChange(() => refreshAuthUI());
