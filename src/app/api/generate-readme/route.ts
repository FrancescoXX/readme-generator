// src/app/api/generate-readme/route.ts
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI, GenerateContentResult } from '@google/generative-ai';
import { Octokit } from '@octokit/rest';

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
    console.log("API: Received generate-readme request");

    // --- Get Environment Variables ---
    const apiKey = process.env.GOOGLE_API_KEY;
    const githubPat = process.env.GITHUB_PAT;
    if (!apiKey || !githubPat) {
        console.error("API Error: Missing GOOGLE_API_KEY or GITHUB_PAT");
        return NextResponse.json({ error: 'Server configuration error.' }, { status: 500 });
    }

    // --- Get & Parse Repo URL ---
    let owner: string;
    let repo: string;
    let repoUrl: string;
    try {
        const body = await request.json();
        repoUrl = body.repoUrl;
        const githubUrlMatch = repoUrl?.match(/github\.com\/([^\/]+)\/([^\/]+?)(\.git)?$/i);
        if (!githubUrlMatch || !githubUrlMatch[1] || !githubUrlMatch[2]) {
             throw new Error('Could not parse GitHub owner/repo from URL.');
        }
        owner = githubUrlMatch[1];
        repo = githubUrlMatch[2];
        console.log(`API: Parsed GitHub repo: ${owner}/${repo}`);
    } catch (error: any) {
        console.error("API Error: Failed parsing request body or URL:", error);
        return NextResponse.json({ error: error.message || 'Invalid request format or URL.' }, { status: 400 });
    }

    // --- Fetch Data From GitHub ---
    const octokit = new Octokit({ auth: githubPat });
    let repoInfo: any = null;
    let languages: any = null;
    let rootContent: any[] = [];
    let packageJsonContent: any = null;
    let fetchError = null;

    try {
        console.log(`API: Fetching GitHub data for ${owner}/${repo}...`);
        const repoPromise = octokit.repos.get({ owner, repo });
        const langPromise = octokit.repos.listLanguages({ owner, repo });
        const rootContentPromise = octokit.repos.getContent({ owner, repo, path: '' });
        const packageJsonPromise = octokit.repos.getContent({ owner, repo, path: 'package.json' }).catch(err => {
            if (err.status === 404) return null; // Ignore 404 for optional file
            throw err; // Re-throw other errors
        });

        // Await all fetches concurrently
        const [repoResponse, langResponse, rootContentResponse, packageJsonResponse] = await Promise.all([
            repoPromise,
            langPromise,
            rootContentPromise,
            packageJsonPromise
        ]);

        repoInfo = repoResponse.data;
        languages = langResponse.data;
        if (Array.isArray(rootContentResponse.data)) {
            rootContent = rootContentResponse.data.map(item => ({ name: item.name, type: item.type }));
        }
        if (packageJsonResponse && 'content' in packageJsonResponse.data) {
            packageJsonContent = safeDecodeBase64(packageJsonResponse.data.content);
        }
        console.log(`API: Finished fetching GitHub data for ${owner}/${repo}.`);

    } catch (error: any) {
        console.error(`API Error: GitHub API fetch failed for ${owner}/${repo}:`, error.status, error.message);
        fetchError = `Failed to fetch data from GitHub (Status: ${error.status || 'Unknown'}). ${error.message}`;
    }

    // --- Call Google AI ---
    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: MODEL_NAME });
        const generationConfig = { temperature: 0.7, maxOutputTokens: 8192 }; // Simplified config

        // Construct context string from fetched data
        const context = [
          `Repository URL: ${repoUrl}`,
          repoInfo ? `Description: ${repoInfo.description || 'N/A'}` : '',
          repoInfo ? `Main Language: ${repoInfo.language || 'N/A'}` : '',
          languages ? `Language Breakdown: ${Object.keys(languages).join(', ')}` : '',
          rootContent.length > 0 ? `Root Directory Contents: ${rootContent.map(item => item.name + (item.type === 'dir' ? '/' : '')).join(', ')}` : '',
          packageJsonContent ? `Package Name: ${packageJsonContent.name || 'N/A'}` : '',
          packageJsonContent?.dependencies ? `Dependencies: ${Object.keys(packageJsonContent.dependencies).slice(0, 10).join(', ')} ${Object.keys(packageJsonContent.dependencies).length > 10 ? '...' : ''}` : '',
          packageJsonContent?.scripts ? `Available Scripts: ${Object.keys(packageJsonContent.scripts).join(', ')}` : '',
          fetchError ? `\nNote: GitHub fetch error occurred: ${fetchError}` : ''
        ].filter(Boolean).join('\n'); // Filter out empty lines

        const prompt = `
          Generate a README.md file in Markdown format based on the following context:
          --- CONTEXT START ---
          ${context}
          --- CONTEXT END ---

          Focus on these sections, using the context: Project Title, Description, Technologies Used, Getting Started, Usage. Include placeholders if context is missing.
          Format strictly as Markdown, starting directly with the title (e.g., '# Project Title').
        `; // Simplified prompt instructions

        console.log(`API: Sending prompt to Google AI for ${owner}/${repo}...`);

        const result: GenerateContentResult = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig,
            // safetySettings removed
        });

        // --- Handle AI Response ---
        if (!result.response) {
            console.error("API Error: AI generation failed - No response object.");
            return NextResponse.json({ error: 'AI generation failed: No response received.' }, { status: 500 });
        }
        try {
            const generatedText = result.response.text();
            console.log(`API: Successfully generated README for ${owner}/${repo}.`);
            return NextResponse.json({ readme: generatedText });
        } catch (error: any) {
            console.error(`API Error: Failed extracting text from AI response for ${owner}/${repo}:`, error);
            // Simplified error message for prototype
            return NextResponse.json({ error: `AI response error: ${error.message || 'Failed to extract content.'}` }, { status: 500 });
        }

    } catch (error: any) {
        // Catch errors during AI initialization or the overall process
        console.error(`API Error: AI processing failed for ${owner}/${repo}:`, error);
        const fullErrorMessage = fetchError ? `${fetchError}. ${error.message}` : error.message;
        return NextResponse.json({ error: `Failed to process request: ${fullErrorMessage || 'Unknown AI processing error.'}` }, { status: 500 });
    }
}