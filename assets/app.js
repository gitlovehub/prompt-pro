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
    selectedImage: null,
    removeImage: false,
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
    viewImage: document.getElementById("viewImage"),
    viewImageWrap: document.getElementById("viewImageWrap"),
    viewImageEmpty: document.getElementById("viewImageEmpty"),
    closeViewModal: document.getElementById("closeViewModal"),
    btnTop: document.getElementById("btnTop"),
    pricingSection: document.getElementById("pricingSection"),
    loginForm: document.getElementById("loginForm"),
    emailInput: document.getElementById("email"),
    passwordInput: document.getElementById("password"),
    pricingLink: document.getElementById("pricingLink"),
    modalImage: document.getElementById("modalImage"),
    modalImagePreview: document.getElementById("modalImagePreview"),
    modalImagePreviewWrap: document.getElementById("modalImagePreviewWrap"),
    modalImageEmpty: document.getElementById("modalImageEmpty"),
    btnRemoveImage: document.getElementById("btnRemoveImage"),
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
    dom.pricingLink?.classList.add("hidden");
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
            dom.pricingLink?.classList.remove("hidden");
            dom.planBadge.textContent = "Pro";
            dom.planBadge.className =
                "inline-flex items-center rounded-md bg-blue-100 px-2 py-1 text-sm font-medium text-blue-700 inset-ring inset-ring-blue-700/10";
            dom.planBadge.classList.remove("hidden");
        } else if (state.userPlan === "ultimate") {
            dom.pricingLink?.classList.add("hidden");
            dom.planBadge.textContent = "Ultimate";
            dom.planBadge.className =
                "inline-flex items-center rounded-md bg-emerald-100 px-2 py-1 text-sm font-medium text-emerald-700 inset-ring inset-ring-emerald-700/10";
            dom.planBadge.classList.remove("hidden");
        }
    } else {
        dom.pricingLink?.classList.remove("hidden");
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
            return showToast(dom.toast, "Only admin can create!");
        state.editingId = null;
        state.originalPromptSnapshot = null;
        state.selectedImage = null;
        state.removeImage = false;

        dom.modalImage.value = "";

        clearModalImagePreview();

        openModalCreate({
            modalEl: dom.modal,
            headingEl: dom.modalHeading,
            titleEl: dom.modalTitle,
            typeEl: dom.modalType,
            textEl: dom.modalText,
        });
        document.body.style.overflow = "hidden";
    });

    dom.modalImage.addEventListener("change", handleImageSelected);

    dom.btnRemoveImage.addEventListener("click", () => {

        revokeSelectedImagePreview();

        state.selectedImage = null;
        state.removeImage = true;

        dom.modalImage.value = "";

        clearModalImagePreview();
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

    document.addEventListener("click", (e) => {
        if (e.target.closest(".card-menu-wrap")) return;

        document.querySelectorAll(".card-menu").forEach((menu) => {
            menu.classList.add("hidden");
        });
    });

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
    revokeSelectedImagePreview();

    closeModal(dom.modal);

    state.selectedImage = null;

    if (dom.modalImage) {
        dom.modalImage.value = "";
    }

    clearModalImagePreview();

    document.body.style.overflow = "auto";
}

function showModalImagePreview(imageUrl) {
    if (!imageUrl) {
        clearModalImagePreview();
        return;
    }

    dom.modalImagePreview.src = imageUrl;
    dom.modalImagePreviewWrap.classList.remove("hidden");
    dom.modalImageEmpty.classList.add("hidden");
}

function clearModalImagePreview() {
    dom.modalImagePreview.removeAttribute("src");
    dom.modalImagePreviewWrap.classList.add("hidden");
    dom.modalImageEmpty.classList.remove("hidden");
}

function revokeSelectedImagePreview() {
    const currentSrc = dom.modalImagePreview?.src || "";

    if (currentSrc.startsWith("blob:")) {
        URL.revokeObjectURL(currentSrc);
    }
}

function handleImageSelected(e) {
    const file = e.target.files?.[0];

    if (!file) {
        state.selectedImage = null;

        const oldImageUrl =
            state.originalPromptSnapshot?.image_url || "";

        if (oldImageUrl) {
            showModalImagePreview(oldImageUrl);
        } else {
            clearModalImagePreview();
        }

        return;
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
        showToast(dom.toast, "Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP");

        e.target.value = "";
        state.selectedImage = null;
        return;
    }

    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
        showToast(dom.toast, "Ảnh không được vượt quá 10 MB");

        e.target.value = "";
        state.selectedImage = null;
        return;
    }

    revokeSelectedImagePreview();

    state.selectedImage = file;

    const previewUrl = URL.createObjectURL(file);

    showModalImagePreview(previewUrl);

    showToast(dom.toast, "Đã chọn ảnh ✅");
}

async function uploadPromptImage(file) {
    if (!file) return null;

    // Giới hạn dung lượng ảnh: tối đa 10 MB
    const maxSize = 10 * 1024 * 1024;

    if (file.size > maxSize) {
        throw new Error("Ảnh không được vượt quá 10 MB");
    }

    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp",
    ];

    if (!allowedTypes.includes(file.type)) {
        throw new Error("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP");
    }

    const originalExtension =
        file.name.split(".").pop()?.toLowerCase() || "jpg";

    const safeExtension = ["jpg", "jpeg", "png", "webp"].includes(
        originalExtension,
    )
        ? originalExtension
        : "jpg";

    const uniqueName =
        typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    // Mỗi người dùng có một thư mục riêng
    const filePath = `${state.user.id}/${uniqueName}.${safeExtension}`;

    const { error: uploadError } = await state.supabase.storage
        .from("prompt-images")
        .upload(filePath, file, {
            cacheControl: "3600",
            upsert: false,
            contentType: file.type,
        });

    if (uploadError) {
        console.error("Upload image error:", uploadError);
        throw new Error(uploadError.message || "Không thể tải ảnh lên");
    }

    const { data } = state.supabase.storage
        .from("prompt-images")
        .getPublicUrl(filePath);

    if (!data?.publicUrl) {
        throw new Error("Không lấy được đường dẫn ảnh");
    }

    return data.publicUrl;
}

async function handleSavePrompt() {
    if (!state.isAdmin) {
        return showToast(dom.toast, "Only admin");
    }

    const title = dom.modalTitle.value.trim();
    const type = dom.modalType.value;
    const prompt_text = dom.modalText.value.trim();

    if (!title || !prompt_text) {
        return showToast(
            dom.toast,
            "Title and prompt text are required",
        );
    }

    // Khi edit, giữ lại ảnh cũ nếu không chọn ảnh mới
    let image_url = state.originalPromptSnapshot?.image_url ?? null;

    // Nếu người dùng bấm nút thùng rác thì cập nhật ảnh thành null
    if (state.removeImage) {
        image_url = null;
    }

    const hasTextChanges =
        !state.editingId ||
        !state.originalPromptSnapshot ||
        title !== state.originalPromptSnapshot.title ||
        type !== state.originalPromptSnapshot.type ||
        prompt_text !==
            state.originalPromptSnapshot.prompt_text;

    const hasNewImage = Boolean(state.selectedImage);
    const hasImageRemoval = Boolean(state.removeImage);

    if (
        state.editingId &&
        !hasTextChanges &&
        !hasNewImage &&
        !hasImageRemoval
    ) {
        return showToast(dom.toast, "No changes to save");
    }

    const originalButtonText = dom.saveModal.textContent;

    try {
        dom.saveModal.disabled = true;
        dom.saveModal.textContent = hasNewImage
            ? "Uploading..."
            : "Saving...";

        if (state.selectedImage) {
            image_url = await uploadPromptImage(
                state.selectedImage,
            );
        }

        const payload = {
            title,
            type,
            prompt_text,
            image_url,
        };

        let error;

        if (!state.editingId) {
            ({ error } = await state.supabase
                .from("prompts")
                .insert(payload));
        } else {
            ({ error } = await state.supabase
                .from("prompts")
                .update(payload)
                .eq("id", state.editingId));
        }

        if (error) {
            console.error("Save prompt error:", error);
            throw new Error(error.message);
        }

        showToast(
            dom.toast,
            state.editingId ? "Saved ✅" : "Created ✅",
        );

        state.selectedImage = null;
        dom.modalImage.value = "";

        closePromptModal();
        await loadPrompts();
    } catch (error) {
        console.error("handleSavePrompt error:", error);

        showToast(
            dom.toast,
            error.message || "Save failed",
        );
    } finally {
        dom.saveModal.disabled = false;
        dom.saveModal.textContent = originalButtonText;
    }
}

async function handleCardAction(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const card = e.target.closest(".prompt-card");
    if (!card) return;

    const action = btn.dataset.action;
    const id = card.dataset.id;

    if (action === "menu") {
        const currentMenu = card.querySelector(".card-menu");

        document.querySelectorAll(".card-menu").forEach((menu) => {
            if (menu !== currentMenu) {
                menu.classList.add("hidden");
            }
        });

        currentMenu?.classList.toggle("hidden");
        return;
    }

    // Đóng menu sau khi chọn Xem, Sửa hoặc Xóa
    card.querySelector(".card-menu")?.classList.add("hidden");

    if (action === "view") {
        const imageUrl = (card.dataset.image || "").trim();

        dom.viewTitle.textContent =
            card.dataset.title || "Prompt";

        dom.viewContent.textContent =
            card.dataset.text || "";

        if (imageUrl) {
            // Có ảnh: hiện cả khung ảnh
            dom.viewImage.src = imageUrl;

            dom.viewImageWrap.classList.remove("hidden");

            dom.viewImageEmpty.classList.add("hidden");
            dom.viewImageEmpty.classList.remove("flex");
        } else {
            // Không có ảnh: ẩn khung ảnh, hiện SVG
            dom.viewImage.removeAttribute("src");

            dom.viewImageWrap.classList.add("hidden");

            dom.viewImageEmpty.classList.remove("hidden");
            dom.viewImageEmpty.classList.add("flex");
        }

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
            image_url: prompt.image_url ?? null,
        };

        state.selectedImage = null;
        state.removeImage = false;
        dom.modalImage.value = "";

        if (prompt.image_url) {
            showModalImagePreview(prompt.image_url);
        } else {
            clearModalImagePreview();
        }

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
        if (!confirm("Bạn có chắc chắn muốn xóa? Không thể hoàn tác hành động này.")) return;
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
