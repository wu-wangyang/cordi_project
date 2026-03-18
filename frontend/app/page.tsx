'use client';

import { FormEvent, useMemo, useState } from 'react';

type SummaryResponse = {
  summary: string;
  keyDecisions: string[];
  actionItems: string[];
  rawModelResponse?: string;
  logKey?: string;
};

const EXAMPLE_NOTES = `Weekly product sync with engineering and operations.
- Team agreed to launch the beta onboarding flow next Tuesday.
- Sarah will update the customer email copy by Friday.
- James will confirm analytics tracking with the data team.
- Budget approval for the pilot was confirmed.
- Open risk: mobile QA still needs final sign-off.`;

export default function HomePage() {
  const [meetingNotes, setMeetingNotes] = useState(EXAMPLE_NOTES);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResponse | null>(null);

  const apiUrl = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
    if (!base) return '';
    return `${base.replace(/\/$/, '')}/summarise`;
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!meetingNotes.trim()) {
      setError('Please paste some meeting notes before submitting.');
      return;
    }

    if (!apiUrl) {
      setError('NEXT_PUBLIC_API_BASE_URL is missing. Add it to frontend/.env.local first.');
      return;
    }

    try {
      setLoading(true);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ meetingNotes }),
      });

      const data = (await response.json()) as SummaryResponse & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate summary.');
      }

      setResult(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected error';
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-6 py-10">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="rounded-3xl border bg-white p-6 shadow-sm lg:p-8">
          <div className="mb-6">
            <p className="mb-2 inline-flex rounded-full bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700">
              CORDi Technical Assessment
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
              AI Meeting Notes Summariser
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Paste raw meeting notes, send them to your Lambda-backed API Gateway endpoint,
              and receive a structured summary with key decisions and action items.
            </p>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm font-medium text-slate-700" htmlFor="meeting-notes">
              Raw meeting notes
            </label>
            <textarea
              id="meeting-notes"
              className="min-h-[360px] w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-6 text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              value={meetingNotes}
              onChange={(event) => setMeetingNotes(event.target.value)}
              placeholder="Paste meeting notes here..."
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-2xl bg-blue-600 px-5 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? 'Generating summary…' : 'Summarise Notes'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMeetingNotes(EXAMPLE_NOTES);
                  setError(null);
                  setResult(null);
                }}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                Load example
              </button>
            </div>
          </form>

          {error ? (
            <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}
        </section>

        <section className="rounded-3xl border bg-white p-6 shadow-sm lg:p-8">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-slate-900">Structured summary</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              The Lambda returns a parsed response ready for display in the UI.
            </p>
          </div>

          {!result && !loading ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">
              Your summary will appear here after you submit the meeting notes.
            </div>
          ) : null}

          {loading ? (
            <div className="space-y-3">
              <div className="h-6 animate-pulse rounded bg-slate-200" />
              <div className="h-20 animate-pulse rounded bg-slate-200" />
              <div className="h-24 animate-pulse rounded bg-slate-200" />
              <div className="h-24 animate-pulse rounded bg-slate-200" />
            </div>
          ) : null}

          {result ? (
            <div className="space-y-6">
              <div className="rounded-2xl bg-slate-50 p-5">
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">
                  Summary
                </h3>
                <p className="text-sm leading-7 text-slate-800">{result.summary}</p>
              </div>

              <div>
                <h3 className="mb-3 text-base font-semibold text-slate-900">Key Decisions</h3>
                {result.keyDecisions.length > 0 ? (
                  <ul className="space-y-3">
                    {result.keyDecisions.map((item, index) => (
                      <li key={`${item}-${index}`} className="rounded-2xl border bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No key decisions identified.</p>
                )}
              </div>

              <div>
                <h3 className="mb-3 text-base font-semibold text-slate-900">Action Items</h3>
                {result.actionItems.length > 0 ? (
                  <ul className="space-y-3">
                    {result.actionItems.map((item, index) => (
                      <li key={`${item}-${index}`} className="rounded-2xl border bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
                        {item}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-slate-500">No action items identified.</p>
                )}
              </div>

              {result.logKey ? (
                <p className="text-xs text-slate-400">S3 log key: {result.logKey}</p>
              ) : null}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
