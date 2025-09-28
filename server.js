import express from "express";
import path from "path";
import { readFileSync, readdirSync, existsSync } from "fs";
import dotenv from "dotenv";

dotenv.config();

const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
if (!apiKey) {
    console.warn("Warning: OPENAI_API_KEY (or API_KEY) is not set. The /token endpoint will fail until you provide it.");
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static(process.cwd()));

app.get("/", (req, res) => {
    res.sendFile(path.resolve("frontend.html"));
});

const toolsConfigPath = process.env.MCP_TOOLS_PATH || path.resolve("tools.json");

const resolveEnvPlaceholders = (input) => {
    if (Array.isArray(input)) {
        return input.map(resolveEnvPlaceholders);
    }
    if (input && typeof input === "object") {
        return Object.fromEntries(
            Object.entries(input).map(([key, value]) => [key, resolveEnvPlaceholders(value)])
        );
    }
    if (typeof input === "string" && input.startsWith("$")) {
        const envKey = input.slice(1);
        return process.env[envKey] ?? input;
    }
    return input;
};

const loadToolsConfig = () => {
    try {
        const raw = readFileSync(toolsConfigPath, "utf8");
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
            console.warn(`Tool configuration at ${toolsConfigPath} must be an array. No tools will be configured.`);
            return [];
        }

        return resolveEnvPlaceholders(parsed);
    } catch (error) {
        if (error.code === "ENOENT") {
            console.warn(`Tool configuration file not found at ${toolsConfigPath}. No tools will be configured.`);
        } else if (error.name === "SyntaxError") {
            console.warn(`Tool configuration file at ${toolsConfigPath} contains invalid JSON. No tools will be configured.`);
        } else {
            console.warn(`Failed to read tool configuration at ${toolsConfigPath}:`, error.message);
        }
        return [];
    }
};

const presetsDir = path.resolve("presets");

const sanitizePresetId = (value) => /^(?:[a-zA-Z0-9_-]+)$/.test(value || "");

const parsePresetContent = (content, id) => {
    const result = { id, name: id, icon: null, prompt: content.trim() };
    if (!content) {
        result.prompt = "";
        return result;
    }

    let body = content.replace(/^\ufeff/, "");
    const frontMatterMatch = body.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n)?/);
    const metadata = {};

    if (frontMatterMatch) {
        const rawBlock = frontMatterMatch[1]
            .split(/\r?\n/)
            .map((line) => line.trim())
            .filter(Boolean);

        for (const line of rawBlock) {
            if (line === "\u8a2d\u5b9a" || line.toLowerCase() === "settings") {
                continue;
            }
            const colonIndex = line.indexOf(":");
            if (colonIndex === -1) {
                continue;
            }
            const key = line.slice(0, colonIndex).trim();
            const value = line.slice(colonIndex + 1).trim();
            if (key) {
                metadata[key] = value;
            }
        }

        body = body.slice(frontMatterMatch[0].length);
    }

    const resolvedName =
        metadata.name ||
        metadata.title ||
        metadata.prompt ||
        metadata.promptName ||
        metadata["\u540d\u524d"] ||
        metadata["\u30bf\u30a4\u30c8\u30eb"];

    if (resolvedName) {
        result.name = resolvedName;
    } else {
        const headingMatch = body.match(/^#\s+(.+)$/m);
        if (headingMatch) {
            result.name = headingMatch[1].trim();
        }
    }

    const iconValue = metadata.icon || metadata["\u30a2\u30a4\u30b3\u30f3"] || metadata.iconPath;
    if (iconValue) {
        result.icon = iconValue;
    }

    const descriptionValue = metadata.description || metadata.summary || metadata["\u8aac\u660e"];
    if (descriptionValue) {
        result.description = descriptionValue;
    }

    result.prompt = body.trim();
    return result;
};

const loadPresetSummaries = () => {
    if (!existsSync(presetsDir)) {
        return [];
    }

    return readdirSync(presetsDir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
        .map((entry) => {
            const id = path.parse(entry.name).name;
            try {
                const fullPath = path.join(presetsDir, entry.name);
                const parsed = parsePresetContent(readFileSync(fullPath, "utf8"), id);
                return { id: parsed.id, name: parsed.name, icon: parsed.icon, description: parsed.description ?? null };
            } catch (error) {
                console.warn('Failed to read preset ' + entry.name + ':', error.message);
                return null;
            }
        })
        .filter(Boolean);
};

const loadPresetById = (id) => {
    if (!sanitizePresetId(id)) {
        return null;
    }

    const filePath = path.join(presetsDir, id + ".md");
    if (!existsSync(filePath)) {
        return null;
    }

    try {
        const content = readFileSync(filePath, "utf8");
        return parsePresetContent(content, id);
    } catch (error) {
        console.warn('Failed to load preset ' + id + ':', error.message);
        return null;
    }
};

const tools = loadToolsConfig();

if (!tools.length) {
    console.warn("No tools configured. Realtime sessions will not expose any tools until tools.json is populated.");
}

const defaultVoice = process.env.REALTIME_VOICE || "cedar";

app.get('/api/presets', (req, res) => {
    try {
        const presets = loadPresetSummaries();
        res.json(presets);
    } catch (error) {
        console.error('Failed to enumerate presets:', error);
        res.status(500).json({ error: 'Failed to enumerate presets' });
    }
});

app.get('/api/presets/:id', (req, res) => {
    const presetId = req.params.id;
    if (!sanitizePresetId(presetId)) {
        return res.status(400).json({ error: 'Invalid preset id' });
    }

    const preset = loadPresetById(presetId);
    if (!preset) {
        return res.status(404).json({ error: 'Preset not found' });
    }

    res.json(preset);
});

app.post("/token", async (req, res) => {
    if (!apiKey) {
        return res.status(500).json({ error: "OPENAI_API_KEY is not configured on the server" });
    }

    const systemPrompt = typeof req.body?.systemPrompt === "string" ? req.body.systemPrompt.trim() : "";
    const requestedVoice = typeof req.body?.voice === "string" ? req.body.voice.trim() : "";
    const voiceFromRequest = /^[a-z0-9-]{1,32}$/i.test(requestedVoice) ? requestedVoice.toLowerCase() : "";
    const sessionConfig = {
        session: {
            type: "realtime",
            model: "gpt-realtime",
            audio: {
                output: {
                    voice: voiceFromRequest || defaultVoice,
                },
            },
            tools,
        },
    };

    if (systemPrompt) {
        sessionConfig.session.instructions = systemPrompt;
    }

    try {
        const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(sessionConfig),
        });

        const data = await response.json();
        res.json(data);
    } catch (error) {
        console.error("Token generation error:", error);
        res.status(500).json({ error: "Failed to generate token" });
    }
});

app.listen(3000, () => {
    console.log("Server listening on http://localhost:3000");
});
