(() => {
    "use strict";

    /* =========================================================
       1. Utilities
       ========================================================= */

    const STORAGE_KEY = "career-studio-ats-v4";
    const LEGACY_KEYS = ["career-studio-ats-v3", "career-studio-ats-v2"];

    const $ = selector => document.querySelector(selector);
    const $$ = selector => [...document.querySelectorAll(selector)];

    const uid = () =>
        Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    const clean = value => String(value ?? "").trim();

    const escapeHTML = value =>
        String(value ?? "").replace(/[&<>"']/g, character => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
        })[character]);

    const lines = value =>
        String(value ?? "").split("\n").map(line => line.trim()).filter(Boolean);

    // Splits on separators that are not inside parentheses or brackets.
    function splitTopLevel(value, separators = ",;\n") {
        const output = [];
        let depth = 0;
        let current = "";

        for (const character of String(value ?? "")) {
            if ("([{".includes(character)) depth++;
            else if (")]}".includes(character)) depth = Math.max(0, depth - 1);

            if (depth === 0 && separators.includes(character)) {
                output.push(current);
                current = "";
            } else {
                current += character;
            }
        }

        output.push(current);
        return output.map(item => item.trim()).filter(Boolean);
    }

    function dedupe(items) {
        const seen = new Set();
        return items.filter(item => {
            const key = String(item).toLowerCase();
            if (!item || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    const splitList = value => dedupe(splitTopLevel(value));

    function stripEmphasis(value) {
        return String(value ?? "")
            .replace(/\*\*(.+?)\*\*/g, "$1")
            .replace(/__(.+?)__/g, "$1")
            .replace(/^\*+(?=\S)/, "")
            .replace(/(\S)\*+$/, "$1")
            .trim();
    }

    const wordCount = value => String(value).split(/\s+/).filter(Boolean).length;
    const isSentenceLine = line => /[.!?]$/.test(line) && wordCount(line) > 8;

    /* =========================================================
       2. State schema
       ========================================================= */

    function emptyState() {
        return {
            view: "resume",
            targetRole: "",
            targetKeywords: "",
            settings: { pageSize: "letter" },
            resume: {
                name: "", title: "", email: "", phone: "", website: "", portfolio: "",
                location: "", summary: "", skills: "",
                education: [], experience: [], projects: [], languages: [], credentials: []
            },
            linkedin: { industry: "", headline: "", about: "", skills: "", highlights: "" }
        };
    }

    const FIELD_SCHEMA = {
        education: [
            ["school", "Institution (line 1, bold)", "Purdue University"],
            ["degree", "Degree (line 2)", "Master of Science in Applied Data Science"],
            ["field", "Major / concentration (line 2)", "Data Curation & Quality Assurance"],
            ["gpa", "GPA (line 2)", "3.72"],
            ["location", "Location (line 2, right)", "Indianapolis, Indiana"],
            ["start", "Start date", "Sep 2019"],
            ["end", "End / graduation date", "May 2021"],
            ["details", "Description · start a line with • for bullets, end with : for a sub-label",
                "Focused on data preparation...\nMinors:\n• Information Science", "textarea", true]
        ],

        experience: [
            ["company", "Company / organization (line 1, bold)", "Indiana Data Labeling Collective"],
            ["role", "Job title (line 2)", "Data Annotation Specialist"],
            ["employmentType", "Employment type / work mode (line 2)", "Part Time · Remote"],
            ["location", "Location (line 2, right)", "Remote (United States)"],
            ["start", "Start date", "Aug 2024"],
            ["end", "End date", "Present"],
            ["achievements", "Achievements · one per line (shown as bullets)",
                "Processed 8,000+ items per month with 99% inter-rater reliability", "textarea", true]
        ],

        projects: [
            ["title", "Project title (line 1, bold)", "High-Accuracy Image Labeling Pipeline"],
            ["associatedWith", "Organization / context (line 2)", "Roche Diagnostics (Indianapolis, IN)"],
            ["tools", "Tools (line 2)", "Labelbox, CVAT, Excel, Jira"],
            ["domain", "Domain (line 2, right)", "Computer Vision / Data Annotation"],
            ["start", "Start date", "Jan 2023"],
            ["end", "End date", "Jun 2024"],
            ["description", "Description · paragraph, or lines starting with • for bullets",
                "Annotated 800 images with bounding boxes...", "textarea", true]
        ],

        credentials: [
            ["name", "Credential name (line 1, bold)", "Certified Data Quality Professional (CDQP)"],
            ["issuer", "Issuing organization (line 2)", "IAIDQ"],
            ["credentialId", "Credential ID (line 2)", "CDQP-2893IN"],
            ["issueDate", "Issued (line 1, right)", "Jan 2023"],
            ["expiryDate", "Expires (line 1, right)", "Jan 2026"],
            ["summary", "Summary · optional", "Validated data quality competencies", "textarea", true]
        ],

        languages: [
            ["name", "Language", "English"],
            ["proficiency", "Proficiency", "Native Proficiency"]
        ]
    };

    const SECTION_ORDER = [
        "summary", "education", "experience", "projects", "credentials", "skills", "languages"
    ];

    const SECTION_LABELS = {
        summary: "Summary",
        education: "Education",
        experience: "Experience",
        projects: "Projects",
        credentials: "Certifications",
        skills: "Skills",
        languages: "Languages"
    };

    function emptyItem(type) {
        const item = { id: uid() };
        FIELD_SCHEMA[type].forEach(([key]) => { item[key] = ""; });
        return item;
    }

    function normalizeItem(type, item) {
        const normalized = emptyItem(type);
        FIELD_SCHEMA[type].forEach(([key]) => {
            normalized[key] = String(item?.[key] ?? "");
        });
        return normalized;
    }

    function normalizeState(input) {
        const base = emptyState();
        if (!input || typeof input !== "object") return base;

        base.view = input.view === "linkedin" ? "linkedin" : "resume";
        base.targetRole = String(input.targetRole ?? "");
        base.targetKeywords = String(input.targetKeywords ?? "");
        base.settings.pageSize = input.settings?.pageSize === "a4" ? "a4" : "letter";

        ["name", "title", "email", "phone", "website", "portfolio",
            "location", "summary", "skills"].forEach(key => {
            base.resume[key] = String(input.resume?.[key] ?? "");
        });

        Object.keys(base.linkedin).forEach(key => {
            base.linkedin[key] = String(input.linkedin?.[key] ?? "");
        });

        Object.keys(FIELD_SCHEMA).forEach(type => {
            base.resume[type] = Array.isArray(input.resume?.[type])
                ? input.resume[type].map(item => normalizeItem(type, item))
                : [];
        });

        return base;
    }

    /* =========================================================
       3. Persistence and helpers
       ========================================================= */

    function loadState() {
        try {
            const saved =
                localStorage.getItem(STORAGE_KEY) ||
                LEGACY_KEYS.map(key => localStorage.getItem(key)).find(Boolean);
            return normalizeState(JSON.parse(saved));
        } catch {
            return emptyState();
        }
    }

    let state = loadState();
    let saveTimer;
    let toastTimer;

    function saveState() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            $("#save-status").textContent = "Saved locally";
        } catch {
            $("#save-status").textContent = "Session only";
        }
    }

    function scheduleSave() {
        $("#save-status").textContent = "Saving…";
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveState, 300);
    }

    function showToast(message) {
        const toast = $("#toast");
        toast.textContent = message;
        toast.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("show"), 3200);
    }

    function getPath(path) {
        return path.split(".").reduce((object, key) => object?.[key], state) ?? "";
    }

    function setPath(path, value) {
        const keys = path.split(".");
        const finalKey = keys.pop();
        const object = keys.reduce((current, key) => current[key], state);
        object[finalKey] = value;
    }

    function syncInputs() {
        $$("[data-bind]").forEach(input => {
            const value = getPath(input.dataset.bind);
            if (input.value !== value) input.value = value;
        });
    }

    /* =========================================================
       4. Section-header detection
       ========================================================= */

    const HEADER_ALIASES = {
        summary: ["summary", "professional summary", "career summary", "professional profile",
            "profile", "career objective", "objective", "about me", "executive summary"],
        education: ["education", "academic background", "academic history",
            "education and training", "academic qualifications"],
        experience: ["work experience", "professional experience", "experience",
            "employment history", "work history", "career history",
            "relevant experience", "professional background"],
        skills: ["skills", "core skills", "technical skills", "professional skills",
            "core competencies", "competencies", "areas of expertise", "key skills"],
        projects: ["projects", "selected projects", "professional projects",
            "academic projects", "key projects", "personal projects"],
        languages: ["language", "languages", "language skills",
            "languages and proficiency", "language proficiency"],
        credentials: ["credentials", "certifications", "certification", "licenses", "licences",
            "professional credentials", "certifications and licenses", "certificates",
            "licenses and certifications", "certifications and credentials"]
    };

    function normalizeLabel(value) {
        return String(value ?? "")
            .toLowerCase()
            .replace(/&/g, " and ")
            .replace(/[^a-z0-9]+/g, " ")
            .trim()
            .replace(/\s+/g, " ");
    }

    const HEADER_LOOKUP = new Map();
    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
        aliases.forEach(alias => HEADER_LOOKUP.set(normalizeLabel(alias), key));
    });

    function matchSectionHeader(rawLine) {
        const value = stripEmphasis(String(rawLine ?? "").replace(/^\s*#{1,6}\s*/, ""));
        if (!value || value.length > 140) return null;

        let candidate = value;
        let inline = "";
        const colonIndex = value.indexOf(":");

        if (colonIndex > 0) {
            candidate = value.slice(0, colonIndex).trim();
            inline = value.slice(colonIndex + 1).trim();
        }

        candidate = candidate
            .replace(/^(?:section\s+)?(?:\d+\s*[.)]|[ivx]+\s*[.)])\s*/i, "")
            .trim();

        const key = HEADER_LOOKUP.get(normalizeLabel(candidate));
        return key ? { key, inline } : null;
    }

    // "--- Page 2 ---" markers and "1 / 2" page numbers are ignored.
    const PAGE_MARKER = /^\s*(?:-{2,}\s*page\s+\d+\s*-{2,}|\d+\s*\/\s*\d+)\s*$/i;

    function splitDocument(text) {
        const sections = {};
        SECTION_ORDER.forEach(key => { sections[key] = []; });

        const preamble = [];
        const found = new Set();
        let active = null;

        String(text ?? "")
            .replace(/\r\n?/g, "\n")
            .replace(/\u00a0/g, " ")
            .replace(/\f/g, "\n")
            .split("\n")
            .forEach(rawLine => {
                if (PAGE_MARKER.test(rawLine)) return;

                const heading = matchSectionHeader(rawLine);

                if (heading) {
                    active = heading.key;
                    found.add(active);
                    if (heading.inline) sections[active].push(heading.inline);
                    return;
                }

                if (active) sections[active].push(rawLine);
                else preamble.push(rawLine);
            });

        return { sections, preamble, found };
    }

    function sectionTextForImport(type, text) {
        const parsed = splitDocument(text);

        if (parsed.found.size) {
            return {
                text: parsed.sections[type].join("\n").trim(),
                found: parsed.found.has(type)
            };
        }

        return {
            text: String(text ?? "")
                .split("\n")
                .filter(line => !PAGE_MARKER.test(line))
                .join("\n")
                .trim(),
            found: true
        };
    }

    /* =========================================================
       5. Dates and classification patterns
       ========================================================= */

    const MONTH =
        "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";

    const DATE_POINT =
        "(?:" + MONTH + "\\.?,?\\s+(?:\\d{4}|'?\\d{2})|(?:\\d{1,2}\\/)?\\d{4}|'\\d{2})(?!\\d)";

    const DATE_RANGE = new RegExp(
        "(?<![\\w/])(" + DATE_POINT + ")\\s*(?:–|—|-|\\bto\\b|\\buntil\\b)\\s*(" +
        DATE_POINT + "|present|current|now|ongoing|date)(?!\\w)",
        "i"
    );

    const DATE_SINGLE = new RegExp(
        "^(?:" + MONTH + "\\.?,?\\s+)?(?:\\d{1,2}\\/)?\\d{4}$", "i"
    );

    const DEGREE_WORDS =
        /\b(bachelor|master|ph\.?\s?d|doctor|doctorate|b\.?\s?sc|m\.?\s?sc|b\.?a\b|m\.?a\b|mba|diploma|certificate|degree|beng|meng|btech|mtech|associate|ged|a\.?a\.?s?)\b/i;

    const SCHOOL_STRONG = /universit|college|institute|academy|polytechnic/i;
    const SCHOOL_WORDS = /universit|college|school|institute|academy|polytechnic/i;

    const EMPLOYMENT_TYPES =
        /^(full[- ]?time|part[- ]?time|contract(or)?|freelance|internship|temporary|seasonal|self[- ]employed|volunteer)$/i;

    const LOCATION_LIKE =
        /^(remote|hybrid|on[- ]?site)\b|^[A-Z][A-Za-z .'-]+,\s*[A-Za-z .'-]+/i;

    // "Part Time · Remote Remote" → work mode "Remote" + location "Remote"
    const TRAILING_LOCATION =
        /^(.*\S)\s+(Remote(?:\s*\([^)]*\))?|Hybrid(?:\s*\([^)]*\))?|On-?site(?:\s*\([^)]*\))?)$/i;

    const GPA_LIKE =
        /^(?:(?:cumulative|overall)?\s*gpa\s*[:\-–]?\s*)?\d\.\d{1,2}(?:\s*\/\s*\d(?:\.\d+)?)?$/i;

    function formatEnd(value) {
        return /^(present|current|now|ongoing|date)$/i.test(value) ? "Present" : value;
    }

    function extractDateRange(value) {
        const source = String(value ?? "");
        const match = source.match(DATE_RANGE);
        if (!match) return null;

        const before = source.slice(0, match.index).replace(/[\s|·•,–—]+$/, "").trim();
        const after = source.slice(match.index + match[0].length).replace(/^[\s|·•,–—]+/, "").trim();

        return {
            start: clean(match[1]),
            end: formatEnd(clean(match[2])),
            without: [before, after].filter(Boolean).join(" | ")
        };
    }

    function setDates(type, item, start, end) {
        const [startKey, endKey] = type === "credentials"
            ? ["issueDate", "expiryDate"]
            : ["start", "end"];

        if (!item[startKey] && start) item[startKey] = start;
        if (!item[endKey] && end) item[endKey] = end;
    }

    function splitTrailingLocation(value) {
        const match = String(value).match(TRAILING_LOCATION);
        return match ? { rest: match[1].trim(), location: match[2].trim() } : null;
    }

    function isBullet(line) {
        return /^\s*(?:[•●▪◦‣*–-]|\d+[.)])\s+/.test(line);
    }

    function stripBullet(line) {
        return String(line).replace(/^\s*(?:[•●▪◦‣*–-]|\d+[.)])\s+/, "").trim();
    }

    function headerParts(value, splitDash = true) {
        let text = stripEmphasis(value).replace(/\s+[·•]\s+/g, " | ");
        if (splitDash) text = text.replace(/\s+[–—]\s+/g, " | ");

        return text
            .split("|")
            .map(part => stripEmphasis(part).replace(/[,;]+$/, "").trim())
            .filter(Boolean);
    }

    function alreadyIncluded(item, value) {
        const lower = value.toLowerCase();
        return Object.entries(item).some(([key, existing]) =>
            key !== "id" && typeof existing === "string" && existing &&
            existing.toLowerCase().includes(lower)
        );
    }

    /* =========================================================
       6. Labeled-field recognition
       ========================================================= */

    function fieldLabel(line, type) {
        const match = String(line).match(/^([A-Za-z][A-Za-z /&()'-]{1,45})\s*:\s*(.*)$/);
        if (!match) return null;

        const label = normalizeLabel(match[1]);
        const value = stripEmphasis(match[2]);

        const common = {
            location: "location", start: "start", "start date": "start", from: "start",
            end: "end", "end date": "end", to: "end",
            dates: "dates", date: "dates", "date range": "dates", duration: "dates"
        };

        const maps = {
            experience: {
                "job title": "role", position: "role", role: "role", title: "role",
                company: "company", employer: "company", organization: "company",
                organisation: "company", "employment type": "employmentType",
                "job type": "employmentType", achievements: "achievements",
                achievement: "achievements", responsibilities: "achievements",
                description: "achievements", highlights: "achievements"
            },
            education: {
                school: "school", institution: "school", university: "school",
                college: "school", "school name": "school", degree: "degree",
                qualification: "degree", program: "degree", programme: "degree",
                field: "field", major: "field", "field of study": "field",
                concentration: "field", details: "details", description: "details",
                coursework: "details", honors: "details", honours: "details",
                gpa: "gpa", grade: "gpa", "graduation year": "end",
                graduated: "end", "graduation date": "end"
            },
            projects: {
                project: "title", "project title": "title", "project name": "title",
                title: "title", name: "title", domain: "domain", category: "domain",
                tools: "tools", technologies: "tools", technology: "tools",
                "tech stack": "tools", frameworks: "tools",
                "associated with": "associatedWith", organization: "associatedWith",
                organisation: "associatedWith", company: "associatedWith",
                description: "description", details: "description",
                achievements: "description", outcome: "description", outcomes: "description"
            },
            credentials: {
                credential: "name", "credential name": "name", certification: "name",
                "certification name": "name", certificate: "name", license: "name",
                licence: "name", title: "name", name: "name", issuer: "issuer",
                "issuing organization": "issuer", "issuing organisation": "issuer",
                organization: "issuer", organisation: "issuer",
                "credential id": "credentialId", "credential number": "credentialId",
                "license number": "credentialId", "licence number": "credentialId",
                "certificate number": "credentialId", "issue date": "issueDate",
                issued: "issueDate", "date issued": "issueDate",
                "expiry date": "expiryDate", "expiration date": "expiryDate",
                expires: "expiryDate", "valid until": "expiryDate",
                summary: "summary", description: "summary"
            },
            languages: {
                language: "name", "language name": "name",
                proficiency: "proficiency", level: "proficiency", fluency: "proficiency"
            }
        };

        let key = maps[type]?.[label] || common[label];
        if (type === "credentials" && key === "start") key = "issueDate";
        if (type === "credentials" && key === "end") key = "expiryDate";

        return key ? { key, value } : null;
    }

    const MULTILINE_FIELDS = new Set(["details", "achievements", "description", "summary"]);

    const DEFAULT_MULTILINE = {
        education: "details",
        experience: "achievements",
        projects: "description",
        credentials: "summary"
    };

    // These sections keep "•" markers so paragraphs and bullets can be mixed.
    const KEEP_MARKERS = new Set(["education", "projects", "credentials"]);

    const PRIMARY_FIELDS = {
        education: new Set(["school", "degree"]),
        experience: new Set(["role", "company"]),
        projects: new Set(["title"]),
        credentials: new Set(["name"])
    };

    /* =========================================================
       7. Entry block splitting
       ========================================================= */

    function entryBlocks(text, type) {
        const blocks = [];
        let current = [];
        let flags = { primary: false, date: false, body: false, degree: false };
        let pendingBreak = false;

        const flush = () => {
            if (current.some(line => clean(line))) blocks.push(current);
            current = [];
            flags = { primary: false, date: false, body: false, degree: false };
        };

        String(text ?? "")
            .replace(/\r\n?/g, "\n")
            .split("\n")
            .forEach(rawLine => {
                const line = rawLine.trim();

                if (PAGE_MARKER.test(line)) return;

                if (!line || /^[-_=]{3,}$/.test(line)) {
                    if (current.length) pendingBreak = true;
                    return;
                }

                const label = fieldLabel(line, type);
                const bullet = isBullet(line);
                const primary = label && PRIMARY_FIELDS[type]?.has(label.key);
                const dated = !label && !bullet && Boolean(extractDateRange(line));
                const degreeLine =
                    type === "education" && !label && !bullet &&
                    line.length < 120 && DEGREE_WORDS.test(line);

                // A blank line only ends an entry if the next line looks like a new entry.
                if (pendingBreak) {
                    pendingBreak = false;

                    const continues =
                        bullet ||
                        (!label && !dated && (
                            /^[a-z(]/.test(line) ||
                            /:$/.test(line) ||
                            line.length > 110 ||
                            isSentenceLine(line)
                        ));

                    if (!continues) flush();
                }

                if (current.length) {
                    let startsNew = false;
                    let carry = [];

                    if (primary && flags.primary) {
                        startsNew = true;
                    } else if (dated && flags.date) {
                        startsNew = true;

                        // Move a title that sits directly above the date line into the new entry.
                        while (flags.body && carry.length < 2 && current.length > 1) {
                            const last = current[current.length - 1].trim();

                            if (
                                isBullet(last) || last.length > 90 || /[.!?]$/.test(last) ||
                                /^[a-z]/.test(last) || extractDateRange(last)
                            ) break;

                            carry.unshift(current.pop());
                        }
                    } else if (degreeLine && flags.degree) {
                        startsNew = true;
                    }

                    if (startsNew) {
                        flush();
                        current = carry;
                    }
                }

                current.push(rawLine);

                if (primary) flags.primary = true;
                if (dated) flags.date = true;
                if (bullet) flags.body = true;
                if (degreeLine) flags.degree = true;
            });

        flush();
        return blocks;
    }

    /* =========================================================
       8. Entry parsing
       ========================================================= */

    // Adds a line to a multiline field, joining wrapped continuation lines.
    function appendLine(item, key, rawLine, startsNewItem, keepMarker = false) {
        let text = stripEmphasis(stripBullet(rawLine));
        if (!text) return;

        if (keepMarker && isBullet(rawLine)) text = `• ${text}`;

        const existing = item[key] ? item[key].split("\n") : [];
        const previous = existing[existing.length - 1];

        if (
            !startsNewItem &&
            previous &&
            (/^[a-z(]/.test(text) || !/[.!?:;)]$/.test(previous))
        ) {
            existing[existing.length - 1] = `${previous} ${text}`;
        } else {
            existing.push(text);
        }

        item[key] = existing.join("\n");
    }

    // Classifies loose header values (used for single-line or label-free layouts).
    function assignParts(type, item, parts) {
        const values = parts.map(clean).filter(Boolean);

        if (type === "experience") {
            if (!item.role && values.length) item.role = values.shift();

            values.forEach(value => {
                if (alreadyIncluded(item, value)) return;

                if (EMPLOYMENT_TYPES.test(value) && !item.employmentType) {
                    item.employmentType = value;
                } else if (!item.company && !LOCATION_LIKE.test(value)) {
                    item.company = value;
                } else if (!item.location) {
                    item.location = value;
                } else if (!item.company) {
                    item.company = value;
                }
            });
        }

        if (type === "education") {
            values.forEach(value => {
                if (alreadyIncluded(item, value)) return;

                if (DATE_SINGLE.test(value)) {
                    if (!item.end) item.end = value;
                    else if (!item.start) {
                        item.start = item.end;
                        item.end = value;
                    }
                    return;
                }

                if (GPA_LIKE.test(value)) {
                    if (!item.gpa) item.gpa = value.replace(/^.*gpa\s*[:\-–]?\s*/i, "");
                    return;
                }

                if (!item.degree && DEGREE_WORDS.test(value) && !SCHOOL_STRONG.test(value)) {
                    item.degree = value;
                    return;
                }

                if (!item.school && (SCHOOL_WORDS.test(value) || item.degree)) {
                    item.school = value;
                    return;
                }

                if (!item.degree) {
                    item.degree = value;
                    return;
                }

                if (!item.location && LOCATION_LIKE.test(value)) {
                    item.location = value;
                    return;
                }

                if (!item.field) item.field = value;
                else if (!item.location) item.location = value;
            });
        }

        if (type === "projects") {
            if (!item.title && values.length) item.title = values.shift();

            values.forEach(value => {
                if (alreadyIncluded(item, value)) return;

                if (!item.tools && value.includes(",")) item.tools = value;
                else if (!item.domain) item.domain = value;
                else if (!item.associatedWith) item.associatedWith = value;
                else if (!item.tools) item.tools = value;
            });
        }

        if (type === "credentials") {
            if (!item.name && values.length) item.name = values.shift();

            values.forEach(value => {
                if (alreadyIncluded(item, value)) return;

                const expiry = value.match(/^(?:expires?|expiry|valid until)\s*:?\s*(.+)$/i);
                const issued = value.match(/^(?:issued|issue date)\s*:?\s*(.+)$/i);
                const id = value.match(/^(?:credential\s*(?:id|number)|license\s*(?:no|number)|id|#)\s*:?\s*(.+)$/i);

                if (expiry) item.expiryDate = expiry[1];
                else if (issued) item.issueDate = issued[1];
                else if (id) item.credentialId = id[1];
                else if (DATE_SINGLE.test(value)) {
                    if (!item.issueDate) item.issueDate = value;
                    else if (!item.expiryDate) item.expiryDate = value;
                } else if (!item.issuer) item.issuer = value;
                else if (!item.credentialId) item.credentialId = value;
            });
        }
    }

    function parseUnlabeledEntry(type, sourceLines) {
        const item = emptyItem(type);
        const remaining = sourceLines.map(line => line.trim()).filter(Boolean);
        const rows = [];

        // Header rows: up to three short lines before bullets or prose.
        while (remaining.length && rows.length < 3) {
            const line = remaining[0];

            if (isBullet(line) || /:$/.test(line) || line.length > 160) break;
            if (rows.length && (isSentenceLine(line) || line.length > 120)) break;

            rows.push(stripEmphasis(remaining.shift()));
        }

        let dateRow = -1;

        const texts = rows.map((row, index) => {
            const dates = extractDateRange(row);

            if (dates && dateRow === -1) {
                dateRow = index;
                setDates(type, item, dates.start, dates.end);
                return dates.without;
            }

            return row;
        });

        const segments = texts
            .map(text => headerParts(text, type !== "projects"))
            .filter(row => row.length);

        if (type === "experience") {
            if (dateRow === 0 && segments.length > 1) {
                // Layout: "Company .... Dates" / "Role · Type .... Location"
                const [company, ...restOfFirst] = segments[0];
                item.company = company || "";

                const second = segments.slice(1).flat();
                const trailing = second.length
                    ? splitTrailingLocation(second[second.length - 1])
                    : null;

                if (trailing) {
                    second[second.length - 1] = trailing.rest;
                    item.location = trailing.location;
                } else if (second.length > 1 && LOCATION_LIKE.test(second[second.length - 1])) {
                    item.location = second.pop();
                }

                item.role = second.shift() || "";
                item.employmentType = dedupe(second.filter(Boolean)).join(" · ");

                restOfFirst.forEach(value => {
                    if (!item.location && LOCATION_LIKE.test(value)) item.location = value;
                });
            } else {
                assignParts(type, item, segments.flat());
            }
        }

        if (type === "education" || type === "credentials") {
            assignParts(type, item, segments.flat());
        }

        if (type === "projects") {
            if (segments.length > 1) {
                // Layout: "Title .... Dates" / "Organization · Tools .... Domain"
                item.title = segments[0][0] || "";
                if (segments[0][1]) item.domain = segments[0][1];

                const [organization, ...tools] = segments[1];
                item.associatedWith = organization || "";
                item.tools = [...tools, ...segments.slice(2).flat()].join(", ");
            } else {
                assignParts(type, item, segments.flat());
            }
        }

        const multiline = DEFAULT_MULTILINE[type];
        const keep = KEEP_MARKERS.has(type);

        remaining.forEach(line => {
            appendLine(item, multiline, line, isBullet(line), keep);
        });

        return item;
    }

    function parseEntry(type, block) {
        const item = emptyItem(type);
        const headerLines = [];
        const keep = KEEP_MARKERS.has(type);
        let active = null;

        block.forEach(rawLine => {
            const line = rawLine.trim();
            if (!line) return;

            const label = fieldLabel(line, type);

            if (label) {
                if (label.key === "dates") {
                    const dates = extractDateRange(label.value);
                    if (dates) setDates(type, item, dates.start, dates.end);
                    else setDates(type, item, "", label.value);
                    active = null;
                    return;
                }

                if (MULTILINE_FIELDS.has(label.key)) {
                    if (label.value) appendLine(item, label.key, label.value, true, keep);
                    active = label.key;
                } else {
                    item[label.key] = /end|expiry/i.test(label.key)
                        ? formatEnd(label.value)
                        : label.value;
                    active = null;
                }
                return;
            }

            if (isBullet(line)) {
                if (!active) active = DEFAULT_MULTILINE[type];
                appendLine(item, active, line, true, keep);
                return;
            }

            if (active) {
                appendLine(item, active, line, false, keep);
                return;
            }

            headerLines.push(line);
        });

        if (headerLines.length) {
            const fallback = parseUnlabeledEntry(type, headerLines);
            const multiline = DEFAULT_MULTILINE[type];

            FIELD_SCHEMA[type].forEach(([key]) => {
                if (key === multiline) return;
                if (!clean(item[key]) && clean(fallback[key])) item[key] = fallback[key];
            });

            if (clean(fallback[multiline])) {
                item[multiline] = [fallback[multiline], item[multiline]]
                    .filter(Boolean)
                    .join("\n");
            }
        }

        return item;
    }

    function parseEntries(type, text) {
        return entryBlocks(text, type)
            .map(block => parseEntry(type, block))
            .filter(item => FIELD_SCHEMA[type].some(([key]) => clean(item[key])));
    }

    /* =========================================================
       9. Summary, skills, languages, and dispatch
       ========================================================= */

    function parseSummary(text) {
        return String(text ?? "")
            .split(/\n\s*\n/)
            .map(paragraph => lines(paragraph).join(" "))
            .filter(Boolean)
            .join("\n\n")
            .slice(0, 1200);
    }

    function parseSkills(text) {
        const merged = [];

        lines(text).forEach(rawLine => {
            const previous = merged[merged.length - 1];

            if (
                !isBullet(rawLine) && previous &&
                previous.includes(",") && !/[.;]$/.test(previous)
            ) {
                merged[merged.length - 1] = `${previous} ${rawLine}`;
            } else {
                merged.push(stripBullet(rawLine));
            }
        });

        const values = merged
            .map(line => stripEmphasis(line))
            .map(line => line.replace(/^[A-Za-z][A-Za-z &/+-]{1,40}:\s+/, ""))
            .flatMap(line => splitTopLevel(line, ",;|•"))
            .map(item => item.replace(/\.$/, "").trim())
            .filter(Boolean);

        return dedupe(values).join(", ");
    }

    function parseLanguageLine(line) {
        const item = emptyItem("languages");
        const value = stripEmphasis(stripBullet(line));

        // English [Native Proficiency] or French (Intermediate)
        const bracketed = value.match(/^(.*?)\s*[\[(]([^\])]+)[\])]\s*$/);

        if (bracketed) {
            item.name = clean(bracketed[1]);
            item.proficiency = clean(bracketed[2]);
            return item;
        }

        let parts = value.split("|");
        if (parts.length === 1) parts = value.split(/\s+[-–—]\s+/);
        if (parts.length === 1 && value.includes(":")) parts = value.split(":");
        if (parts.length === 1 && value.split(",").length === 2) parts = value.split(",");

        item.name = clean(parts[0]);
        item.proficiency = clean(parts.slice(1).join(" "));
        return item;
    }

    function parseLanguages(text) {
        const result = [];

        String(text ?? "")
            .split(/\n\s*\n/)
            .forEach(block => {
                const blockLines = lines(block);
                if (!blockLines.length) return;

                const labeled = blockLines.some(
                    line => fieldLabel(line, "languages")?.key === "name"
                );

                if (labeled) {
                    const item = emptyItem("languages");
                    blockLines.forEach(line => {
                        const label = fieldLabel(line, "languages");
                        if (label) item[label.key] = label.value;
                    });
                    if (item.name) result.push(item);
                    return;
                }

                blockLines
                    .flatMap(line =>
                        !/[(\[]/.test(line) && line.split(/[,|]/).length > 2
                            ? line.split(/[,|]/)
                            : [line]
                    )
                    .forEach(line => {
                        const item = parseLanguageLine(line);
                        if (item.name) result.push(item);
                    });
            });

        const seen = new Set();
        return result.filter(item => {
            const key = `${item.name}|${item.proficiency}`.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }

    function parseSection(type, text) {
        if (type === "summary") return parseSummary(text);
        if (type === "skills") return parseSkills(text);
        if (type === "languages") return parseLanguages(text);
        return parseEntries(type, text);
    }

    function parsedHasContent(value) {
        return Array.isArray(value) ? value.length > 0 : clean(value).length > 0;
    }

    function parsedCount(type, value) {
        if (Array.isArray(value)) return value.length;
        if (type === "skills") return splitList(value).length;
        return clean(value) ? 1 : 0;
    }

    /* =========================================================
       10. Applying imports
       ========================================================= */

    function applySection(type, value, mode) {
        if (type === "summary") {
            state.resume.summary =
                mode === "append" && clean(state.resume.summary)
                    ? `${state.resume.summary}\n\n${value}`.slice(0, 1200)
                    : value;
            return;
        }

        if (type === "skills") {
            state.resume.skills = mode === "append"
                ? dedupe([...splitList(state.resume.skills), ...splitList(value)]).join(", ")
                : value;
            return;
        }

        state.resume[type] = mode === "append" ? [...state.resume[type], ...value] : value;
    }

    function importMode() {
        return $("#import-mode").value === "append" ? "append" : "replace";
    }

    function refreshAfterImport() {
        syncInputs();
        renderEditors();
        renderAll();
        saveState();
    }

    function readPreambleMetadata(preamble) {
        const metadata = { title: "", location: "" };

        preamble.forEach(rawLine => {
            const match = rawLine.match(
                /^\s*(professional title|job title|title|target role|location)\s*:\s*(.+)$/i
            );
            if (!match) return;

            if (normalizeLabel(match[1]) === "location") metadata.location = clean(match[2]);
            else metadata.title = clean(match[2]);
        });

        return metadata;
    }

    function autofillDocument() {
        const source = $("#global-source").value.trim();
        const report = $("#global-report");
        report.className = "import-report";

        if (!source) {
            report.classList.add("error");
            report.textContent = "Paste a complete resume first.";
            return;
        }

        const documentData = splitDocument(source);

        if (!documentData.found.size) {
            report.classList.add("error");
            report.textContent =
                "No recognized section headers were found.\n" +
                "Use headings such as SUMMARY, EDUCATION, EXPERIENCE, PROJECTS, CERTIFICATIONS, " +
                "SKILLS, and LANGUAGES, or use an individual section importer.";
            return;
        }

        const loaded = [];
        const empty = [];
        const mode = importMode();

        SECTION_ORDER.forEach(type => {
            if (!documentData.found.has(type)) return;

            const value = parseSection(type, documentData.sections[type].join("\n").trim());

            if (!parsedHasContent(value)) {
                empty.push(SECTION_LABELS[type]);
                return;
            }

            applySection(type, value, mode);
            loaded.push(`${SECTION_LABELS[type]} (${parsedCount(type, value)})`);
        });

        // Only explicitly labeled title/location are imported. Protected fields are never touched.
        const metadata = readPreambleMetadata(documentData.preamble);

        if (metadata.title) {
            state.resume.title = metadata.title;
            if (!clean(state.targetRole)) state.targetRole = metadata.title;
            loaded.push("Professional Title");
        }

        if (metadata.location) {
            state.resume.location = metadata.location;
            loaded.push("Location");
        }

        if (!loaded.length) {
            report.classList.add("error");
            report.textContent =
                "Headers were found, but no usable section content could be extracted. Review the source formatting.";
            return;
        }

        refreshAfterImport();

        const untouched = SECTION_ORDER
            .filter(type => !documentData.found.has(type))
            .map(type => SECTION_LABELS[type]);

        report.classList.add("success");
        report.textContent =
            `${mode === "append" ? "Added" : "Loaded"}: ${loaded.join(", ")}.\n` +
            (untouched.length ? `Left unchanged: ${untouched.join(", ")}.\n` : "") +
            (empty.length ? `Detected but empty: ${empty.join(", ")}.\n` : "") +
            "Protected contact fields were not changed. Review all imported entries.";

        showToast("Document autofill completed.");
    }

    function autofillOneSection(type) {
        const source = $(`[data-section-source="${type}"]`).value.trim();
        const report = $(`[data-section-report="${type}"]`);
        report.className = "import-report";

        if (!source) {
            report.classList.add("error");
            report.textContent = `Paste ${SECTION_LABELS[type]} content first.`;
            return;
        }

        const extracted = sectionTextForImport(type, source);

        if (!extracted.found || !extracted.text) {
            report.classList.add("error");
            report.textContent =
                `The ${SECTION_LABELS[type]} section was not found in the pasted text. ` +
                "Check its header or paste only this section's content.";
            return;
        }

        const value = parseSection(type, extracted.text);

        if (!parsedHasContent(value)) {
            report.classList.add("error");
            report.textContent =
                "Content was found, but no usable entries could be extracted. " +
                "Try labeled fields or pipe-separated entry headers.";
            return;
        }

        applySection(type, value, importMode());
        refreshAfterImport();

        const count = parsedCount(type, value);
        report.classList.add("success");
        report.textContent =
            `${SECTION_LABELS[type]} autofilled: ${count} item${count === 1 ? "" : "s"}. ` +
            "Other sections and protected contact fields were not changed.";

        showToast(`${SECTION_LABELS[type]} autofilled.`);
    }

    /* =========================================================
       11. Section importer interface
       ========================================================= */

    const IMPORTER_HELP = {
        summary: "Paste only summary text, or text beginning with a Summary header.",
        education: "Line 1: institution + dates. Line 2: degree · field · GPA + location. Then a description, sub-labels ending with ':' and • bullets.",
        experience: "Line 1: company + dates. Line 2: job title · type + location. Then • bullets. Separate roles with blank lines.",
        projects: "Line 1: project title + dates. Line 2: organization · tools. Then a paragraph or • bullets.",
        credentials: "Line 1: credential name + dates. Line 2: issuer · credential ID.",
        skills: "Paste a comma-separated list, bullet list, or categorized skill list.",
        languages: "One language per line: English [Native Proficiency] or Spanish | Professional."
    };

    function defaultSectionReport(type) {
        return `This importer changes only ${SECTION_LABELS[type]}.`;
    }

    function renderSectionImporters() {
        $$("[data-importer]").forEach(container => {
            const type = container.dataset.importer;
            const label = SECTION_LABELS[type];

            container.innerHTML = `
                <details>
                    <summary>Autofill ${escapeHTML(label)} only</summary>
                    <div class="section-importer-body">
                        <p class="section-importer-help">${escapeHTML(IMPORTER_HELP[type])}</p>
                        <textarea class="input input-compact" rows="4"
                            data-section-source="${type}"
                            placeholder="Paste ${escapeHTML(label)} content here..."></textarea>
                        <div class="import-actions" style="margin-top:8px">
                            <button class="btn btn-primary btn-small" data-autofill-section="${type}">
                                Autofill ${escapeHTML(label)}
                            </button>
                            <button class="btn btn-small" data-clear-section="${type}">Clear</button>
                        </div>
                        <div class="import-report" data-section-report="${type}">
                            ${escapeHTML(defaultSectionReport(type))}
                        </div>
                    </div>
                </details>
            `;
        });
    }

    /* =========================================================
       12. Repeatable section editors
       ========================================================= */

    function renderCollectionEditor(type) {
        const container = $(`#${type}-list`);
        if (!container) return;

        const items = state.resume[type];

        if (!items.length) {
            container.innerHTML =
                `<div class="empty">No entries yet. Use section autofill or select “+ Add”.</div>`;
            return;
        }

        container.innerHTML = items.map((item, index) => `
            <div class="entry" data-entry-id="${item.id}">
                <div class="entry-header">
                    <strong>${escapeHTML(SECTION_LABELS[type])} ${index + 1}</strong>
                    <button class="remove" data-remove="${type}" data-id="${item.id}">Remove</button>
                </div>
                <div class="form-grid">
                    ${FIELD_SCHEMA[type].map(([key, label, placeholder, inputType = "input", full = false]) => `
                        <label class="field ${full ? "field-full" : ""}">
                            <span>${escapeHTML(label)}</span>
                            ${inputType === "textarea"
                                ? `<textarea class="input" rows="4" data-collection="${type}" data-field="${key}"
                                       placeholder="${escapeHTML(placeholder)}">${escapeHTML(item[key])}</textarea>`
                                : `<input class="input" data-collection="${type}" data-field="${key}"
                                       value="${escapeHTML(item[key])}" placeholder="${escapeHTML(placeholder)}">`}
                        </label>
                    `).join("")}
                </div>
            </div>
        `).join("");
    }

    function renderEditors() {
        Object.keys(FIELD_SCHEMA).forEach(renderCollectionEditor);
    }

    function addItem(type) {
        state.resume[type].push(emptyItem(type));
        renderCollectionEditor(type);
        renderAll();
        scheduleSave();
        $$(`#${type}-list .entry`).at(-1)?.querySelector("input, textarea")?.focus();
    }

    /* =========================================================
       13. Resume preview (the single source for the PDF)
       ========================================================= */

    const MONTH_NUMBERS = {
        jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
        jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
    };

    function dateNumber(value, isEnd) {
        const text = clean(value).toLowerCase();
        if (!text) return 0;
        if (/present|current|now|ongoing/.test(text)) return 999999;

        let year = Number(text.match(/\d{4}/)?.[0] || 0);

        if (!year) {
            const short = text.match(/'?(\d{2})\b/);
            if (short) year = 2000 + Number(short[1]);
        }

        if (!year) return 0;

        const month = MONTH_NUMBERS[text.match(/[a-z]{3}/)?.[0]] || (isEnd ? 12 : 1);
        return year * 100 + month;
    }

    function reverseChronological(items) {
        const weight = item => dateNumber(item.end, true) || dateNumber(item.start, false);

        return items
            .map((item, index) => ({ item, index }))
            .sort((a, b) => weight(b.item) - weight(a.item) || a.index - b.index)
            .map(entry => entry.item);
    }

    function rangeText(start, end) {
        return [clean(start), clean(end)].filter(Boolean).join(" – ");
    }

    const joinDot = values => values.map(clean).filter(Boolean).join(" · ");

    /*
     * Renders body text:
     *  - lines starting with • become bullets
     *  - lines ending with : become bold sub-labels
     *  - other lines become paragraphs (sentences joined, short lines kept separate)
     *  - bulletsByDefault turns every line into a bullet (Experience)
     */
    function richBody(value, bulletsByDefault) {
        const output = [];
        let list = [];
        let paragraph = [];
        let previousText = "";

        const flushList = () => {
            if (!list.length) return;
            output.push(`<ul class="cv-bullets">${list.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ul>`);
            list = [];
        };

        const flushParagraph = () => {
            if (!paragraph.length) return;
            output.push(`<p class="cv-para">${paragraph.join("")}</p>`);
            paragraph = [];
        };

        lines(value).forEach(line => {
            const bullet = /^[•●▪◦‣*–-]\s+/.test(line);
            const text = stripBullet(line);
            if (!text) return;

            if (bullet || bulletsByDefault) {
                flushParagraph();
                list.push(text);
                return;
            }

            if (/:$/.test(text)) {
                flushList();
                flushParagraph();
                output.push(`<div class="cv-sublabel">${escapeHTML(text)}</div>`);
                return;
            }

            flushList();

            if (paragraph.length) {
                paragraph.push(/[.!?]$/.test(previousText) ? " " : "<br>");
            }

            paragraph.push(escapeHTML(text));
            previousText = text;
        });

        flushList();
        flushParagraph();

        return output.length ? `<div class="cv-body">${output.join("")}</div>` : "";
    }

    // Two-line entry: bold subheading + dates, then bold-italic subheading + location.
    function entryHTML({ primary, date, secondary, place, body }) {
        const top = clean(primary) || clean(date)
            ? `<div class="cv-line">
                   <span class="cv-primary">${escapeHTML(primary)}</span>
                   ${clean(date) ? `<span class="cv-date">${escapeHTML(date)}</span>` : ""}
               </div>`
            : "";

        const sub = clean(secondary) || clean(place)
            ? `<div class="cv-line cv-line-sub">
                   <span class="cv-secondary">${escapeHTML(secondary)}</span>
                   ${clean(place) ? `<span class="cv-place">${escapeHTML(place)}</span>` : ""}
               </div>`
            : "";

        return `<div class="cv-entry">${top}${sub}${body || ""}</div>`;
    }

    function cvSection(title, inner) {
        return `
            <section class="cv-section">
                <h2 class="cv-heading">${escapeHTML(title)}</h2>
                ${inner}
            </section>
        `;
    }

    function buildResumeHTML() {
        const r = state.resume;
        const name = clean(r.name);
        const title = clean(r.title);
        const contact = [r.email, r.phone, r.location, r.website, r.portfolio]
            .map(clean)
            .filter(Boolean);

        let html = `
            <header class="cv-header">
                <h1 class="cv-name${name ? "" : " cv-ph"}">${escapeHTML(name || "Your Name")}</h1>
                ${title ? `<div class="cv-title">${escapeHTML(title)}</div>` : ""}
                <div class="cv-contact${contact.length ? "" : " cv-ph"}">
                    ${contact.length
                        ? contact.map(escapeHTML).join('<span class="cv-sep">|</span>')
                        : "Email | Phone | Address"}
                </div>
            </header>
        `;

        const sections = [];

        // 1. SUMMARY: standalone paragraph(s)
        if (clean(r.summary)) {
            sections.push(cvSection(
                "Summary",
                r.summary
                    .split(/\n\s*\n/)
                    .map(paragraph => clean(paragraph))
                    .filter(Boolean)
                    .map(paragraph => `<p class="cv-summary">${escapeHTML(paragraph)}</p>`)
                    .join("")
            ));
        }

        // 2. EDUCATION
        const education = reverseChronological(
            r.education.filter(item => clean(item.school) || clean(item.degree))
        );

        if (education.length) {
            sections.push(cvSection("Education", education.map(item => entryHTML({
                primary: clean(item.school) || clean(item.degree),
                date: rangeText(item.start, item.end),
                secondary: joinDot([
                    clean(item.school) ? item.degree : "",
                    item.field,
                    clean(item.gpa) ? `GPA - ${clean(item.gpa)}` : ""
                ]),
                place: item.location,
                body: richBody(item.details, false)
            })).join("")));
        }

        // 3. EXPERIENCE
        const experience = reverseChronological(
            r.experience.filter(item =>
                clean(item.role) || clean(item.company) || clean(item.achievements)
            )
        );

        if (experience.length) {
            sections.push(cvSection("Experience", experience.map(item => {
                const hasCompany = Boolean(clean(item.company));

                return entryHTML({
                    primary: hasCompany ? item.company : item.role,
                    date: rangeText(item.start, item.end),
                    secondary: hasCompany
                        ? joinDot([item.role, item.employmentType])
                        : joinDot([item.employmentType]),
                    place: item.location,
                    body: richBody(item.achievements, true)
                });
            }).join("")));
        }

        // 4. PROJECTS (kept in the order entered)
        const projects = r.projects.filter(item => clean(item.title) || clean(item.description));

        if (projects.length) {
            sections.push(cvSection("Projects", projects.map(item => entryHTML({
                primary: item.title,
                date: rangeText(item.start, item.end),
                secondary: joinDot([item.associatedWith, item.tools]),
                place: item.domain,
                body: richBody(item.description, false)
            })).join("")));
        }

        // 5. CERTIFICATIONS
        const credentials = r.credentials.filter(item => clean(item.name) || clean(item.issuer));

        if (credentials.length) {
            sections.push(cvSection("Certifications", credentials.map(item => entryHTML({
                primary: clean(item.name) || clean(item.issuer),
                date: rangeText(item.issueDate, item.expiryDate),
                secondary: joinDot([clean(item.name) ? item.issuer : "", item.credentialId]),
                place: "",
                body: richBody(item.summary, false)
            })).join("")));
        }

        // 6. SKILLS
        const skills = splitList(r.skills);

        if (skills.length) {
            sections.push(cvSection(
                "Skills",
                `<p class="cv-plain"><span class="cv-label">Skills:</span> ${skills.map(escapeHTML).join(", ")}</p>`
            ));
        }

        // 7. LANGUAGES
        const languages = r.languages.filter(item => clean(item.name));

        if (languages.length) {
            sections.push(cvSection(
                "Languages",
                `<div class="cv-lines">${languages.map(item => `
                    <div>${escapeHTML(item.name)}${clean(item.proficiency)
                        ? ` [${escapeHTML(item.proficiency)}]`
                        : ""}</div>
                `).join("")}</div>`
            ));
        }

        html += sections.length
            ? sections.join("")
            : `<p class="cv-empty cv-ph">Autofill or complete the sections to build your resume.</p>`;

        return html;
    }

    function pageDimensions() {
        return state.settings.pageSize === "a4"
            ? { width: 793.7, height: 1122.5 }
            : { width: 816, height: 1056 };
    }

    function fitPreview() {
        const viewport = $("#resume-viewport");
        const page = $("#resume-document");
        if (!viewport || !page) return;

        const { width, height } = pageDimensions();

        page.style.width = `${width}px`;
        page.style.minHeight = `${height}px`;

        const available = viewport.clientWidth || width;
        const scale = Math.min(1, available / width);

        page.style.transform = `scale(${scale})`;
        viewport.style.height = `${Math.ceil(page.offsetHeight * scale)}px`;
    }

    function renderResumePreview() {
        $("#resume-document").innerHTML = buildResumeHTML();
        fitPreview();
    }

    function renderLinkedInPreview() {
        const name = clean(state.resume.name) || "Your Name";
        const profile = state.linkedin;

        $("#linkedin-name").textContent = name;
        $("#linkedin-avatar").textContent = name === "Your Name"
            ? "YN"
            : name.split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase();

        $("#linkedin-headline").textContent =
            clean(profile.headline) || "Add a headline that communicates your role and value.";

        $("#linkedin-location").textContent = [
            clean(state.resume.location) || "Location",
            clean(profile.industry) || "Industry"
        ].join(" | ");

        $("#linkedin-about").textContent =
            clean(profile.about) || "Your About section will appear here.";

        $("#linkedin-skills").textContent =
            splitList(profile.skills).join(" | ") || "Your featured skills will appear here.";

        const highlights = lines(profile.highlights);
        $("#linkedin-highlights").innerHTML = highlights.length
            ? highlights.map(item => `<li>${escapeHTML(item)}</li>`).join("")
            : "<li>Add measurable achievements to strengthen your profile.</li>";
    }

    /* =========================================================
       14. Quality signals
       ========================================================= */

    function resumeContent() {
        const r = state.resume;
        return [
            r.title, r.summary, r.skills, state.targetRole,
            ...r.experience.flatMap(item => [item.role, item.company, item.achievements]),
            ...r.projects.flatMap(item => [item.title, item.domain, item.tools, item.description]),
            ...r.credentials.flatMap(item => [item.name, item.issuer])
        ].join(" ");
    }

    function renderQuality() {
        const r = state.resume;
        const suggestions = [];
        let score = 0;

        const award = (condition, points, suggestion) => {
            if (condition) score += points;
            else if (suggestion) suggestions.push(suggestion);
        };

        award(clean(r.name), 5, "Add your full name.");
        award(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(r.email)), 5, "Add a valid email address.");
        award(clean(r.phone), 5, "Add your phone number.");
        award(clean(r.summary).length >= 120, 15, "Expand your summary to at least 120 characters.");
        award(r.education.some(item => item.school || item.degree), 10, "Add an education entry.");
        award(r.experience.some(item => item.role && item.company), 15, "Add a role with both job title and company.");

        const achievements = r.experience.flatMap(item => lines(item.achievements));

        award(achievements.length >= 3, 8, "Write at least three accomplishment statements.");
        award(achievements.some(item => /\d/.test(item)), 7, "Quantify at least one achievement.");
        award(splitList(r.skills).length >= 5, 10, "Add at least five relevant skills.");
        award(r.projects.some(item => item.title), 5, "Add a relevant project.");
        award(r.languages.some(item => item.name), 3, "Add your language proficiencies.");
        award(r.credentials.some(item => item.name), 2, "Add relevant certifications where applicable.");

        const keywords = splitList(state.targetKeywords);
        const content = resumeContent().toLowerCase();
        const matched = keywords.filter(keyword => content.includes(keyword.toLowerCase()));

        if (keywords.length) score += Math.round(10 * matched.length / keywords.length);
        score = Math.min(100, score);

        $("#resume-score").textContent = score;
        $("#quality-title").textContent =
            score >= 85 ? "Excellent resume foundation" :
            score >= 65 ? "Strong, with room to refine" :
            score >= 40 ? "Good foundation—keep building" :
            "Start building your resume";

        $("#keyword-status").textContent = keywords.length
            ? `${matched.length} of ${keywords.length} target keywords currently appear.`
            : "Add target keywords to measure job-description alignment.";

        $("#resume-suggestions").innerHTML = (
            suggestions.length
                ? suggestions.slice(0, 4)
                : ["Strong coverage. Tailor your resume for each application."]
        ).map(item => `<li>${escapeHTML(item)}</li>`).join("");
    }

    function renderAll() {
        renderResumePreview();
        renderLinkedInPreview();
        renderQuality();

        $("#summary-count").textContent =
            `${state.resume.summary.length.toLocaleString()} / 1,200`;
        $("#headline-count").textContent = `${state.linkedin.headline.length} / 220`;
        $("#about-count").textContent =
            `${state.linkedin.about.length.toLocaleString()} / 2,600`;
    }

    /* =========================================================
       15. PDF export: prints the exact preview
       ========================================================= */

    function hasResumeContent() {
        const r = state.resume;
        return [
            r.summary, r.skills,
            ...r.education.map(item => item.school || item.degree),
            ...r.experience.map(item => item.role || item.company || item.achievements),
            ...r.projects.map(item => item.title || item.description),
            ...r.languages.map(item => item.name),
            ...r.credentials.map(item => item.name || item.issuer)
        ].some(value => clean(value));
    }

    function exportResumePDF() {
        if (!hasResumeContent()) {
            showToast("Add or autofill resume content before downloading.");
            return;
        }

        renderResumePreview();

        // Copy the preview and remove on-screen placeholders only.
        const copy = $("#resume-document").cloneNode(true);
        copy.removeAttribute("style");
        copy.querySelectorAll(".cv-ph").forEach(node => node.remove());

        const resumeCSS = $("#resume-styles").textContent;
        const pageSize = state.settings.pageSize === "a4" ? "A4" : "letter";

        const printCSS = `
            @page {
                size: ${pageSize} portrait;
                margin: 0.6in 0.6in 0.75in;
                @bottom-center {
                    content: counter(page) " / " counter(pages);
                    font-family: Cambria, Georgia, "Times New Roman", serif;
                    font-size: 9pt;
                    color: #64748b;
                }
            }
            html, body { margin: 0; padding: 0; background: #ffffff; }
            #resume-document {
                width: auto !important;
                min-height: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                transform: none !important;
                box-shadow: none !important;
                border: 0 !important;
            }
            #resume-document .cv-header { break-inside: avoid; }
            #resume-document .cv-heading,
            #resume-document .cv-entry > .cv-line,
            #resume-document .cv-sublabel { break-after: avoid; page-break-after: avoid; }
            #resume-document .cv-bullets li,
            #resume-document .cv-para { break-inside: avoid; page-break-inside: avoid; }
        `;

        const fileTitle = `${clean(state.resume.name) || "Professional"} Resume`;

        const frame = document.createElement("iframe");
        frame.setAttribute("aria-hidden", "true");
        Object.assign(frame.style, {
            position: "fixed", right: "0", bottom: "0",
            width: "0", height: "0", border: "0", visibility: "hidden"
        });

        document.body.appendChild(frame);

        let removed = false;
        const cleanup = () => {
            if (removed) return;
            removed = true;
            frame.remove();
        };

        const frameDocument = frame.contentDocument;
        const frameWindow = frame.contentWindow;

        if (!frameDocument || !frameWindow) {
            cleanup();
            showToast("The PDF could not be prepared in this browser.");
            return;
        }

        frameDocument.open();
        frameDocument.write(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>${escapeHTML(fileTitle)}</title>
<style>${resumeCSS}</style>
<style>${printCSS}</style>
</head>
<body>${copy.outerHTML}</body>
</html>`);
        frameDocument.close();

        frameWindow.addEventListener("afterprint", () => setTimeout(cleanup, 500));

        (async () => {
            try {
                if (frameDocument.fonts?.ready) await frameDocument.fonts.ready;
            } catch {
                /* continue with available fonts */
            }

            setTimeout(() => {
                frameWindow.focus();
                frameWindow.print();
            }, 150);
        })();

        showToast("Choose “Save as PDF” and turn off “Headers and footers”.");
        setTimeout(cleanup, 120000);
    }

    /* =========================================================
       16. Navigation and LinkedIn tools
       ========================================================= */

    function setView(view) {
        state.view = view === "linkedin" ? "linkedin" : "resume";

        $$("[data-view]").forEach(button => {
            button.classList.toggle("active", button.dataset.view === state.view);
        });

        $("#resume-view").hidden = state.view !== "resume";
        $("#linkedin-view").hidden = state.view !== "linkedin";

        if (state.view === "resume") requestAnimationFrame(fitPreview);
        scheduleSave();
    }

    function suggestHeadline() {
        if (
            clean(state.linkedin.headline) &&
            !confirm("Replace your current headline with a new draft?")
        ) return;

        const role = clean(state.targetRole || state.resume.title) || "Your Target Role";
        const skills = splitList(state.linkedin.skills).length
            ? splitList(state.linkedin.skills)
            : splitList(state.resume.skills);

        const specialties = dedupe([...skills, ...splitList(state.targetKeywords)]).slice(0, 2);

        state.linkedin.headline = (
            `${role} | ${specialties.join(" & ") || "Strategy & Execution"} | ` +
            "Turning expertise into measurable impact"
        ).slice(0, 220);

        syncInputs();
        renderAll();
        scheduleSave();
    }

    async function copyLinkedIn() {
        const profile = state.linkedin;
        const text = [
            clean(state.resume.name),
            clean(profile.headline),
            "",
            "ABOUT",
            clean(profile.about),
            "",
            "FEATURED SKILLS",
            splitList(profile.skills).join(" | "),
            "",
            "SELECTED IMPACT",
            ...lines(profile.highlights).map(item => `- ${item}`)
        ].join("\n").trim();

        try {
            await navigator.clipboard.writeText(text);
            showToast("LinkedIn content copied.");
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.position = "fixed";
            textarea.style.opacity = "0";
            document.body.appendChild(textarea);
            textarea.select();
            const copied = document.execCommand("copy");
            textarea.remove();
            showToast(copied ? "LinkedIn content copied." : "Copy was blocked by the browser.");
        }
    }

    /* =========================================================
       17. Backup, new resume, and reset
       ========================================================= */

    function exportJSON() {
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = "career-studio-workspace.json";
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    async function importJSON(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            state = normalizeState(JSON.parse(await file.text()));
            refreshAfterImport();
            setView(state.view);
            showToast("Workspace imported successfully.");
        } catch {
            showToast("That is not a valid Career Studio workspace.");
        } finally {
            event.target.value = "";
        }
    }

    function clearImportSources() {
        $("#global-source").value = "";
        $$("[data-section-source]").forEach(input => { input.value = ""; });
    }

    function resetImportReports(globalMessage) {
        const globalReport = $("#global-report");
        globalReport.className = "import-report";
        globalReport.textContent = globalMessage;

        $$("[data-section-report]").forEach(report => {
            report.className = "import-report";
            report.textContent = defaultSectionReport(report.dataset.sectionReport);
        });
    }

    function clearResume() {
        if (!confirm(
            "Start a new resume?\n\nThis clears all resume fields, including your name and contact " +
            "information. Your LinkedIn optimizer content will be preserved."
        )) return;

        state.resume = emptyState().resume;
        state.targetRole = "";
        state.targetKeywords = "";

        clearImportSources();
        resetImportReports("New resume started. Paste a complete resume or complete the sections manually.");
        refreshAfterImport();
        setView("resume");

        showToast("Resume cleared. Your LinkedIn content was preserved.");
    }

    function resetWorkspace() {
        if (!confirm("Clear all resume and LinkedIn content in this workspace?")) return;

        state = emptyState();

        clearImportSources();
        resetImportReports("Waiting for a complete resume. Undetected sections remain unchanged.");
        refreshAfterImport();
        setView("resume");

        showToast("Workspace cleared.");
    }

    /* =========================================================
       18. Events
       ========================================================= */

    function handleFieldChange(event) {
        const input = event.target;

        if (input.dataset.bind) {
            if (getPath(input.dataset.bind) === input.value) return;

            setPath(input.dataset.bind, input.value);
            if (["targetRole", "targetKeywords"].includes(input.dataset.bind)) syncInputs();

            renderAll();
            scheduleSave();
            return;
        }

        if (input.dataset.collection) {
            const type = input.dataset.collection;
            const id = input.closest("[data-entry-id]")?.dataset.entryId;
            const item = state.resume[type].find(entry => entry.id === id);

            if (!item || item[input.dataset.field] === input.value) return;

            item[input.dataset.field] = input.value;
            renderAll();
            scheduleSave();
        }
    }

    document.addEventListener("input", handleFieldChange);
    document.addEventListener("change", handleFieldChange);

    document.addEventListener("click", event => {
        const button = event.target.closest("button");
        if (!button) return;

        if (button.dataset.view) {
            setView(button.dataset.view);
            return;
        }

        if (button.dataset.add) {
            addItem(button.dataset.add);
            return;
        }

        if (button.dataset.remove) {
            const type = button.dataset.remove;
            state.resume[type] = state.resume[type].filter(item => item.id !== button.dataset.id);
            renderCollectionEditor(type);
            renderAll();
            scheduleSave();
            return;
        }

        if (button.dataset.autofillSection) {
            autofillOneSection(button.dataset.autofillSection);
            return;
        }

        if (button.dataset.clearSection) {
            const type = button.dataset.clearSection;
            $(`[data-section-source="${type}"]`).value = "";

            const report = $(`[data-section-report="${type}"]`);
            report.className = "import-report";
            report.textContent = `Source cleared. Your ${SECTION_LABELS[type]} entries remain unchanged.`;
            return;
        }

        const actions = {
            "autofill-document": autofillDocument,
            "clear-global": () => {
                $("#global-source").value = "";
                const report = $("#global-report");
                report.className = "import-report";
                report.textContent = "Source cleared. Your existing resume sections remain unchanged.";
            },
            "new-resume": clearResume,
            "download-pdf": exportResumePDF,
            print: exportResumePDF,
            "suggest-headline": suggestHeadline,
            "copy-linkedin": copyLinkedIn,
            "export-json": exportJSON,
            "import-json": () => $("#workspace-file").click(),
            reset: resetWorkspace
        };

        actions[button.dataset.action]?.();
    });

    $("#workspace-file").addEventListener("change", importJSON);

    let resizeTimer;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(fitPreview, 80);
    });

    document.fonts?.ready?.then(fitPreview);

    /* =========================================================
       19. Initialize
       ========================================================= */

    renderSectionImporters();
    syncInputs();
    renderEditors();
    setView(state.view);
    renderAll();
})();