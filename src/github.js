import {parseOrganization, selectRepositories, summarize, DAY, isHuman} from './analysis.js';

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.name = 'GitHubError'; this.status = status; }
}

export function createClient({fetchImpl = fetch, signal, onProgress = () => {}} = {}) {
  let requests = 0;
  return async path => {
    if (signal?.aborted) throw Object.assign(new Error('Cancelled'), {name:'AbortError'});
    if (!path.startsWith('/orgs/') && !path.startsWith('/repos/')) throw new Error('Unsupported GitHub endpoint.');
    requests++;
    onProgress(`Reading public GitHub data · ${requests} request${requests === 1 ? '' : 's'}`);
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal?.addEventListener('abort', cancel, {once:true});
    const timeout = setTimeout(cancel, 20000);
    try {
      const response = await fetchImpl(`https://api.github.com${path}`, {
        headers:{Accept:'application/vnd.github+json', 'X-GitHub-Api-Version':'2022-11-28'},
        credentials:'omit', signal:controller.signal
      });
      if (!response.ok) {
        if (response.status === 404) throw new GitHubError('Organization or repository not found. Check the name; this tool reads public organizations only.', 404);
        if (response.status === 403 || response.status === 429) {
          const reset = Number(response.headers.get('x-ratelimit-reset'));
          const resetText = reset ? ` Try again after ${new Date(reset * 1000).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}.` : ' Please try again later.';
          throw new GitHubError(`GitHub limited or denied this request.${resetText} You can explore the sample meanwhile.`, response.status);
        }
        throw new GitHubError(`GitHub returned ${response.status}. Try again in a moment.`, response.status);
      }
      return {data:await response.json(), hasNext:/rel="next"/.test(response.headers.get('link') || '')};
    } catch (error) {
      if (error.name === 'AbortError' && !signal?.aborted) throw new GitHubError('GitHub took too long to respond. Please try again.', 408);
      throw error;
    } finally {clearTimeout(timeout); signal?.removeEventListener('abort', cancel);}
  };
}

export async function collectPages(client, base, maxPages, stop = () => false) {
  let items = [], capped = false;
  for (let page = 1; page <= maxPages; page++) {
    const result = await client(`${base}${base.includes('?') ? '&' : '?'}per_page=100&page=${page}`);
    if (!Array.isArray(result.data)) throw new Error('GitHub returned an unexpected response. Please try again.');
    items.push(...result.data);
    if (!result.hasNext || stop(result.data)) break;
    if (page === maxPages) capped = true;
  }
  return {items, capped};
}

export async function researchOrganization(input, options = {}) {
  const login = parseOrganization(input);
  const now = options.now || Date.now();
  const client = options.client || createClient(options);
  const {data:org} = await client(`/orgs/${encodeURIComponent(login)}`);
  const warnings = [];
  const repoPage = await collectPages(client, `/orgs/${encodeURIComponent(login)}/repos?type=public&sort=pushed&direction=desc`, 3,
    page => page.length > 0 && Date.parse(page[page.length - 1].pushed_at) < now - 30 * DAY);
  if (repoPage.capped) warnings.push('Organization repository scan capped at 300 repositories.');
  const selected = selectRepositories(repoPage.items, now);
  if (!selected.length) warnings.push('No eligible public repositories with a push in the last 30 days were found in the scan.');
  const repositories = [];
  // Sequential requests keep the unauthenticated API footprint small and cancellation predictable.
  for (const repo of selected) {
    const base = `/repos/${encodeURIComponent(org.login)}/${encodeURIComponent(repo.name)}`;
    try {
      const recentPage = await collectPages(client, `${base}/pulls?state=all&sort=created&direction=desc`, 3,
        page => page.length > 0 && Date.parse(page[page.length - 1].created_at) < now - 30 * DAY);
      const openPage = await collectPages(client, `${base}/pulls?state=open&sort=updated&direction=desc`, 1);
      if (recentPage.capped) warnings.push(`${repo.name}: recent PR scan capped at 300; volume is a lower bound.`);
      if (openPage.capped) warnings.push(`${repo.name}: only the 100 most recently updated open PRs were inspected.`);
      const attach = p => ({...p, repo:repo.name});
      const recent = recentPage.items.map(attach);
      const open = openPage.items.map(attach);
      const chosen = open.filter(p => !p.draft && isHuman(p.user)).sort((a,b) => Date.parse(a.created_at) - Date.parse(b.created_at)).slice(0,2);
      const samples = [];
      for (const pr of chosen) {
        let reviews = null, reviewsCapped = false, detail = null;
        try {
          const page = await collectPages(client, `${base}/pulls/${pr.number}/reviews`, 2);
          reviews = page.items; reviewsCapped = page.capped;
          if (page.capped) warnings.push(`${repo.name} #${pr.number}: review history capped at 200.`);
          detail = (await client(`${base}/pulls/${pr.number}`)).data;
        } catch (e) {
          if (e.name === 'AbortError') throw e;
          if (e.status === 403 || e.status === 429) throw e;
          warnings.push(`${repo.name} #${pr.number}: some review or size details unavailable.`);
        }
        samples.push({pr, reviews, reviewsCapped, detail});
      }
      repositories.push({repo, recent, open, samples, recentCapped:recentPage.capped, openCapped:openPage.capped});
    } catch (e) {
      if (e.name === 'AbortError' || e.status === 403 || e.status === 429) throw e;
      warnings.push(`${repo.name} could not be analyzed and is excluded from counts. ${e.message}`);
    }
  }
  if (selected.length && !repositories.length) throw new GitHubError('Could not read PR activity for the selected repositories. Please try again.', 502);
  return summarize({login:org.login, name:org.name, description:org.description, public_repos:org.public_repos}, repositories, now,
    {warnings, repoScan:repoPage.items.length, selectedCount:selected.length, demo:false});
}
