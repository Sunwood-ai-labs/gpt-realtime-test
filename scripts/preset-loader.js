(() => {
    const systemPromptEl = document.getElementById("systemPrompt");
    const listEl = document.getElementById("presetList");
    const statusEl = document.getElementById("presetStatus");
    const reloadBtn = document.getElementById("presetReload");

    if (!systemPromptEl || !listEl || !statusEl) {
        console.warn("Preset loader: required elements are missing.");
        return;
    }

    const toneClasses = {
        muted: "text-white/50",
        info: "text-cyan-200/80",
        success: "text-emerald-200/80",
        warning: "text-amber-200/80",
        error: "text-rose-200/80",
    };
    const toneValues = new Set(Object.values(toneClasses));
    const baseStatusClasses = (statusEl.className || "")
        .split(/\s+/)
        .filter(Boolean)
        .filter((cls) => !toneValues.has(cls));

    const presetCache = new Map();
    let activeButton = null;
    let selectedPresetId = null;
    let manualNoticeShown = false;
    let loadingList = false;

    const setStatus = (message, tone = "muted") => {
        statusEl.textContent = message;
        statusEl.className = baseStatusClasses.join(" ");
        const toneClass = toneClasses[tone] || toneClasses.muted;
        if (toneClass) {
            statusEl.classList.add(toneClass);
        }
    };

    const toggleReloadState = (disabled) => {
        if (!reloadBtn) return;
        reloadBtn.disabled = disabled;
        reloadBtn.setAttribute("aria-busy", String(disabled));
        reloadBtn.classList.toggle("opacity-50", disabled);
    };

    const buildCard = (preset) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "preset-card focus:outline-none";
        button.dataset.presetId = preset.id;
        button.setAttribute("aria-pressed", "false");
        button.setAttribute("role", "option");
        button.title = preset.name;

        const iconContainer = document.createElement("span");
        iconContainer.className = "preset-card__icon";

        if (preset.icon) {
            const img = document.createElement("img");
            img.src = preset.icon;
            img.alt = `${preset.name}のアイコン`;
            img.loading = "lazy";
            iconContainer.appendChild(img);
        } else {
            const icon = document.createElement("i");
            icon.className = "fa-solid fa-note-sticky";
            icon.setAttribute("aria-hidden", "true");
            iconContainer.appendChild(icon);
        }

        const body = document.createElement("span");
        body.className = "preset-card__body";

        const nameEl = document.createElement("span");
        nameEl.className = "preset-card__name";
        nameEl.textContent = preset.name;
        body.appendChild(nameEl);

        if (preset.description) {
            const caption = document.createElement("span");
            caption.className = "preset-card__caption";
            caption.textContent = preset.description;
            body.appendChild(caption);
        }

        button.appendChild(iconContainer);
        button.appendChild(body);
        return button;
    };

    const clearSelection = (notify = false) => {
        if (activeButton) {
            activeButton.setAttribute("aria-pressed", "false");
        }
        activeButton = null;
        selectedPresetId = null;
        if (notify && !manualNoticeShown) {
            setStatus("手動でプロンプトを編集中だよ✏️", "info");
            manualNoticeShown = true;
        }
    };

    const applySelection = (button, preset) => {
        if (activeButton && activeButton !== button) {
            activeButton.setAttribute("aria-pressed", "false");
        }
        activeButton = button;
        selectedPresetId = preset.id;
        button.setAttribute("aria-pressed", "true");
        manualNoticeShown = false;
        systemPromptEl.value = preset.prompt || "";
        systemPromptEl.dispatchEvent(new Event("input", { bubbles: true }));
        setStatus(`プリセット「${preset.name}」を適用したよ✨`, "success");
    };

    const fetchPresetDetail = async (presetId) => {
        const cached = presetCache.get(presetId);
        if (cached && typeof cached.prompt === "string") {
            return cached;
        }

        const response = await fetch(`/api/presets/${encodeURIComponent(presetId)}`);
        if (!response.ok) {
            throw new Error(`Failed to load preset ${presetId} (${response.status})`);
        }
        const data = await response.json();
        const merged = { ...(presetCache.get(presetId) || {}), ...data };
        presetCache.set(presetId, merged);
        return merged;
    };

    const loadPresetList = async (showFeedback = true) => {
        if (loadingList) return;
        loadingList = true;
        toggleReloadState(true);
        if (showFeedback) {
            setStatus("プリセットを更新中...", "info");
        }
        listEl.innerHTML = "";

        try {
            const response = await fetch("/api/presets");
            if (!response.ok) {
                throw new Error(`/api/presets returned ${response.status}`);
            }
            const data = await response.json();
            if (!Array.isArray(data) || !data.length) {
                setStatus("プリセットがまだ配置されていないみたい💭", "warning");
                return;
            }

            const fragment = document.createDocumentFragment();
            for (const preset of data) {
                const merged = { ...(presetCache.get(preset.id) || {}), ...preset };
                presetCache.set(preset.id, merged);
                const card = buildCard(merged);
                fragment.appendChild(card);
                if (selectedPresetId && preset.id === selectedPresetId) {
                    card.setAttribute("aria-pressed", "true");
                    activeButton = card;
                }
            }
            listEl.appendChild(fragment);
            if (!selectedPresetId) {
                setStatus("お気に入りを選んで即ロードしよう〜✨", "muted");
            }
        } catch (error) {
            console.error("Failed to fetch preset list", error);
            setStatus("プリセット一覧の取得に失敗しちゃった…⚠️", "error");
        } finally {
            toggleReloadState(false);
            loadingList = false;
        }
    };

    listEl.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-preset-id]");
        if (!button) return;
        event.preventDefault();
        const presetId = button.dataset.presetId;
        if (!presetId) return;

        button.disabled = true;
        button.classList.add("opacity-70");
        setStatus("プリセットを読み込み中...", "info");

        try {
            const preset = await fetchPresetDetail(presetId);
            applySelection(button, preset);
        } catch (error) {
            console.error("Failed to load preset", error);
            setStatus("プリセットの読み込みに失敗しちゃった…⚠️", "error");
        } finally {
            button.disabled = false;
            button.classList.remove("opacity-70");
        }
    });

    systemPromptEl.addEventListener("input", () => {
        if (!selectedPresetId) return;
        clearSelection(true);
    });

    reloadBtn?.addEventListener("click", (event) => {
        event.preventDefault();
        loadPresetList(true);
    });

    loadPresetList(false);
})();
