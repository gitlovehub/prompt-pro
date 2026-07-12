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

// ======================== CONFIG ========================
const CONFIG = {
    SUPABASE_URL: "https://nwzoeapjzsugdtohcfyx.supabase.co",
    SUPABASE_ANON_KEY: "sb_publishable_TsL3PRhhpmnVjme70W7wwg_cC4lWs8K",
};

// ======================== STATE ========================
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

// ======================== DOM CACHE ========================
const dom = {
    appLoader: document.getElementById("appLoader"),
    appContent: document.getElementById("appContent"),
    grid: document.getElementById("grid"),
    emptyState: document.getElementById("emptyState"),
    toast: document.getElementById("toast"),
    searchBar: document.getElementById("searchBar"),
    searchInput: document.getElementById("searchInput"),
    filterType: document.getElementById("filterType"),
    filterDropdown: document.getElementById("filterDropdown"),
    filterBtn: document.getElementById("filterBtn"),
    filterMenu: document.getElementById("filterMenu"),
    filterItems: document.querySelectorAll("[data-filter-value]"),
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
    modalImage: document.getElementById("modalImage"),
    modalImagePreview: document.getElementById("modalImagePreview"),
    modalImagePreviewWrap: document.getElementById("modalImagePreviewWrap"),
    modalImageEmpty: document.getElementById("modalImageEmpty"),
    btnRemoveImage: document.getElementById("btnRemoveImage"),
    btnBuySuper: document.getElementById("btnBuySuper"),
    paymentModal: document.getElementById("paymentModal"),
    paymentModalBox: document.getElementById("paymentModalBox"),
    closePaymentModal: document.getElementById("closePaymentModal"),
    paymentCopyButtons: document.querySelectorAll("[data-payment-copy]"),
};

// ======================== DATA LAYER ========================
async function loadPrompts() {
    let query;

    if (state.isAdmin || state.userPlan === "super") {
        query = state.supabase
            .from("prompts")
            .select("*")
            .order("updated_at", { ascending: false });
    }

    // 🆓 Free: không load
    else {
        state.prompts = [];
        state.defaultPrompts = [];

        dom.searchBar.classList.add("hidden");
        dom.pricingSection.classList.add("hidden");

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
        showToast(dom.toast, "⚠️ Không thể tải danh sách prompt");
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
    const selectedType = dom.filterType?.value || "all";

    const orderIndex = new Map(
        state.defaultPrompts.map((prompt, index) => [
            String(prompt.id),
            index,
        ]),
    );

    return [...state.prompts].sort((a, b) => {
        const idA = String(a.id);
        const idB = String(b.id);

        // 1. Prompt vừa copy gần nhất luôn được ưu tiên lên đầu
        const copiedTimeA =
            state.lastCopiedAt.get(idA) || 0;

        const copiedTimeB =
            state.lastCopiedAt.get(idB) || 0;

        if (copiedTimeB !== copiedTimeA) {
            return copiedTimeB - copiedTimeA;
        }

        // 2. Nếu đang chọn "Tất cả":
        // các prompt chưa copy được xếp theo thời gian mới nhất
        if (selectedType === "all") {
            const timeA = new Date(
                a.updated_at ||
                a.original_created_at ||
                a.created_at ||
                0,
            ).getTime();

            const timeB = new Date(
                b.updated_at ||
                b.original_created_at ||
                b.created_at ||
                0,
            ).getTime();

            return timeB - timeA;
        }

        // 3. Với bộ lọc Ảnh / Chuyển động:
        // nếu chưa xác định được bằng lần copy gần nhất,
        // ưu tiên số lần copy
        const scoreA =
            state.copyScore.get(idA) || 0;

        const scoreB =
            state.copyScore.get(idB) || 0;

        if (scoreB !== scoreA) {
            return scoreB - scoreA;
        }

        // 4. Cuối cùng giữ thứ tự ban đầu
        return (
            (orderIndex.get(idA) ?? 999999) -
            (orderIndex.get(idB) ?? 999999)
        );
    });
}

// ======================== AUTH LAYER ========================
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
        showToast(dom.toast, "⚠️ Không thể kết nối dịch vụ đăng nhập");
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

    if (error || !profile) {
        state.userPlan = "free";
        state.isAdmin = false;

        showToast(
            dom.toast,
            "⚠️ Không tìm thấy thông tin tài khoản, đang sử dụng gói Free",
        );
    } else {
        state.userPlan = String(
            profile.plan || "free",
        ).trim().toLowerCase();

        state.isAdmin =
            String(profile.role || "user")
                .trim()
                .toLowerCase() === "admin";
    }

    // Chỉ admin mới thấy nút thêm prompt
    dom.btnNew.classList.toggle(
        "hidden",
        !state.isAdmin,
    );

    // User thường + gói Free:
    // ẩn pricing, không load prompt, chỉ hiện "Không có gì."
    if (!state.isAdmin && state.userPlan === "free") {
        state.prompts = [];
        state.defaultPrompts = [];

        dom.pricingSection.classList.add("hidden");
        dom.searchBar.classList.add("hidden");

        renderPrompts({
            gridEl: dom.grid,
            emptyStateEl: dom.emptyState,
            list: [],
            isAdmin: false,
        });

        return;
    }

    // Admin hoặc user Super được xem prompt
    dom.searchBar.classList.remove("hidden");
    dom.pricingSection.classList.add("hidden");

    await loadPrompts();
}

// ======================== UI EVENT HANDLERS ========================
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
            return showToast(dom.toast, "👮 Chỉ quản trị viên mới có thể thêm prompt");
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

    dom.btnRemoveImage?.addEventListener("click", () => {
        revokeSelectedImagePreview();

        state.selectedImage = null;

        // Chỉ cần cập nhật null khi đang sửa prompt đã có ảnh
        state.removeImage = Boolean(
            state.editingId &&
            state.originalPromptSnapshot?.image_url
        );

        if (dom.modalImage) {
            dom.modalImage.value = "";
        }

        clearModalImagePreview();

        showToast(dom.toast, "✅ Đã xóa ảnh");
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

    dom.viewModal.addEventListener("click", (e) => {
        if (e.target !== dom.viewModal) return;

        dom.viewModal.classList.add("hidden");
        document.body.style.overflow = "auto";
    });

    // Search
    dom.searchInput.addEventListener("input", () =>
        applySearchFilter({
            searchInputEl: dom.searchInput,
            filterTypeEl: dom.filterType,
        }),
    );

    dom.filterBtn?.addEventListener("click", (e) => {
        e.stopPropagation();

        const isOpening =
            dom.filterMenu.classList.contains("hidden");

        dom.filterMenu.classList.toggle("hidden");
        dom.filterBtn.setAttribute(
            "aria-expanded",
            String(isOpening),
        );
    });

    dom.filterItems.forEach((item) => {
        item.addEventListener("click", () => {
            const selectedValue =
                item.dataset.filterValue || "all";

            dom.filterType.value = selectedValue;

            dom.filterMenu.classList.add("hidden");
            dom.filterBtn.setAttribute(
                "aria-expanded",
                "false",
            );

            dom.filterItems.forEach((button) => {
                button.classList.remove(
                    "bg-blue-50",
                    "text-blue-700",
                );

                button.classList.add("text-slate-700");
            });

            item.classList.remove("text-slate-700");

            item.classList.add(
                "bg-blue-50",
                "text-blue-700",
            );

            // Render lại đúng thứ tự
            renderPrompts({
                gridEl: dom.grid,
                emptyStateEl: dom.emptyState,
                list: getSortedPrompts(),
                isAdmin: state.isAdmin,
            });

            // Sau đó mới lọc card
            applySearchFilter({
                searchInputEl: dom.searchInput,
                filterTypeEl: dom.filterType,
            });
        });
    });

    document.addEventListener("click", (e) => {
        // Không đóng card menu khi click bên trong card menu
        if (!e.target.closest(".card-menu-wrap")) {
            document
                .querySelectorAll(".card-menu")
                .forEach((menu) => {
                    menu.classList.add("hidden");
                });
        }

        // Không đóng filter khi click bên trong filter dropdown
        if (!e.target.closest("#filterDropdown")) {
            dom.filterMenu?.classList.add("hidden");

            dom.filterBtn?.setAttribute(
                "aria-expanded",
                "false",
            );
        }
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
        return showToast(dom.toast, "⚠️ Vui lòng nhập email và mật khẩu");

    const { error } = await state.supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (error) {
        showToast(
            dom.toast,
            error.message.includes("Invalid login")
                ? "❌ Email hoặc mật khẩu không chính xác"
                : "😫 Đăng nhập thất bại",
        );
        return;
    }

    showToast(dom.toast, "🎉 환영합니다");
    closeLoginModal();
    await state.supabase.auth.refreshSession();
    await refreshAuthUI();
}

async function handleLogout() {
    await state.supabase.auth.signOut();
    showToast(dom.toast, "👋 Đã đăng xuất");
    
    if (dom.emailInput) dom.emailInput.value = "";
    if (dom.passwordInput) dom.passwordInput.value = "";
    
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
    // Clear input để bảo mật
    if (dom.emailInput) dom.emailInput.value = "";
    if (dom.passwordInput) dom.passwordInput.value = "";

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

    state.editingId = null;
    state.originalPromptSnapshot = null;
    state.selectedImage = null;
    state.removeImage = false;

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
        state.removeImage = false;

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
        showToast(dom.toast, "🚧 Ảnh không được vượt quá 10 MB");

        e.target.value = "";
        state.selectedImage = null;
        return;
    }

    revokeSelectedImagePreview();
    
    state.selectedImage = file;
    state.removeImage = false;

    const previewUrl = URL.createObjectURL(file);

    showModalImagePreview(previewUrl);

    showToast(dom.toast, "✅ Đã chọn ảnh");
}

function getPromptImagePath(imageUrl) {
    if (!imageUrl) return null;

    const marker =
        "/storage/v1/object/public/prompt-images/";

    const index = imageUrl.indexOf(marker);

    if (index === -1) {
        console.warn(
            "⚠️ Không nhận diện được đường dẫn ảnh:",
            imageUrl,
        );

        return null;
    }

    const filePath = imageUrl.slice(
        index + marker.length,
    );

    try {
        return decodeURIComponent(filePath);
    } catch {
        return filePath;
    }
}

async function deletePromptImage(imageUrl) {
    const filePath = getPromptImagePath(imageUrl);

    if (!filePath) return;

    const { error } = await state.supabase.storage
        .from("prompt-images")
        .remove([filePath]);

    if (error) {
        console.error(
            "❌ Không thể xóa ảnh khỏi Storage:",
            error,
        );

        throw new Error(
            error.message ||
            "Không thể xóa ảnh khỏi kho lưu trữ",
        );
    }
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
        return showToast(dom.toast, "👮 Chỉ quản trị viên mới có quyền thực hiện");
    }

    const title = dom.modalTitle.value.trim();
    const type = dom.modalType.value;
    const prompt_text = dom.modalText.value.trim();

    if (!title || !prompt_text) {
        return showToast(
            dom.toast,
            "⚠️ Vui lòng nhập tiêu đề và nội dung prompt",
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
        return showToast(dom.toast, "😐 Không có thay đổi để lưu");
    }

    const originalButtonText = dom.saveModal.textContent;

    try {
        dom.saveModal.disabled = true;
        dom.saveModal.textContent = hasNewImage
            ? "⏳ Đang tải ảnh lên..."
            : "⏳ Đang lưu dữ liệu...";

        const oldImageUrl = state.originalPromptSnapshot?.image_url ?? null;

        if (state.selectedImage) {
            image_url = await uploadPromptImage(
                state.selectedImage,
            );
        }

        const shouldDeleteOldImage =
            Boolean(
                state.editingId &&
                oldImageUrl &&
                oldImageUrl !== image_url,
            );

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
            console.error("❌ Lỗi lưu prompt:", error);
            throw new Error(error.message);
        }

        // Chỉ xóa ảnh cũ sau khi đã lưu database thành công
        if (shouldDeleteOldImage) {
            try {
                await deletePromptImage(oldImageUrl);
            } catch (storageError) {
                console.error(
                    "⚠️ Đã lưu prompt nhưng chưa xóa được ảnh cũ:",
                    storageError,
                );

                showToast(
                    dom.toast,
                    "⚠️ Đã lưu nhưng chưa xóa được ảnh cũ",
                );
            }
        }

        showToast(
            dom.toast,
            state.editingId
                ? "✅ Đã lưu prompt"
                : "🎉 Đã tạo prompt",
        );

        state.selectedImage = null;
        dom.modalImage.value = "";

        closePromptModal();
        await loadPrompts();
    } catch (error) {
        console.error("handleSavePrompt error:", error);

        showToast(
            dom.toast,
            error.message || "😫 Lưu thất bại",
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
                "Gói Free không hỗ trợ copy. Nâng cấp Super nhé!",
            );
            return;
        }

        try {
            await copyToClipboard(card.dataset.text || "");
            showToast(dom.toast, "✅ Copied");

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
            showToast(dom.toast, "❌ Không thể sao chép");
        }
        return;
    }

    if (!state.isAdmin) return showToast(dom.toast, "👮 Chỉ quản trị viên mới có quyền thực hiện");

    if (action === "edit") {
        const prompt = state.prompts.find(
            (item) => String(item.id) === String(id),
        );
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
        const confirmed = confirm(
            "Bạn có chắc chắn muốn xóa vĩnh viễn prompt này không? 🤔\n\nHành động này không thể hoàn tác.",
        );

        if (!confirmed) return;

        const prompt = state.prompts.find(
            (item) => String(item.id) === String(id),
        );

        const oldImageUrl =
            prompt?.image_url ?? null;

        const { error } = await state.supabase
            .from("prompts")
            .delete()
            .eq("id", id);

        if (error) {
            console.error(
                "❌ Lỗi xóa prompt:",
                error,
            );

            showToast(
                dom.toast,
                "❌ Không thể xóa prompt",
            );

            return;
        }

        // Xóa ảnh liên quan sau khi xóa prompt thành công
        if (oldImageUrl) {
            try {
                await deletePromptImage(oldImageUrl);
            } catch (storageError) {
                console.error(
                    "⚠️ Đã xóa prompt nhưng chưa xóa được ảnh:",
                    storageError,
                );

                showToast(
                    dom.toast,
                    "⚠️ Đã xóa prompt nhưng ảnh cũ vẫn còn",
                );

                await loadPrompts();
                return;
            }
        }

        showToast(
            dom.toast,
            "✅ Đã xóa",
        );

        await loadPrompts();
    }

}

// ======================== PAYMENT MODAL ========================
function showPaymentModal() {
    if (!dom.paymentModal) {
        console.error("Không tìm thấy #paymentModal");
        return;
    }

    dom.paymentModal.classList.remove("hidden");
    document.body.style.overflow = "hidden";

    requestAnimationFrame(() => {
        dom.paymentModal.classList.remove("opacity-0");

        dom.paymentModalBox?.classList.remove(
            "opacity-0",
            "translate-y-6",
            "scale-95",
        );
    });
}

function hidePaymentModal() {
    if (!dom.paymentModal) return;

    dom.paymentModal.classList.add("opacity-0");

    dom.paymentModalBox?.classList.add(
        "opacity-0",
        "translate-y-6",
        "scale-95",
    );

    window.setTimeout(() => {
        dom.paymentModal.classList.add("hidden");
        restoreBodyScroll();
    }, 300);
}

function restoreBodyScroll() {
    const hasOpenModal =
        !dom.loginModal?.classList.contains("hidden") ||
        !dom.modal?.classList.contains("hidden") ||
        !dom.viewModal?.classList.contains("hidden") ||
        !dom.paymentModal?.classList.contains("hidden");

    document.body.style.overflow = hasOpenModal
        ? "hidden"
        : "auto";
}

async function handlePaymentCopy(button) {
    const value = button.dataset.paymentCopy?.trim();

    if (!value) {
        showToast(dom.toast, "❌ Không tìm thấy nội dung để sao chép");
        return;
    }

    const originalText = button.textContent;

    try {
        button.disabled = true;

        await copyToClipboard(value);

        button.textContent = "Đã chép ✓";

        if (value === "78911021102") {
            showToast(dom.toast, "✅ Copied");
        } else if (value.toLowerCase() === "super") {
            showToast(dom.toast, "✅ Copied");
        } else {
            showToast(dom.toast, "✅ Copied");
        }

        window.setTimeout(() => {
            button.textContent = originalText;
            button.disabled = false;
        }, 1500);
    } catch (error) {
        console.error("Payment copy error:", error);

        button.textContent = originalText;
        button.disabled = false;

        showToast(dom.toast, "❌ Không thể sao chép");
    }
}

function setupPaymentModal() {
    dom.btnBuySuper?.addEventListener(
        "click",
        showPaymentModal,
    );

    dom.closePaymentModal?.addEventListener(
        "click",
        hidePaymentModal,
    );

    dom.paymentCopyButtons.forEach((button) => {
        button.addEventListener("click", () => {
            handlePaymentCopy(button);
        });
    });

    // Bấm vào vùng nền tối để đóng
    dom.paymentModal?.addEventListener("click", (event) => {
        if (event.target === dom.paymentModal) {
            hidePaymentModal();
        }
    });

    // Ngăn click bên trong hộp làm đóng modal
    dom.paymentModalBox?.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    // Đóng bằng phím Escape
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;

        if (
            dom.paymentModal &&
            !dom.paymentModal.classList.contains("hidden")
        ) {
            hidePaymentModal();
        }
    });
}

function showAppLoader() {
    dom.appLoader?.classList.remove("hidden");
    dom.appContent?.classList.add("hidden");

    document.body.style.overflow = "hidden";
}

function hideAppLoader() {
    dom.appLoader?.classList.add("hidden");
    dom.appContent?.classList.remove("hidden");

    restoreBodyScroll();
}

// ======================== INIT ========================
async function init() {
    showAppLoader();

    try {
        setupEventListeners();
        setupPaymentModal();

        await refreshAuthUI();

        state.supabase.auth.onAuthStateChange((event) => {
            if (
                ["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)
            ) {
                refreshAuthUI();
            }
        });
    } catch (error) {
        console.error("Init error:", error);

        showToast(
            dom.toast,
            "⚠️ Không thể khởi tạo ứng dụng",
        );
    } finally {
        hideAppLoader();
    }
}

init();
