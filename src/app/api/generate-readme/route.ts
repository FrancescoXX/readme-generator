// src/app/api/generate-readme/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { Octokit } from '@octokit/rest'; // Import Octokit

// --- Configuration ---
const MODEL_NAME = "gemini-1.5-flash-latest";

// Helper function to safely parse JSON from Base64
function safeDecodeBase64(encoded: string | undefined): any | null {
    if (!encoded) return null;
    try {
        const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
        return JSON.parse(decoded);
    } catch (error) {
        console.warn("Failed to decode/parse Base64 content:", error);
        return null;
    }
}

export async function POST(request: Request) {
    console.log("Received request for /api/generate-readme");

    // --- Get Environment Variables ---
    const apiKey = process.env.GOOGLE_API_KEY;
    const githubPat = process.env.GITHUB_PAT; // Get GitHub PAT

    if (!apiKey || !githubPat) { // Check for both keys now
        console.error("Missing GOOGLE_API_KEY or GITHUB_PAT environment variable.");
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // --- Get repoUrl from request body ---
    let owner: string | null = null;
    let repo: string | null = null;
    let repoUrl: string;

    try {
        const body = await request.json();
        repoUrl = body.repoUrl;
        if (!repoUrl || typeof repoUrl !== 'string') {
            throw new Error('Invalid or missing repository URL.');
        }
        // Attempt to parse owner/repo from GitHub URL
        const githubUrlMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/i);
        if (githubUrlMatch && githubUrlMatch[1] && githubUrlMatch[2]) {
            owner = githubUrlMatch[1];
            repo = githubUrlMatch[2];
            console.log(`Parsed GitHub repo: owner=${owner}, repo=${repo}`);
        } else {
            // Handle non-GitHub URLs or different formats if needed, otherwise throw error
            console.warn(`Could not parse owner/repo from URL: ${repoUrl}`);
            // For now, we'll only proceed if we can parse owner/repo for GitHub API calls
             throw new Error('Could not parse GitHub owner/repo from URL.');
        }
    } catch (error: any) {
        console.error("Failed to parse request body or URL:", error);
        return NextResponse.json({ error: error.message || 'Invalid request format or URL.' }, { status: 400 });
    }

    // --- Initialize GitHub Client ---
    const octokit = new Octokit({ auth: githubPat });

    // --- Fetch Data From GitHub ---
    let repoInfo: any = null;
    let languages: any = null;
    let rootContent: any[] = [];
    let packageJsonContent: any = null;
    let fetchError = null;

    try {
        console.log(`Workspaceing data for ${owner}/${repo} from GitHub...`);
        // Basic Repo Info
        const repoResponse = await octokit.repos.get({ owner, repo });
        repoInfo = repoResponse.data;
        console.log("- Fetched basic repo info.");

        // Languages
        const langResponse = await octokit.repos.listLanguages({ owner, repo });
        languages = langResponse.data;
        console.log("- Fetched languages.");

        // Root Content (Files/Dirs)
        const rootContentResponse = await octokit.repos.getContent({ owner, repo, path: '' });
        if (Array.isArray(rootContentResponse.data)) {
            rootContent = rootContentResponse.data.map(item => ({ name: item.name, type: item.type }));
        }
        console.log("- Fetched root content list.");

        // Try fetching package.json content
        try {
            const packageJsonResponse = await octokit.repos.getContent({ owner, repo, path: 'package.json' });
            if ('content' in packageJsonResponse.data) {
                 packageJsonContent = safeDecodeBase64(packageJsonResponse.data.content);
                 if(packageJsonContent) console.log("- Fetched and parsed package.json.");
            }
        } catch (pkgError: any) {
            if (pkgError.status === 404) {
                console.log("- package.json not found (optional).");
            } else {
                console.warn("Error fetching package.json:", pkgError.message);
            }
        }
         // TODO: Add fetches for other common files if needed (requirements.txt, composer.json, etc.)

    } catch (error: any) {
        console.error(`GitHub API Error for ${owner}/${repo}:`, error.status, error.message);
        fetchError = `Failed to fetch data from GitHub (Status: ${error.status || 'Unknown'}). ${error.message}. Is the repository public and spelled correctly?`;
        // Don't immediately return, let the AI try with limited info, but report error later if needed
    }


    // --- Initialize Google AI & Generate Content ---
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const generationConfig = { temperature: 0.7, topK: 1, topP: 1, maxOutputTokens: 8192 }; // Slightly less creative temp
        const safetySettings = [ /* ... (same as before) ... */ ];

        // --- Construct ENHANCED Prompt ---
        const context = `
          Repository URL: ${repoUrl}
          ${repoInfo ? `Description: ${repoInfo.description || 'N/A'}` : ''}
          ${repoInfo ? `Main Language: ${repoInfo.language || 'N/A'}` : ''}
          ${languages ? `Language Breakdown: ${Object.keys(languages).join(', ')}` : ''}
          ${rootContent.length > 0 ? `Root Directory Contents: ${rootContent.map(item => item.name + (item.type === 'dir' ? '/' : '')).join(', ')}` : ''}
          ${packageJsonContent ? `Package Name: ${packageJsonContent.name || 'N/A'}` : ''}
          ${packageJsonContent?.dependencies ? `Dependencies: ${Object.keys(packageJsonContent.dependencies).slice(0, 10).join(', ')} ${Object.keys(packageJsonContent.dependencies).length > 10 ? '...' : ''}` : ''}
          ${packageJsonContent?.scripts ? `Available Scripts: ${Object.keys(packageJsonContent.scripts).join(', ')}` : ''}
          ${fetchError ? `\nNote: There was an error fetching full details from GitHub: ${fetchError}` : ''}
        `;

        const prompt = `
          Generate a comprehensive and well-structured README.md file in Markdown format based on the following context about the project:
          --- CONTEXT START ---
          ${context}
          --- CONTEXT END ---

          Use the provided context to fill out the sections accurately. If context is missing for a section, provide reasonable placeholders or omit the section.

          Include sections for:
          - Project Title (Use Package Name if available, otherwise infer)
          - Badges (Suggest relevant badges like build status, license, npm version if applicable - use shields.io placeholders)
          - Description (Use provided description, expand if possible)
          - Key Features (Infer from context if possible)
          - Technologies Used (Based on Language Breakdown and Dependencies)
          - Getting Started (Prerequisites, Installation - reference dependencies/scripts if found)
          - Usage (Reference available scripts if found)
          - Contributing (Standard placeholder)
          - License (Suggest adding one)

          Format the output strictly as Markdown content suitable for a README.md file.
          Do not include conversational text, preamble, or explanation before or after the Markdown content itself.
          Start directly with the Markdown (e.g., '# Project Title').
        `;

        console.log(`Sending ENHANCED prompt for ${owner}/${repo} to Google AI...`);

        const result: GenerateContentResult = await model.generateContent({ /* ... (same as before) ... */ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig, safetySettings });

        // --- Handle Response (Corrected block from previous step) ---
        if (!result.response) { /* ... (same error handling as before) ... */ }
        try { /* ... (same text extraction as before) ... */ }
        catch (error: any) { /* ... (same error handling with block/finish reason as before) ... */ }
         // (Make sure to copy the full corrected response handling block here)
        // --- START Corrected Response Handling (Copy from previous answer) ---
        if (!result.response) {
            console.error("AI generation failed: No response object received from the model.");
            return NextResponse.json({ error: 'AI generation failed: No response received. Check API key, model name, or network status.' }, { status: 500 });
          }
          try {
            const generatedText = result.response.text();
            console.log(`Successfully generated README content for ${owner}/${repo}.`);
            return NextResponse.json({ readme: generatedText });

          } catch (error: any) {
            console.error(`Failed to extract text from AI response for ${owner}/${repo}, potentially blocked:`, error);
            const promptFeedback = result.response?.promptFeedback;
            const blockReason = promptFeedback?.blockReason;
            const safetyRatings = promptFeedback?.safetyRatings;
            const finishReason = result.response?.candidates?.[0]?.finishReason;
            console.error("Block Reason:", blockReason);
            console.error("Finish Reason:", finishReason);
            console.error("Safety Ratings:", JSON.stringify(safetyRatings, null, 2));
            let clientErrorMessage = `AI response error: Failed to generate content. Reason: ${error.message || 'Extraction error'}.`;
            if (blockReason) { clientErrorMessage += ` Blocking Reason: ${blockReason}.`; }
            if (finishReason && finishReason !== "STOP") { clientErrorMessage += ` Finish Reason: ${finishReason}.`; }
            return NextResponse.json({ error: clientErrorMessage }, { status: 500 });
          }
        // --- END Corrected Response Handling ---

    } catch (error: any) {
        // Catch errors during AI initialization or the request itself
        console.error(`Error during AI processing for ${owner}/${repo}:`, error);
        const errorMessage = error.message || 'An unknown error occurred during README generation.';
        // Include GitHub fetch error if it happened earlier
        const fullErrorMessage = fetchError ? `${fetchError}. ${errorMessage}` : errorMessage;
        return NextResponse.json({ error: `Failed to process request: ${fullErrorMessage}` }, { status: 500 });
    }
}