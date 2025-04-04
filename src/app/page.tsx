// src/app/page.tsx
'use client';

import { useState } from 'react';

// --- Font Awesome Imports ---
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGithub } from '@fortawesome/free-brands-svg-icons';
// Recommended Font Awesome CSS bug configuration for Next.js/React
import { config } from '@fortawesome/fontawesome-svg-core';
import '@fortawesome/fontawesome-svg-core/styles.css'; // Import the CSS
config.autoAddCss = false; // Prevent Font Awesome from auto-adding <style> tag
// --- End Font Awesome Imports ---


export default function Home() {
  // --- State Variables ---
  const [repoUrl, setRepoUrl] = useState('');
  const [generatedReadme, setGeneratedReadme] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState('');
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  // --- Handle Form Submission ---
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    setGeneratedReadme('');
    setStatusMessage('Validating URL...');
    setCopyStatus('idle'); // Reset copy status

    // Basic URL validation
    if (!repoUrl.startsWith('http://') && !repoUrl.startsWith('https://')) {
      setError('Please enter a valid repository URL (starting with http:// or https://).');
      setIsLoading(false);
      setStatusMessage('');
      return;
    }

    try {
      setStatusMessage('Sending request to generate README...');
      const response = await fetch('/api/generate-readme', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl: repoUrl }),
      });

      setStatusMessage('Waiting for AI generation...');

      if (!response.ok) {
        let errorData;
        try {
           errorData = await response.json();
        } catch (parseError){
           throw new Error(response.statusText || `HTTP error! Status: ${response.status}`);
        }
        throw new Error(errorData?.error || `HTTP error! Status: ${response.status}`);
      }

      const data = await response.json();

      if (typeof data.readme !== 'string') {
         throw new Error('Received invalid response format from the server.');
       }

      setStatusMessage('README generated successfully!');
      setGeneratedReadme(data.readme);

    } catch (err: any) {
      console.error("Generation failed:", err);
      setError(err.message || 'Failed to generate README. Check console or server logs.');
      setStatusMessage('');
    } finally {
      setIsLoading(false);
       if (error) { // Only clear status message if there was an error
          setStatusMessage('');
       }
    }
  };

  // --- Handle Safe Copy ---
  const handleCopyReadme = async () => {
    setCopyStatus('idle');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(generatedReadme);
        setCopyStatus('copied');
        setTimeout(() => setCopyStatus('idle'), 2000);
      } catch (err) {
        console.error("Failed to copy README:", err);
        setCopyStatus('failed');
        setTimeout(() => setCopyStatus('idle'), 3000);
      }
    } else {
      console.warn("Clipboard API not available.");
      setCopyStatus('failed');
      setError('Clipboard copying not supported in this browser/context.');
      setTimeout(() => setCopyStatus('idle'), 3000);
    }
  };


  // --- JSX with Black & White Styling + Font Awesome Icon ---
  return (
    // Outermost container: Added `relative` for positioning context
    <div className="relative flex min-h-screen flex-col items-center bg-white dark:bg-black px-4 py-10 sm:px-8 sm:py-16">

      {/* --- GITHUB LINK - TOP RIGHT --- */}
      <div className="absolute top-0 right-0 p-4 sm:p-6 z-10"> {/* Added z-index just in case */}
        <a
          // !!! REPLACE THIS HREF WITH YOUR ACTUAL REPO URL !!!
          href="https://github.com/YOUR_USERNAME/readme-generator" // <-- Make sure to update this URL!
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center space-x-2 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white transition-colors"
          title="View source code on GitHub"
        >
          {/* --- Use Font Awesome Icon Component --- */}
          <FontAwesomeIcon icon={faGithub} className="w-5 h-5 sm:w-6 sm:h-6" />
          {/* --- End Font Awesome Icon --- */}

          <span className="hidden sm:inline text-sm font-medium">GitHub</span>
        </a>
      </div>
      {/* --- END GITHUB LINK --- */}


      {/* Content wrapper: Limit width */}
      <div className="w-full max-w-2xl mt-8 sm:mt-0"> {/* Added margin-top for spacing below the absolute link */}
        {/* Header */}
        <h1 className="mb-3 text-center text-3xl font-bold tracking-tight text-black dark:text-white sm:text-4xl">
          AI README Generator
        </h1>
        <p className="mb-10 text-center text-base text-gray-600 dark:text-gray-400 sm:text-lg">
          Enter a public repository URL to generate a README.md file.
        </p>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Input Field */}
          <div>
            <label htmlFor="repoUrl" className="sr-only">
              Public Repository URL
            </label>
            <input
              type="url"
              id="repoUrl"
              className="block w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-black px-4 py-3 text-black dark:text-white shadow-sm placeholder-gray-400 dark:placeholder-gray-500 focus:border-black dark:focus:border-white focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/username/repository-name"
              required
              aria-label="Public Repository URL"
              disabled={isLoading}
            />
          </div>
          {/* Submit Button */}
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center rounded-lg border border-transparent bg-black dark:bg-white px-4 py-3 text-sm font-semibold text-white dark:text-black shadow-sm transition-colors hover:bg-gray-800 dark:hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <>
                {/* Simple spinner */}
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : 'Generate README'}
          </button>
        </form>

        {/* Status Message */}
        {(isLoading || statusMessage) && !error && (
           <div className={`mt-5 text-center text-sm ${statusMessage.includes('success') ? 'text-green-600 dark:text-green-400' : 'text-gray-600 dark:text-gray-400'} ${isLoading ? 'animate-pulse' : ''}`}>
              {statusMessage}
           </div>
        )}

        {/* Error Display */}
        {error && (
          <div className="mt-5 rounded-md border border-red-500 dark:border-red-600 p-3">
            <p className="text-center text-sm font-medium text-red-700 dark:text-red-500">
              Error: {error}
            </p>
          </div>
        )}

        {/* Output Area */}
        {generatedReadme && !isLoading && (
          <div className="mt-10">
            {/* Header and Copy Button */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-black dark:text-white">
                Generated README.md:
              </h2>
              {/* Copy Button - Outline style */}
              <button
                onClick={handleCopyReadme}
                disabled={copyStatus !== 'idle'}
                className={`rounded-md border px-3 py-1 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black transition-colors duration-150 ease-in-out
                  ${copyStatus === 'copied'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300 focus:ring-green-500' // Copied style
                    : copyStatus === 'failed'
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 focus:ring-red-500' // Failed style
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-black text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:ring-gray-500' // Idle style
                  }
                  ${copyStatus !== 'idle' ? 'cursor-not-allowed opacity-70' : ''}
                `}
              >
                {copyStatus === 'copied' ? 'Copied!' : copyStatus === 'failed' ? 'Failed' : 'Copy'}
              </button>
            </div>
            {/* Textarea */}
            <textarea
              readOnly
              value={generatedReadme}
              rows={25}
              className="w-full rounded-lg border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-black p-4 text-sm text-black dark:text-gray-100 shadow-sm focus:border-black dark:focus:border-white focus:outline-none focus:ring-2 focus:ring-gray-400 dark:focus:ring-gray-600 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-black font-mono"
              aria-label="Generated README content"
            />
          </div>
        )}
      </div> {/* End Content Wrapper */}
    </div> // End Outermost Container
  );
}