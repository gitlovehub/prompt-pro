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
        900,
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

export function renderPrompts({ gridEl, emptyStateEl, list, isAdmin }) {
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
            const preview =
                previewRaw.slice(0, 180) +
                (previewRaw.length > 180 ? "..." : "");
            const updated = fmtTime(p.updated_at);

            return `
      <article class="prompt-card rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:shadow-xl hover:shadow-blue-300/60"
        data-id="${escapeHtml(p.id)}"
        data-type="${escapeHtml(p.type || "image")}"
        data-title="${escapeHtml(p.title || "")}"
        data-text="${escapeHtml(p.prompt_text || "")}">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h3 
              data-field="title"
              data-raw="${escapeHtml(p.title || "Untitled")}"
              class="truncate text-sm font-extrabold">
              ${escapeHtml(p.title || "Untitled")}
            </h3>
            <div class="mt-1 flex items-center gap-2">
              ${badgeHtml(p.type)}
              <span class="text-xs text-slate-500">${updated ? "Updated: " + updated : ""}</span>
            </div>
          </div>
          <button class="rounded-xl px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-black" data-action="view">View</button>
        </div>

        <p 
          data-field="text"
          data-raw="${escapeHtml(previewRaw)}"
          class="mt-3 line-clamp-3 text-xs leading-5 text-slate-600">
          ${escapeHtml(preview)}
        </p>

        <div class="mt-4 flex items-center justify-between gap-2">
          <button
            class="flex-1 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800"
            data-action="copy">
            Copy Prompt
          </button>

          ${
              isAdmin
                  ? `
            <button
              class="rounded-xl px-3 py-2 text-xs font-semibold text-indigo-700 ring-1 ring-indigo-200 hover:bg-indigo-50"
              data-action="edit">
              Edit
            </button>
            <button
              class="rounded-xl px-3 py-2 text-xs font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50"
              data-action="delete">
              Remove
            </button>
          `
                  : ``
          }
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
    headingEl.textContent = "New prompt";
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
    headingEl.textContent = "Edit prompt";
    titleEl.value = prompt.title || "";
    typeEl.value = prompt.type || "image";
    textEl.value = prompt.prompt_text || "";
    modalEl.classList.remove("hidden");
}

export function closeModal(modalEl) {
    modalEl.classList.add("hidden");
}
