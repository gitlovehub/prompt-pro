// assets/ui.js

function normalizeText(str = "") {
    return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function highlightText(text, keyword) {
    if (!keyword) return escapeHtml(text);

    const normText = normalizeText(text);
    const normKey = normalizeText(keyword);

    let result = "";
    let i = 0;

    while (i < text.length) {
        const slice = normalizeText(text.slice(i, i + normKey.length));
        if (slice === normKey) {
            result += `<mark class="bg-yellow-200 rounded px-0.5">${escapeHtml(
                text.slice(i, i + normKey.length),
            )}</mark>`;
            i += normKey.length;
        } else {
            result += escapeHtml(text[i]);
            i++;
        }
    }
    return result;
}

export function showToast(toastEl, msg = "OK") {
    toastEl.textContent = msg;
    toastEl.classList.remove("hidden");
    clearTimeout(window.__toastTimer);
    window.__toastTimer = setTimeout(
        () => toastEl.classList.add("hidden"),
        2000,
    );
}

export async function copyToClipboard(text) {
    await navigator.clipboard.writeText(text);
}

export function escapeHtml(str = "") {
    return String(str)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export function badgeHtml(type) {
    const t = (type || "image").toLowerCase();
    const motion = t === "motion";
    const cls = motion
        ? "inline-flex items-center rounded-lg bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200"
        : "inline-flex items-center rounded-lg bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200";
    return `<span class="${cls}">${motion ? "MOTION" : "IMAGE"}</span>`;
}

export function fmtTime(iso) {
    if (!iso) return "";
    try {
        return new Date(iso).toLocaleString("vi-VN", {
            timeZone: "Asia/Ho_Chi_Minh",
            hour12: false,
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    } catch {
        return "";
    }
}

export function renderPrompts({
    gridEl,
    emptyStateEl,
    list,
    isAdmin,
}) {
    gridEl.innerHTML = "";
    gridEl.appendChild(emptyStateEl);

    if (!list || list.length === 0) {
        emptyStateEl.classList.remove("hidden");
        return;
    }

    emptyStateEl.classList.add("hidden");

    const html = list
        .map((p) => {
            const previewRaw = p.prompt_text || "";
            const updated = fmtTime(p.updated_at);

            const backgroundMedia = p.image_url
                ? `
                    <img
                        src="${escapeHtml(p.image_url)}"
                        alt="${escapeHtml(p.title || "Prompt image")}"
                        class="absolute inset-0 h-full w-full object-cover"
                        loading="lazy"
                    />
                `
                : `
                    <div
                        class="absolute inset-0 flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 via-slate-200 to-slate-400 text-sm font-semibold text-slate-500">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="stroke-[2] absolute top-20"><path fill-rule="evenodd" clip-rule="evenodd" d="M14.0996 2.5C15.2032 2.5 16.0914 2.49903 16.8086 2.55762C17.5373 2.61716 18.1773 2.74327 18.7695 3.04492C19.7103 3.52429 20.4757 4.28966 20.9551 5.23047C21.2567 5.82266 21.3828 6.4627 21.4424 7.19141C21.501 7.90857 21.5 8.79681 21.5 9.90039V14.0996C21.5 15.2032 21.501 16.0914 21.4424 16.8086C21.3828 17.5373 21.2567 18.1773 20.9551 18.7695C20.4757 19.7103 19.7103 20.4757 18.7695 20.9551C18.1773 21.2567 17.5373 21.3828 16.8086 21.4424C16.0914 21.501 15.2032 21.5 14.0996 21.5H9.90039C8.79681 21.5 7.90857 21.501 7.19141 21.4424C6.4627 21.3828 5.82266 21.2567 5.23047 20.9551C4.28966 20.4757 3.52429 19.7103 3.04492 18.7695C2.74327 18.1773 2.61716 17.5373 2.55762 16.8086C2.49903 16.0914 2.5 15.2032 2.5 14.0996V9.90039C2.5 8.79681 2.49903 7.90857 2.55762 7.19141C2.61716 6.4627 2.74327 5.82266 3.04492 5.23047C3.52429 4.28966 4.28966 3.52429 5.23047 3.04492C5.82266 2.74327 6.4627 2.61716 7.19141 2.55762C7.90857 2.49903 8.79681 2.5 9.90039 2.5H14.0996ZM4.50586 14.4424C4.51159 14.915 4.52312 16.3068 4.55078 16.6455C4.60023 17.2507 4.69296 17.599 4.82715 17.8623C5.11472 18.4265 5.57347 18.8853 6.1377 19.1729C6.40105 19.307 6.74933 19.3998 7.35449 19.4492C7.97129 19.4996 8.76396 19.5 9.90039 19.5H14.0996C14.4595 19.5 15.7848 19.4968 16.0811 19.4951L7.95899 11.373L4.50586 14.4424ZM15 7C13.8954 7 13 7.89543 13 9C13 10.1046 13.8954 11 15 11C16.1046 11 17 10.1046 17 9C17 7.89543 16.1046 7 15 7Z" fill="currentColor"></path></svg>
                    </div>
                `;

            return `
                <article
                    class="prompt-card group relative h-[300px] overflow-hidden rounded-[20px] border border-white/60 bg-slate-200 shadow-lg transition-all duration-300 sm:h-[360px] sm:rounded-[24px] md:h-[420px] md:rounded-[28px] md:hover:shadow-2xl"
                    data-id="${escapeHtml(p.id)}"
                    data-type="${escapeHtml(p.type || "image")}"
                    data-title="${escapeHtml(p.title || "")}"
                    data-text="${escapeHtml(p.prompt_text || "")}"
                    data-image="${escapeHtml(p.image_url || "")}"
                >

                    <!-- ẢNH PHỦ TOÀN BỘ CARD -->
                    ${backgroundMedia}

                    <!-- LỚP TỐI NHẸ GIÚP PHẦN CHỮ DỄ ĐỌC -->
                    <div
                        class="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/5">
                    </div>

                    <!-- MENU 3 CHẤM -->
                    <div class="card-menu-wrap absolute right-2 top-2 sm:right-3 sm:top-3 md:right-4 md:top-4 z-30">

                        <button
                            type="button"
                            data-action="menu"
                            aria-label="Mở menu"
                            class="flex h-8 w-8 items-center justify-center rounded-full border border-white/40 bg-black/35 text-2xl leading-none shadow-lg backdrop-blur-sm transition hover:bg-black/60">
                            <svg
                                class="pointer-events-none h-5 w-5 text-slate-200"
                                viewBox="0 0 20 20"
                                fill="currentColor">

                                <path
                                    d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z"
                                />
                            </svg>
                        </button>

                        <div
                            class="card-menu absolute right-0 top-[40px] hidden w-36 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">

                            <button
                                type="button"
                                data-action="view"
                                class="flex w-full items-center gap-2 bg-white px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-slate-200 hover:text-slate-950">
                                <span>👁️</span>
                                <span>Xem</span>
                            </button>

                            ${
                                isAdmin
                                    ? `
                                        <button
                                            type="button"
                                            data-action="edit"
                                            class="flex w-full items-center gap-2 bg-white px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-indigo-200 hover:text-indigo-700">
                                            <span>✏️</span>
                                            <span>Sửa</span>
                                        </button>

                                        <button
                                            type="button"
                                            data-action="delete"
                                            class="flex w-full items-center gap-2 bg-white px-4 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors hover:bg-red-200 hover:text-red-600">
                                            <span>🗑️</span>
                                            <span>Xóa</span>
                                        </button>
                                    `
                                    : ""
                            }
                        </div>
                    </div>

                    <!-- KHỐI NỘI DUNG BLUR -->
                    <div
                        class="absolute inset-x-0 bottom-0 z-20 border border-white/25 bg-black/10 p-3 sm:p-4 md:p-5 text-white shadow-2xl backdrop-blur-sm">

                        <!-- TÊN PROMPT -->
                        <h3
                            data-field="title"
                            data-raw="${escapeHtml(p.title || "Untitled")}"
                            class="line-clamp-2 text-xs font-extrabold text-white sm:text-sm truncate">
                            ${escapeHtml(p.title || "Untitled")}
                        </h3>

                        <!-- NỘI DUNG 2 DÒNG -->
                        <p
                            data-field="text"
                            data-raw="${escapeHtml(previewRaw)}"
                            class="mt-1 line-clamp-2 text-sm text-white/80">
                            ${escapeHtml(previewRaw)}
                        </p>

                        <!-- THỜI GIAN + TAG -->
                        <div class="my-2 flex items-center justify-between gap-3">

                            <span class="truncate text-xs font-medium text-white/65">
                                ${updated || "Chưa cập nhật"}
                            </span>

                            ${
                                (p.type || "image").toLowerCase() === "motion"
                                    ? `
                                        <span class="inline-flex items-center rounded-full border border-amber-300/50 bg-amber-400/20 px-2 py-0.5 text-[9px] sm:px-3 sm:py-1 sm:text-[11px] font-bold text-amber-100 backdrop-blur-md">
                                            MOTION
                                        </span>
                                    `
                                    : `
                                        <span class="inline-flex items-center rounded-full border border-emerald-300/50 bg-emerald-400/20 px-2 py-0.5 text-[9px] sm:px-3 sm:py-1 sm:text-[11px] font-bold text-emerald-100 backdrop-blur-md">
                                            IMAGE
                                        </span>
                                    `
                            }
                        </div>

                        <!-- NÚT COPY -->
                        <button
                            type="button"
                            data-action="copy"
                            class="w-full rounded-xl bg-white px-2 py-2 text-xs font-extrabold text-slate-950 shadow-lg transition hover:bg-slate-100 active:scale-[0.98] sm:mt-1 sm:rounded-2xl sm:px-4 sm:py-3 sm:text-sm md:text-base">
                            Copy
                        </button>

                    </div>
                </article>
            `;
        })
        .join("");

    gridEl.insertAdjacentHTML("beforeend", html);
}

export function applySearchFilter({ searchInputEl, filterTypeEl }) {
    const keyword = searchInputEl.value.trim();
    const selectedType = filterTypeEl?.value || "all";

    const normKey = normalizeText(keyword);
    const cards = [];

    document.querySelectorAll(".prompt-card").forEach((card) => {
        const cardType = card.dataset.type; // image | motion

        // ===== FILTER TYPE =====
        if (selectedType !== "all" && cardType !== selectedType) {
            card.classList.add("hidden");
            return;
        }

        const titleEl = card.querySelector("[data-field='title']");
        const textEl = card.querySelector("[data-field='text']");

        const rawTitle = titleEl.dataset.raw;
        const rawText = textEl.dataset.raw;

        // ===== KHÔNG SEARCH → CHỈ FILTER TYPE =====
        if (!keyword) {
            titleEl.textContent = rawTitle;
            textEl.textContent = rawText;
            card.classList.remove("hidden");
            cards.push({ card, score: 0 });
            return;
        }

        let score = 0;

        // ===== TẦNG 1: MATCH CÓ DẤU (CTRL + F STYLE) =====
        if (rawTitle.includes(keyword) || rawText.includes(keyword)) {
            score = 2;
            titleEl.innerHTML = highlightText(rawTitle, keyword);
            textEl.innerHTML = highlightText(rawText, keyword);
        }
        // ===== TẦNG 2: MATCH BỎ DẤU =====
        else if (
            normalizeText(rawTitle).includes(normKey) ||
            normalizeText(rawText).includes(normKey)
        ) {
            score = 1;
            titleEl.innerHTML = highlightText(rawTitle, keyword);
            textEl.innerHTML = highlightText(rawText, keyword);
        } else {
            card.classList.add("hidden");
            titleEl.textContent = rawTitle;
            textEl.textContent = rawText;
            return;
        }

        card.classList.remove("hidden");
        cards.push({ card, score });
    });

    // ===== ĐƯA CARD MATCH LÊN ĐẦU =====
    cards
        .sort((a, b) => b.score - a.score)
        .forEach(({ card }) => {
            card.parentNode.appendChild(card);
        });
}

export function openModalCreate({
    modalEl,
    headingEl,
    titleEl,
    typeEl,
    textEl,
}) {
    headingEl.textContent = "Thêm mới prompt";
    titleEl.value = "";
    typeEl.value = "image";
    textEl.value = "";
    modalEl.classList.remove("hidden");
}

export function openModalEdit({
    modalEl,
    headingEl,
    titleEl,
    typeEl,
    textEl,
    prompt,
}) {
    headingEl.textContent = "Chỉnh sửa prompt";
    titleEl.value = prompt.title || "";
    typeEl.value = prompt.type || "image";
    textEl.value = prompt.prompt_text || "";
    modalEl.classList.remove("hidden");
}

export function closeModal(modalEl) {
    modalEl.classList.add("hidden");
}
