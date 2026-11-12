# Repo Signal Prospecting

An independent side project for sales discovery: enter a public GitHub organization and get an evidence-led account research brief for a Greptile conversation.

## What it does

- Inspects up to 300 public repositories and selects the three most recently pushed eligible repos active in the last 30 days.
- Counts recent human-authored PRs and distinct PR authors.
- Samples up to six open, non-draft human PRs for submitted reviews and change size.
- Connects each observation to a sales hypothesis, a discovery question, and source PR links.
- Produces an editable, deterministic outreach draft. No AI service or paid API required.
- Saves up to five briefs in your browser and exports Markdown.
- Includes a clearly labeled fictional sample and a ten-minute session cache for live searches.

No login, server, database, build step, or dependencies. All live requests go directly from your browser to GitHub. Fonts load from Google Fonts with system-font fallbacks. No emails are sent.

## Run locally

From this directory:

```sh
python3 -m http.server 4173
```

Open http://localhost:4173. Use an HTTP server rather than opening `index.html` directly; the browser needs to load JavaScript modules.

With Node.js 22+ installed, run the checks:

```sh
npm test
```

No `npm install` is needed. The checks cover pagination, date windows, bot/self-review exclusion, missing data, cancellation, partial failures, and complete mocked research requests.

## Repository and hosting

[GitHub repository](https://github.com/zach-greptilian/repo-signal-prospecting) · [GitHub Pages](https://zach-greptilian.github.io/repo-signal-prospecting/)

Clone the project:

```sh
git clone https://github.com/zach-greptilian/repo-signal-prospecting.git
cd repo-signal-prospecting
```

Pages is configured to use **GitHub Actions**. Every push to `main` runs the checks and publishes only the app files. You can also run **Publish GitHub Pages** manually from the Actions tab. Use the URL shown by a successful deployment as the authoritative live address.

When deploying a fork, enable **Settings → Pages → Build and deployment → Source → GitHub Actions**, then run the publishing workflow. All app asset paths are relative, so repository subpaths work without a build-time base URL.

## Test Greptile

1. Connect this repository in Greptile and enable PR reviews.
2. Make a feature branch, implement one small improvement, and open a pull request against `main`.
3. Read Greptile's feedback, verify findings, and iterate before merging.

Useful follow-up PRs:

- Add a 7/30/90-day window selector. Carry the chosen window through fetching, metrics, charts, exports, and outreach.
- Add an explicit sampling strategy toggle: oldest open versus recently opened. Explain how each affects review-time observations.
- Add a compare-accounts view with side-by-side scope and coverage notes.

These changes exercise relationships across files and create useful review opportunities. The initial project contains no deliberately planted bugs.

## Data definitions and limits

- **Window:** the rolling 30 days ending when a search starts. Recent PR counts use creation time and include drafts; open/review metrics exclude drafts.
- **Repository selection:** exclude forks, archived, disabled, and repositories without a push within the window. Sort by push timestamp, not stars or actual PR volume. The API scan stops when it reaches repos outside the window or 300 repositories.
- **Recent PRs:** up to 300 per repository, fetched newest-created first. Pagination stops when it reaches creation times outside the window. A capped result is disclosed as incomplete.
- **Open PRs:** up to 100 most recently updated per repository. Two oldest eligible PRs from that sample receive detailed review and size checks. Old PRs can be much older than the recent-activity window.
- **Human review:** a submitted review by a different, non-bot account. Pending reviews, bot reviews, and self-reviews are excluded. Discussion comments are not submitted reviews. Review history is capped at 200; a capped history never establishes absence of a review.
- **First-review time:** median hours from creation to the first observed external human review, only among sampled, currently open PRs with a review. It includes any draft time. This is a biased sample, not team-wide turnaround time.
- **Large PR:** 500+ additions plus deletions in a sampled open PR, including generated code.
- **Authors:** distinct PR authors, not employee headcount. Public activity may be largely community work.
- **Failures:** missing review/size data is marked unavailable; failed repositories are excluded and disclosed. Rate-limit errors stop the search and leave the previous brief displayed.
- **Request budget:** usually around 17–23 requests for an active organization, with a bounded worst case of 34. GitHub permits [60 unauthenticated requests per hour per IP address](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api). The ten-minute cache reduces repeated requests, but does not provide unlimited searches.
- **Storage:** manual saves use `localStorage`; live search caching uses `sessionStorage`. Both stay in the current browser. Clearing site data removes them. Exported briefs are ordinary downloaded files.

Public signals are conversation starters, not proof of buying intent, poor engineering, or internal review problems. Generated outreach should be reviewed and personalized before use. Fictional sample data should never be used as real prospect evidence.

API references: [Organizations](https://docs.github.com/en/rest/orgs/orgs), [Repositories](https://docs.github.com/en/rest/repos/repos), [Pull requests](https://docs.github.com/en/rest/pulls/pulls), [Reviews](https://docs.github.com/en/rest/pulls/reviews).

## Project structure

```text
index.html             App shell
src/app.js             UI, storage, caching and export
src/github.js          Bounded public GitHub collection and errors
src/analysis.js        Metrics, signals and brief generation
src/demo.js            Fictional demo fixture
src/style.css          Responsive visual design
tests/run.mjs          Dependency-free behavior checks
.github/workflows/     PR checks and GitHub Pages deployment
```
