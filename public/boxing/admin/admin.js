(function () {
    const TOKEN_KEY = "boxing_admin_token";
    const DAYS = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

    const loginView = document.getElementById("login-view");
    const editorView = document.getElementById("editor-view");
    const loginForm = document.getElementById("login-form");
    const loginInput = document.getElementById("login-input");
    const passwordInput = document.getElementById("password-input");
    const loginError = document.getElementById("login-error");
    const groupsRoot = document.getElementById("groups");
    const addGroupBtn = document.getElementById("add-group-btn");
    const saveBtn = document.getElementById("save-btn");
    const logoutBtn = document.getElementById("logout-btn");
    const status = document.getElementById("status");

    let schedule = { groups: [] };

    function getToken() { return localStorage.getItem(TOKEN_KEY); }
    function setToken(t) { localStorage.setItem(TOKEN_KEY, t); }
    function clearToken() { localStorage.removeItem(TOKEN_KEY); }

    function showLogin() {
        loginView.hidden = false;
        editorView.hidden = true;
        loginError.hidden = true;
        passwordInput.value = "";
    }
    function showEditor() {
        loginView.hidden = true;
        editorView.hidden = false;
        loadSchedule();
    }

    function showStatus(message, kind) {
        status.textContent = message;
        status.className = "status " + (kind || "success");
        status.hidden = false;
        setTimeout(function () { status.hidden = true; }, 3000);
    }

    async function loadSchedule() {
        try {
            const res = await fetch("/api/boxing/schedule");
            const data = await res.json();
            schedule = data && Array.isArray(data.groups) ? data : { groups: [] };
            render();
        } catch (e) {
            showStatus("Не удалось загрузить расписание", "error");
        }
    }

    function render() {
        groupsRoot.innerHTML = "";
        schedule.groups.forEach(function (group, gIdx) {
            groupsRoot.appendChild(buildGroup(group, gIdx));
        });
    }

    function buildGroup(group, gIdx) {
        const el = document.createElement("article");
        el.className = "group";

        const header = document.createElement("div");
        header.className = "group-header";

        const nameInput = document.createElement("input");
        nameInput.className = "group-name";
        nameInput.type = "text";
        nameInput.value = group.name;
        nameInput.placeholder = "Название группы";
        nameInput.addEventListener("input", function () {
            schedule.groups[gIdx].name = nameInput.value;
        });

        const removeBtn = document.createElement("button");
        removeBtn.className = "btn btn-icon";
        removeBtn.type = "button";
        removeBtn.textContent = "✕";
        removeBtn.title = "Удалить группу";
        removeBtn.addEventListener("click", function () {
            if (!confirm("Удалить группу «" + (group.name || "Без названия") + "»?")) return;
            schedule.groups.splice(gIdx, 1);
            render();
        });

        header.appendChild(nameInput);
        header.appendChild(removeBtn);
        el.appendChild(header);

        const sessionsEl = document.createElement("div");
        sessionsEl.className = "sessions";
        group.sessions.forEach(function (session, sIdx) {
            sessionsEl.appendChild(buildSession(session, gIdx, sIdx));
        });

        const addSessionBtn = document.createElement("button");
        addSessionBtn.type = "button";
        addSessionBtn.className = "add-session";
        addSessionBtn.textContent = "+ Добавить тренировку";
        addSessionBtn.addEventListener("click", function () {
            schedule.groups[gIdx].sessions.push({ day: "Понедельник", start: "18:00", end: "19:00" });
            render();
        });
        sessionsEl.appendChild(addSessionBtn);

        el.appendChild(sessionsEl);
        return el;
    }

    function buildSession(session, gIdx, sIdx) {
        const row = document.createElement("div");
        row.className = "session-row";

        const daySelect = document.createElement("select");
        DAYS.forEach(function (day) {
            const opt = document.createElement("option");
            opt.value = day;
            opt.textContent = day;
            if (day === session.day) opt.selected = true;
            daySelect.appendChild(opt);
        });
        daySelect.addEventListener("change", function () {
            schedule.groups[gIdx].sessions[sIdx].day = daySelect.value;
        });

        const startInput = document.createElement("input");
        startInput.type = "time";
        startInput.value = session.start || "";
        startInput.addEventListener("change", function () {
            schedule.groups[gIdx].sessions[sIdx].start = startInput.value;
        });

        const dash = document.createElement("span");
        dash.className = "dash";
        dash.textContent = "–";

        const endInput = document.createElement("input");
        endInput.type = "time";
        endInput.value = session.end || "";
        endInput.addEventListener("change", function () {
            schedule.groups[gIdx].sessions[sIdx].end = endInput.value;
        });

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn btn-icon";
        removeBtn.textContent = "✕";
        removeBtn.title = "Удалить тренировку";
        removeBtn.addEventListener("click", function () {
            schedule.groups[gIdx].sessions.splice(sIdx, 1);
            render();
        });

        row.appendChild(daySelect);
        row.appendChild(startInput);
        row.appendChild(dash);
        row.appendChild(endInput);
        row.appendChild(removeBtn);
        return row;
    }

    addGroupBtn.addEventListener("click", function () {
        schedule.groups.push({ name: "Новая группа", sessions: [] });
        render();
    });

    saveBtn.addEventListener("click", async function () {
        saveBtn.disabled = true;
        try {
            const res = await fetch("/api/boxing/schedule", {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer " + getToken(),
                },
                body: JSON.stringify(schedule),
            });
            if (res.status === 401 || res.status === 403) {
                clearToken();
                showLogin();
                return;
            }
            if (!res.ok) {
                const data = await res.json().catch(function () { return {}; });
                showStatus(data.error || "Ошибка сохранения", "error");
                return;
            }
            showStatus("Сохранено", "success");
        } catch (e) {
            showStatus("Сетевая ошибка", "error");
        } finally {
            saveBtn.disabled = false;
        }
    });

    logoutBtn.addEventListener("click", function () {
        clearToken();
        showLogin();
    });

    loginForm.addEventListener("submit", async function (e) {
        e.preventDefault();
        loginError.hidden = true;
        try {
            const res = await fetch("/api/boxing/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ login: loginInput.value.trim(), password: passwordInput.value }),
            });
            if (!res.ok) {
                loginError.textContent = "Неверный логин или пароль";
                loginError.hidden = false;
                return;
            }
            const data = await res.json();
            setToken(data.token);
            showEditor();
        } catch (err) {
            loginError.textContent = "Сетевая ошибка";
            loginError.hidden = false;
        }
    });

    if (getToken()) showEditor();
    else showLogin();
})();
