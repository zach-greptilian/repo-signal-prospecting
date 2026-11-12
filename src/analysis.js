export const DAY = 86400000;
export const WINDOW_DAYS = 30;

export function parseOrganization(value) {
  let input = value.trim();
  if (/^(https?:\/\/)?(www\.)?github\.com\//i.test(input)) {
    const url = new URL(/^https?:/i.test(input) ? input : `https://${input}`);
    if (url.hostname !== 'github.com' && url.hostname !== 'www.github.com') throw new Error('Use a GitHub organization name or its GitHub URL.');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts.length !== 1) throw new Error('Enter an organization URL, such as github.com/your-company.');
    input = parts[0];
  }
  if (!/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(input) || input.includes('--')) {
    throw new Error('Enter a valid GitHub organization name, such as vercel.');
  }
  return input.toLowerCase();
}

export function isHuman(user) {
  return !!user?.login && user.type !== 'Bot' && !/\[bot\]$/i.test(user.login);
}

export function selectRepositories(repos, now) {
  return repos.filter(r => !r.fork && !r.archived && !r.disabled && Date.parse(r.pushed_at) >= now - WINDOW_DAYS * DAY)
    .sort((a, b) => Date.parse(b.pushed_at) - Date.parse(a.pushed_at) || a.name.localeCompare(b.name)).slice(0, 3);
}

export function firstExternalReview(pr, reviews, now) {
  return reviews.filter(r => isHuman(r.user) && r.user.login.toLowerCase() !== pr.user?.login?.toLowerCase()
    && r.state !== 'PENDING' && r.submitted_at && Date.parse(r.submitted_at) >= Date.parse(pr.created_at)
    && Date.parse(r.submitted_at) <= now)
    .sort((a, b) => Date.parse(a.submitted_at) - Date.parse(b.submitted_at))[0] || null;
}

export function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.ceil((sorted.length - 1) / 2)]) / 2;
}

export function summarize(org, repositories, now, meta = {}) {
  const cutoff = now - WINDOW_DAYS * DAY;
  const recent = repositories.flatMap(r => r.recent).filter(p => isHuman(p.user) && Date.parse(p.created_at) >= cutoff && Date.parse(p.created_at) <= now);
  const open = repositories.flatMap(r => r.open).filter(p => isHuman(p.user) && !p.draft);
  const samples = repositories.flatMap(r => r.samples).filter(s => isHuman(s.pr.user) && !s.pr.draft);
  const reviewed = samples.filter(s => s.reviews !== null);
  const waiting = reviewed.filter(s => !firstExternalReview(s.pr, s.reviews, now));
  // A positive first review is valid even if review pagination was capped. Absence is only valid with complete history.
  const unreviewed = waiting.filter(s => !s.reviewsCapped);
  const aged = unreviewed.filter(s => now - Date.parse(s.pr.created_at) >= 2 * DAY);
  const firstReviewHours = reviewed.map(s => {
    const review = firstExternalReview(s.pr, s.reviews, now);
    return review ? (Date.parse(review.submitted_at) - Date.parse(s.pr.created_at)) / 3600000 : null;
  }).filter(v => v !== null);
  const large = samples.filter(s => s.detail && s.detail.additions + s.detail.deletions >= 500);
  const signals = [];
  if (recent.length) signals.push({
    type: 'Activity', title: `${recent.length} PRs opened in 30 days`,
    observation: `Observed across ${repositories.length} repositories, from ${new Set(recent.map(p => p.user.login.toLowerCase())).size} distinct human PR authors.`,
    hypothesis: 'A steady flow of changes could make review consistency a useful discovery topic.',
    question: 'How does your team keep review depth consistent when PR volume picks up?',
    evidence: recent.slice(0, 3).map(p => ({label: `${p.repo} #${p.number}`, url: p.html_url}))
  });
  if (aged.length) signals.push({
    type: 'Review coverage', title: `${aged.length} sampled PR${aged.length === 1 ? '' : 's'} open for 48h+ without a human review`,
    observation: `No submitted review by another human was found in the complete review histories for these sampled, non-draft PRs. Open age includes any earlier draft time.`,
    hypothesis: 'These changes may be worth asking about; open age does not prove a review bottleneck.',
    question: 'What usually determines when a PR gets its first review, and where could an automated first pass help?',
    evidence: aged.slice(0, 3).map(s => ({label: `${s.pr.repo} #${s.pr.number}`, url: s.pr.html_url}))
  });
  if (large.length) signals.push({
    type: 'Change complexity', title: `${large.length} sampled PR${large.length === 1 ? '' : 's'} change 500+ lines`,
    observation: 'Size is additions plus deletions, including generated files. This is a small sample of currently open changes.',
    hypothesis: 'Large diffs are an opening to discuss how reviewers retain context across a codebase.',
    question: 'How do reviewers get the context they need for changes that touch a lot of code?',
    evidence: large.slice(0, 3).map(s => ({label: `${s.pr.repo} #${s.pr.number}`, url: s.pr.html_url}))
  });
  if (!signals.length) signals.push({type:'Limited evidence', title:'Start with discovery', observation:'The available public sample contains too little activity to support a specific sales angle.', hypothesis:'Private engineering activity may differ substantially from this public footprint.', question:'How is code review organized across your team today?', evidence:[]});
  return {org, repositories, now, meta, recent, open, samples, signals,
    metrics: {prs:recent.length, authors:new Set(recent.map(p => p.user.login.toLowerCase())).size, open:open.length,
      medianHours:median(firstReviewHours), reviewedSample:reviewed.length, firstReviewCount:firstReviewHours.length, aged:aged.length, large:large.length},
    outreach: makeOutreach(org.name || org.login, recent.length, repositories, signals)};
}

function makeOutreach(name, count, repos, signals) {
  const names = repos.map(r => r.repo.name).join(', ');
  if (!count) return `Hi [first name],\n\nI was looking at ${name}’s public engineering work and wanted to learn how your team approaches code review.\n\n${signals[0].question}\n\nI’m with Greptile, which helps teams review pull requests with codebase context. Would it be worth comparing notes?\n\n[Your name]`;
  return `Hi [first name],\n\nI was looking at ${name}’s public GitHub activity and counted ${count} human-authored PRs opened over the last 30 days across ${names}. That’s a snapshot of a few public repos, of course.\n\n${signals.find(s => s.type === 'Review coverage')?.question || signals[0].question}\n\nI’m with Greptile, which helps teams review pull requests with codebase context. Would it be worth a quick conversation about your review workflow?\n\n[Your name]`;
}

export function exportBrief(brief) {
  const {org, metrics:m, signals, meta} = brief;
  return `# ${org.name || org.login} — GitHub research brief\n\n${meta.demo ? '**FICTIONAL SAMPLE — not live company data.**\n\n' : ''}As of: ${new Date(brief.now).toISOString()}\nOrganization: https://github.com/${org.login}\n\n## Observed activity\n- Human-authored PRs opened in 30 days: ${m.prs}\n- Distinct PR authors: ${m.authors}\n- Observed open non-draft human PRs: ${m.open}\n- Repositories analyzed: ${brief.repositories.map(r => r.repo.name).join(', ') || 'none'}\n\n## Research signals\n${signals.map(s => `### ${s.title}\nObserved: ${s.observation}\nHypothesis: ${s.hypothesis}\nDiscovery: ${s.question}\n${s.evidence.map(e => `- [${e.label}](${e.url})`).join('\n')}`).join('\n\n')}\n\n## Outreach draft\n${brief.outreach}\n\n## Coverage and limitations\n${coverageText(brief)}\n${(meta.warnings || []).join('\n')}\n`;
}

export function coverageText(brief) {
  return `Public data only. Up to 300 organization repositories inspected; the three most recently pushed eligible repositories within 30 days are selected (excluding forks, archived and disabled repos). Per repository: up to 300 PRs by creation date, 100 open PRs, and the two oldest non-draft human PRs in that open sample for detailed review and size checks. Reviews capped at 200 per sampled PR. Drafts count toward recent PR volume but not open/review metrics. Bots and self-reviews are excluded. First-review timing covers only sampled, currently open PRs with observed human reviews, measured from creation, including any draft time; it is not a team-wide review-time estimate. Counts may be lower bounds when caps are reached. Public contributors are not employee headcount. Findings are discovery prompts, not proof of buying intent or internal problems.`;
}
