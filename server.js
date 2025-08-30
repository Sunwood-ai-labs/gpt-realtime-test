import express from "express";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env (if present)
dotenv.config();

// Read API key from environment. Use OPENAI_API_KEY or fallback to API_KEY.
const apiKey = process.env.OPENAI_API_KEY || process.env.API_KEY;
if (!apiKey) {
    console.warn('Warning: OPENAI_API_KEY (or API_KEY) is not set. The /token endpoint will fail until you provide it.');
}

const app = express();

// Serve static files from the project root so frontend.html and assets are available
app.use(express.static(process.cwd()));

// Serve frontend.html at the root path
app.get("/", (req, res) => {
    res.sendFile(path.resolve("frontend.html"));
});

const sessionConfig = JSON.stringify({
    session: {
        type: "realtime",
        model: "gpt-realtime",
        audio: {
            output: {
                voice: "cedar", // marin
            },
        },
    },
});

// An endpoint which would work with the client code above - it returns
// the contents of a REST API request to this protected endpoint
app.get("/token", async (req, res) => {
    try {
        const response = await fetch(
            "https://api.openai.com/v1/realtime/client_secrets",
            {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: sessionConfig,
            }
        );

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
