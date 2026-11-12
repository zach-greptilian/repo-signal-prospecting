import {researchOrganization} from './github.js';
import {coverageText, exportBrief, firstExternalReview, isHuman, DAY, parseOrganization} from './analysis.js';
import {demoBrief} from './demo.js';

const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const githubLink = (url, label) => {
  try {const parsed = new URL(url); if (parsed.protocol === 'https:' && parsed.hostname === 'github.com') return `<a href="${esc(parsed.href)}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;} catch {}
  return `<span>${esc(label)}${current?.meta.demo ? ' · sample' : ''}</span>`;
};
let current, activeTab = 'overview', controller, toastTimer;
let saved = readSaved();
function readSaved() {try {const value = JSON.parse(localStorage.getItem('repo-signal-saved') || '[]'); return Array.isArray(value) ? value.filter(b => b.org?.login && Array.isArray(b.repositories) && Array.isArray(b.signals)).slice(0,5) : [];} catch {return [];}}
function notify(message) {$('toast').textContent = message; $('toast').classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.add('hidden'),3500);}
function date(now) {return new Date(now).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
function render(brief) {
  current = brief;
  const demo = brief.meta.demo;
  const org = brief.org;
  $('results').innerHTML = `
    ${demo ? '<div class="sample-banner"><strong>✳ SAMPLE BRIEF</strong><span>Fictional company and illustrative data. Run a search for live research.</span></div>' : '<div class="sample-banner"><strong>● LIVE RESEARCH</strong><span>Public GitHub snapshot · '+esc(date(brief.now))+'</span></div>'}
    <div class="company-header"><div class="company-id"><div class="company-monogram">${esc((org.name || org.login)[0].toUpperCase())}</div><div><h2>${esc(org.name || org.login)}</h2><div class="company-sub">${githubLink(demo ? null : `https://github.com/${org.login}`,org.login)} <span>·</span><span>${brief.repositories.length} repos analyzed</span><span>·</span><span>30-day window</span></div></div></div><div class="header-actions"><button class="outline-button" id="save-button">＋ Save brief</button><button class="outline-button accent" id="export-button">↓ Export brief</button></div></div>
    <div class="tabs" role="tablist" aria-label="Brief sections">${[['overview','Overview','01'],['evidence','PR evidence',String(brief.samples.length).padStart(2,'0')],['outreach','Outreach draft','↗']].map(([id,label,count])=>`<button class="tab ${activeTab===id?'active':''}" id="tab-${id}" role="tab" aria-selected="${activeTab===id}" aria-controls="tab-content" data-tab="${id}" tabindex="${activeTab===id?'0':'-1'}">${label}<span>${count}</span></button>`).join('')}</div>
    ${(brief.meta.warnings || []).length ? `<div class="warning-list"><strong>Coverage notes</strong>${brief.meta.warnings.map(w => `<p>${esc(w)}</p>`).join('')}</div>` : ''}
    <div id="tab-content" role="tabpanel" aria-labelledby="tab-${activeTab}"></div>`;
  renderTab();
  $('methodology-body').innerHTML = `<p>${esc(coverageText(brief))}</p><p>Snapshot: ${esc(new Date(brief.now).toLocaleString())}. ${demo ? 'All sample data is fictional.' : `${brief.meta.repoScan} repositories inspected; ${brief.repositories.length} analyzed.`} Briefs are saved only when you choose “Save brief,” in this browser. Live searches go directly to GitHub. No login or API key is required; GitHub permits 60 unauthenticated requests per hour per IP address.</p><p>Sources: <a href="https://docs.github.com/en/rest/pulls/pulls" target="_blank" rel="noopener noreferrer">Pull requests API ↗</a> · <a href="https://docs.github.com/en/rest/pulls/reviews" target="_blank" rel="noopener noreferrer">Reviews API ↗</a> · <a href="https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api" target="_blank" rel="noopener noreferrer">Rate limits ↗</a></p>`;
  $('save-button').addEventListener('click',saveBrief);
  $('export-button').addEventListener('click',downloadBrief);
  document.querySelectorAll('[data-tab]').forEach(button=>{
    button.addEventListener('click',()=>setTab(button.dataset.tab));
    button.addEventListener('keydown',event=>{
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const tabs=['overview','evidence','outreach'];
      const next=event.key==='Home'?0:event.key==='End'?2:(tabs.indexOf(activeTab)+(event.key==='ArrowRight'?1:2))%3;
      setTab(tabs[next]); $('tab-'+tabs[next]).focus();
    });
  });
}
function setTab(tab) {
  // Preserve any edits before leaving the outreach tab.
  if ($('outreach-editor')) current.outreach = $('outreach-editor').value;
  activeTab=tab;
  document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===tab); b.setAttribute('aria-selected',String(b.dataset.tab===tab)); b.tabIndex=b.dataset.tab===tab?0:-1;});
  $('tab-content').setAttribute('aria-labelledby','tab-'+tab); renderTab();
}
function renderTab() {
  const b=current, m=b.metrics;
  const panel=$('tab-content');
  if(activeTab==='overview') {
    panel.innerHTML=`<div class="metrics">${[
      ['PRs opened',m.prs,'↗','30 days · human-authored'],['Distinct PR authors',m.authors,'♧','Across selected repositories'],['Open PRs observed',m.open,'⑂','Human-authored · non-draft'],['Sampled first review',m.medianHours===null?'—':m.medianHours.toFixed(1)+'<small>h</small>','◷',m.firstReviewCount?`${m.firstReviewCount} reviewed open PRs · median`:'No observed human reviews']
    ].map(([label,value,icon,foot])=>`<div class="metric"><div class="metric-label">${label}<span aria-hidden="true">${icon}</span></div><div class="metric-value">${value}</div><div class="metric-foot">${foot}</div></div>`).join('')}</div>
    <div class="content-grid"><div class="left-column"><section class="panel"><div class="section-heading"><h2>Reasons to start a conversation</h2><span class="tag">${b.signals.length} SIGNAL${b.signals.length===1?'':'S'}</span></div><p class="section-caption">Observed facts, thoughtful hypotheses. Follow the evidence.</p>${b.signals.map((s,i)=>`<article class="signal"><div class="signal-num">0${i+1}</div><div><div class="signal-kicker">${esc(s.type)}</div><h3>${esc(s.title)}</h3><p>${esc(s.observation)}</p><p class="hypothesis">${esc(s.hypothesis)}</p><div class="evidence-links">${s.evidence.map(e=>githubLink(e.url,e.label)).join('')}</div></div></article>`).join('')}</section>
    <section class="panel"><div class="section-heading"><h2>Repository snapshot</h2><span class="tag">MOST RECENTLY PUSHED</span></div><div class="table-wrap"><table class="repo-table"><thead><tr><th>Repository</th><th>Language</th><th>PRs / 30d</th></tr></thead><tbody>${b.repositories.map(r=>`<tr><td>${githubLink(b.meta.demo?null:`https://github.com/${b.org.login}/${r.repo.name}`,r.repo.name)}<small>${Number(r.repo.stargazers_count || 0).toLocaleString()} stars</small></td><td><span class="lang-dot ${r.repo.language==='Go'?'go':''}"></span>${esc(r.repo.language || 'Unknown')}</td><td>${r.recent.filter(p=>isHuman(p.user)&&Date.parse(p.created_at)>=b.now-30*DAY&&Date.parse(p.created_at)<=b.now).length}${r.recentCapped?'+':''}</td></tr>`).join('')}</tbody></table></div>${!b.repositories.length?'<p class="no-data">No eligible active public repositories in this scan. Try another organization.</p>':''}<p class="data-note">Selected by recent push activity; this is not the organization’s full engineering footprint.</p></section></div>
    <div class="right-column"><section class="panel play-card"><div class="overline">YOUR CONVERSATION STARTER</div><h3>Lead with curiosity.<br>Bring the context.</h3><p>Use the public signal to ask about their workflow, then learn what happens inside the team.</p><div class="question">“${esc((b.signals.find(s=>s.type==='Review coverage')||b.signals[0]).question)}”</div><button id="view-outreach" class="primary full">Build on this in outreach <span>↗</span></button></section><section class="panel"><div class="section-heading"><h2>PR activity</h2><span class="tag">30 DAYS</span></div><p class="section-caption">Human-authored PRs opened</p>${activityChart(b)}<p class="data-note">Six 5-day windows, from oldest to newest. Sampled repositories only.</p></section></div></div>`;
    $('view-outreach').onclick=()=>{setTab('outreach');$('tab-outreach').focus();};
  } else if(activeTab==='evidence') {
    panel.innerHTML=`<section class="panel"><div class="section-heading"><h2>Follow the evidence</h2><span class="tag">${b.samples.length} SAMPLED PRS</span></div><p class="section-caption">The two oldest non-draft human PRs in each repository’s open sample. A submitted review by another human counts; bot and self-reviews do not.</p><div class="table-wrap"><table class="repo-table evidence-table"><thead><tr><th>Pull request</th><th>Open age</th><th>Human review</th><th>Lines changed</th></tr></thead><tbody>${b.samples.map(s=>{
      const review=s.reviews && firstExternalReview(s.pr,s.reviews,b.now);
      const status=s.reviews===null?'Unavailable':review?'Reviewed':s.reviewsCapped?'Unknown · capped':'None observed';
      return `<tr><td>${githubLink(s.pr.html_url,s.pr.title)}<small>${esc(s.pr.repo)} #${s.pr.number}</small></td><td>${Math.max(0,(b.now-Date.parse(s.pr.created_at))/DAY).toFixed(1)}d</td><td><span class="status-tag ${status==='None observed'?'waiting':''}">${status}</span></td><td>${s.detail?Number(s.detail.additions+s.detail.deletions).toLocaleString():'—'}</td></tr>`;
    }).join('')}</tbody></table></div>${!b.samples.length?'<p class="no-data">No eligible open PRs available for detailed sampling.</p>':''}<p class="data-note">Open age is measured from creation, including any draft time. Line counts include generated code. Absence of a submitted review does not mean nobody has looked at the change.</p></section>`;
  } else {
    panel.innerHTML=`<div class="outreach-layout"><section class="panel"><div class="section-heading"><h2>A thoughtful first touch</h2><span class="tag">EDITABLE DRAFT</span></div><p class="section-caption">Grounded in the public sample. Make it sound like you.</p>${b.meta.demo?'<div class="outreach-note">Sample company and numbers are fictional. Run live research before using an outreach draft.</div>':''}<label class="muted" for="outreach-editor">Message</label><textarea class="outreach-editor" id="outreach-editor">${esc(b.outreach)}</textarea><button class="primary" id="copy-outreach">Copy draft <span>⧉</span></button></section><section class="panel"><div class="section-heading"><h2>Good discovery questions</h2></div>${b.signals.map((s,i)=>`<article class="signal"><div class="signal-num">0${i+1}</div><div><div class="signal-kicker">${esc(s.type)}</div><p>${esc(s.question)}</p></div></article>`).join('')}<p class="outreach-note">Public work is a starting point. Validate the team’s needs and buying process in conversation. No messages are sent by this app.</p></section></div>`;
    $('outreach-editor').addEventListener('input',()=>{current.outreach=$('outreach-editor').value;});
    $('copy-outreach').onclick=async()=>{try{await navigator.clipboard.writeText($('outreach-editor').value);notify('Draft copied');}catch{ $('outreach-editor').focus();$('outreach-editor').select();notify('Select the draft and copy it manually.');}};
  }
}
function activityChart(b) {
  const counts=Array(6).fill(0);
  b.recent.forEach(p=>{const index=Math.min(5,Math.floor((Date.parse(p.created_at)-(b.now-30*DAY))/(5*DAY)));if(index>=0&&Date.parse(p.created_at)<=b.now)counts[index]++;});
  const max=Math.max(1,...counts);
  return `<div class="chart" role="img" aria-label="PRs opened in consecutive five-day windows: ${counts.join(', ')}">${counts.map(c=>`<div class="bar-group"><div class="bar" style="height:${Math.max(2,c/max*70)}px"></div><small>${c}</small></div>`).join('')}</div><div class="chart-legend"><span>30 DAYS AGO</span><span>TODAY</span></div>`;
}
function saveBrief() {
  const key=current.org.login+(current.meta.demo?':demo':'');
  const next=[current,...saved.filter(b=>b.org.login+(b.meta.demo?':demo':'')!==key)].slice(0,5);
  try{localStorage.setItem('repo-signal-saved',JSON.stringify(next));saved=next;renderSaved();notify('Brief saved in this browser');}catch{notify('Could not save. Browser storage may be full or unavailable.');}
}
function renderSaved() {
  $('saved-count').textContent=saved.length;
  $('saved-list').innerHTML=saved.length?saved.map((b,i)=>`<div class="saved-row"><button class="text-button" data-open-saved="${i}">${esc(b.org.name || b.org.login)}${b.meta.demo?' · sample':''}</button><small>${esc(date(b.now))}</small><button class="outline-button" data-delete-saved="${i}" aria-label="Delete saved brief for ${esc(b.org.name||b.org.login)}">×</button></div>`).join(''):'<p class="saved-empty">No saved briefs yet. Research a company, then choose “Save brief.”</p>';
  document.querySelectorAll('[data-open-saved]').forEach(button=>button.onclick=()=>{if(controller){notify('Finish or cancel the current search first.');return;}activeTab='overview';render(saved[Number(button.dataset.openSaved)]);$('results').scrollIntoView({behavior:'smooth',block:'start'});});
  document.querySelectorAll('[data-delete-saved]').forEach(button=>button.onclick=()=>{const next=saved.filter((_,i)=>i!==Number(button.dataset.deleteSaved));try{localStorage.setItem('repo-signal-saved',JSON.stringify(next));saved=next;renderSaved();}catch{notify('Could not update browser storage.');}});
}
function downloadBrief() {
  const blob=new Blob([exportBrief(current)],{type:'text/markdown;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=`${current.org.login}${current.meta.demo?'-sample':''}-research-brief.md`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function setBusy(busy) {
  $('analyze-button').disabled=busy; $('organization').disabled=busy; $('demo-button').disabled=busy;
  $('cancel-button').classList.toggle('hidden',!busy);$('progress').classList.toggle('hidden',!busy);$('results').classList.toggle('loading-results',busy);
  $('results').inert=busy;
}
$('research-form').addEventListener('submit',async event=>{
  event.preventDefault();if(controller)return;
  $('error').classList.add('hidden');
  let login;
  try{login=parseOrganization($('organization').value);}catch(e){$('error').textContent=e.message;$('error').classList.remove('hidden');return;}
  controller=new AbortController();setBusy(true);
  try{
    const cacheKey='repo-signal-cache:'+login;
    let brief;
    try{const cached=JSON.parse(sessionStorage.getItem(cacheKey)||'null');if(cached && Date.now()-cached.now<10*60000 && Date.now()>=cached.now)brief=cached;}catch{}
    if(!brief){brief=await researchOrganization(login,{signal:controller.signal,onProgress:message=>$('progress-text').textContent=message});try{sessionStorage.setItem(cacheKey,JSON.stringify(brief));}catch{}}
    if(controller.signal.aborted)return;
    activeTab='overview';render(brief);notify('Research brief ready');
  }catch(e){if(e.name!=='AbortError'){$('error').textContent=e instanceof TypeError?'Could not connect to GitHub. Check your connection and try again.':e.message;$('error').classList.remove('hidden');}else notify('Research cancelled');}
  finally{controller=null;setBusy(false);}
});
$('cancel-button').onclick=()=>controller?.abort();
$('demo-button').onclick=()=>{if(controller)return;activeTab='overview';render(demoBrief());$('error').classList.add('hidden');};
$('nav-research').onclick=()=>{$('saved-panel').classList.add('hidden');$('organization').focus();};
$('nav-saved').onclick=()=>{$('saved-panel').classList.toggle('hidden');renderSaved();if(!$('saved-panel').classList.contains('hidden'))$('saved-panel').scrollIntoView({behavior:'smooth'});};
$('mobile-saved').onclick=()=>$('nav-saved').click();
$('close-saved').onclick=()=>$('saved-panel').classList.add('hidden');
$('nav-method').onclick=()=>{$('methodology').open=true;$('methodology').scrollIntoView({behavior:'smooth',block:'center'});};
renderSaved();render(demoBrief());
