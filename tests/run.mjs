import assert from 'node:assert/strict';
import {parseOrganization, isHuman, selectRepositories, firstExternalReview, summarize, median, DAY, exportBrief} from '../src/analysis.js';
import {collectPages, createClient, researchOrganization} from '../src/github.js';
import {demoBrief} from '../src/demo.js';

export async function runTests() {
  const results=[];
  const test=async(name,fn)=>{await fn();results.push(name);};
  const now=Date.parse('2026-11-12T00:00:00Z');
  const user={login:'alice',type:'User'};
  const pr={number:1,repo:'core',title:'A change',html_url:'https://github.com/example/core/pull/1',user,draft:false,created_at:new Date(now-3*DAY).toISOString()};
  const repo={name:'core',pushed_at:new Date(now-DAY).toISOString(),fork:false,archived:false};
  const org={login:'example',name:'Example'};
  const review=(login,hours,type='User')=>({state:'APPROVED',user:{login,type},submitted_at:new Date(Date.parse(pr.created_at)+hours*3600000).toISOString()});
  await test('Accept organization names and canonical GitHub URLs',()=>{
    for(const input of ['Vercel','https://github.com/Vercel/','github.com/Vercel']) assert.equal(parseOrganization(input),'vercel');
  });
  await test('Reject repository URLs, hostile domains, invalid names and empty input',()=>{
    for(const input of ['','https://github.com/vercel/next.js','https://github.com.evil.test/vercel','a--b','-abc','abc-','a/b','javascript:alert(1)'])assert.throws(()=>parseOrganization(input));
  });
  await test('Identify bots without excluding ordinary users',()=>{assert.equal(isHuman(user),true);assert.equal(isHuman({login:'x[bot]',type:'User'}),false);assert.equal(isHuman({login:'bot',type:'Bot'}),false);assert.equal(isHuman(null),false);});
  await test('Exclude forks, archives, disabled and inactive repositories; select latest three',()=>{
    const candidates=[repo,{...repo,name:'archive',archived:true},{...repo,name:'fork',fork:true},{...repo,name:'disabled',disabled:true},{...repo,name:'old',pushed_at:new Date(now-31*DAY).toISOString()},...['a','b','c'].map((name,i)=>({...repo,name,pushed_at:new Date(now-i*1000).toISOString()}))];
    assert.deepEqual(selectRepositories(candidates,now).map(r=>r.name),['a','b','c']);
  });
  await test('First human external review excludes bots, self, pending and future reviews',()=>{
    const reviews=[review('alice',1),review('robot',2,'Bot'),{...review('bob',3),state:'PENDING'},review('bob',4),review('carol',5),review('dave',999)];
    assert.equal(firstExternalReview(pr,reviews,now).user.login,'bob');
    assert.equal(firstExternalReview(pr,[review('alice',1),review('x[bot]',1)],now),null);
  });
  await test('Median handles empty, odd and even sample sizes',()=>{assert.equal(median([]),null);assert.equal(median([3,1,9]),3);assert.equal(median([1,7,3,5]),4);});
  await test('Window counts exclude old/future PRs and bots; draft exclusion differs by metric',()=>{
    const draft={...pr,number:2,draft:true};
    const recent=[pr,draft,{...pr,created_at:new Date(now-31*DAY).toISOString()},{...pr,created_at:new Date(now+DAY).toISOString()},{...pr,user:{login:'bot',type:'Bot'}}];
    const brief=summarize(org,[{repo,recent,open:recent.slice(0,2),samples:[]}],now);
    assert.equal(brief.metrics.prs,2);assert.equal(brief.metrics.authors,1);assert.equal(brief.metrics.open,1);assert.equal(brief.metrics.medianHours,null);
  });
  await test('Missing or capped review data never becomes an absent-review signal',()=>{
    const brief=summarize(org,[{repo,recent:[pr],open:[pr],samples:[{pr,reviews:null,detail:null},{pr,reviews:[],reviewsCapped:true,detail:null}]}],now);
    assert.equal(brief.metrics.aged,0);assert.equal(brief.metrics.large,0);
  });
  await test('Complete review history and size at threshold yield evidence-based signals',()=>{
    const brief=summarize(org,[{repo,recent:[pr],open:[pr],samples:[{pr,reviews:[],reviewsCapped:false,detail:{additions:450,deletions:50}}]}],now);
    assert.equal(brief.metrics.aged,1);assert.equal(brief.metrics.large,1);assert.equal(brief.signals.length,3);assert.ok(brief.outreach.includes('1 human-authored PRs'));assert.ok(exportBrief(brief).includes(pr.html_url));
  });
  await test('No activity produces discovery copy without fabricated claims',()=>{
    const brief=summarize(org,[],now);assert.equal(brief.signals[0].type,'Limited evidence');assert.ok(!brief.outreach.includes('counted'));assert.equal(brief.metrics.prs,0);
  });
  await test('Pagination follows next links and labels capped results',async()=>{
    const calls=[];const result=await collectPages(async path=>{calls.push(path);return {data:[calls.length],hasNext:true};},'/orgs/example/repos?sort=pushed',2);
    assert.equal(calls.length,2);assert.deepEqual(result.items,[1,2]);assert.equal(result.capped,true);assert.ok(calls[1].includes('&per_page=100&page=2'));
  });
  await test('Chronological cutoff ends pagination without reporting truncation',async()=>{
    let calls=0;const result=await collectPages(async()=>{calls++;return {data:[{old:true}],hasNext:true};},'/repos/example/core/pulls',3,items=>items[0].old);
    assert.equal(calls,1);assert.equal(result.capped,false);
  });
  await test('Rate-limit errors are actionable and request credentials are omitted',async()=>{
    let options;
    const client=createClient({fetchImpl:async(url,opts)=>{options=opts;return {ok:false,status:403,headers:new Headers({'x-ratelimit-reset':String(now/1000)})};}});
    await assert.rejects(()=>client('/orgs/example'),error=>error.status===403&&error.message.includes('limited or denied'));
    assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,undefined);
  });
  await test('Cancellation prevents issuing more requests',async()=>{
    const controller=new AbortController();controller.abort();let calls=0;
    const client=createClient({signal:controller.signal,fetchImpl:async()=>{calls++;}});
    await assert.rejects(()=>client('/orgs/example'),error=>error.name==='AbortError');assert.equal(calls,0);
  });
  await test('End-to-end collection joins PRs, reviews and detail with deterministic counts',async()=>{
    const client=async path=>{
      if(path==='/orgs/example')return {data:org};
      if(path.startsWith('/orgs/example/repos?'))return {data:[repo],hasNext:false};
      if(path.includes('/pulls?'))return {data:[pr],hasNext:false};
      if(path.includes('/reviews?'))return {data:[review('bob',4)],hasNext:false};
      if(path.endsWith('/pulls/1'))return {data:{additions:100,deletions:20}};
      throw new Error('Unexpected path '+path);
    };
    const brief=await researchOrganization('example',{client,now});assert.equal(brief.metrics.prs,1);assert.equal(brief.metrics.medianHours,4);assert.equal(brief.meta.warnings.length,0);assert.equal(brief.samples.length,1);
  });
  await test('Partial repository failures are disclosed, never counted as zeros',async()=>{
    const client=async path=>{
      if(path==='/orgs/example')return {data:org};
      if(path.startsWith('/orgs/'))return {data:[repo,{...repo,name:'broken'}],hasNext:false};
      if(path.startsWith('/repos/example/broken'))throw new Error('Unavailable');
      return {data:[],hasNext:false};
    };
    const brief=await researchOrganization('example',{client,now});assert.equal(brief.repositories.length,1);assert.ok(brief.meta.warnings[0].includes('excluded from counts'));
  });
  await test('Fictional sample remains marked in exports',()=>{const brief=demoBrief(now);assert.equal(brief.metrics.prs,62);assert.equal(brief.metrics.aged,3);assert.ok(exportBrief(brief).includes('FICTIONAL SAMPLE'));});
  return {passed:results.length,tests:results};
}

// Runs both from the CLI and when imported for verification; rejection fails CI.
export const result=await runTests();
console.log(`${result.passed} checks passed.`);
