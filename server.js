import express from "express";
import path from "path";
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

const defaultMcpUrl = process.env.MCP_SERVER_URL;
const mcpServerLabel = process.env.MCP_SERVER_LABEL || "hf-get-time";
const mcpRequireApproval = process.env.MCP_REQUIRE_APPROVAL || "never";
const mcpAuthorization = process.env.MCP_AUTHORIZATION;

const tools = [];
if (defaultMcpUrl) {
    const mcpTool = {
        type: "mcp",
        server_label: mcpServerLabel,
        server_url: defaultMcpUrl,
        require_approval: mcpRequireApproval,
    };

    if (mcpAuthorization) {
        mcpTool.authorization = mcpAuthorization;
    }

    tools.push(mcpTool);
} else {
    console.warn("Warning: MCP_SERVER_URL is not set. The realtime session will not expose an MCP tool.");
}

const sessionConfig = JSON.stringify({
    session: {
        type: "realtime",
        model: "gpt-realtime",
        audio: {
            output: {
                voice: "cedar",
            },
        },
        tools,
    },
});

app.get("/token", async (req, res) => {
    try {
        const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: sessionConfig,
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
