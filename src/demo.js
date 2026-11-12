import {summarize, DAY} from './analysis.js';

export function demoBrief(now = Date.now()) {
  const iso = days => new Date(now - days * DAY).toISOString();
  const authors = ['alex-chen','sam-rivera','jordan-lee','taylor-kim','morgan-w','casey-r','jamie-p','devon-b','avery-s','riley-t','quinn-j','skyler-d'];
  const names = ['platform', 'api', 'dashboard'];
  const counts = [28, 19, 15];
  const titles = ['Improve worker retry handling', 'Add organization usage endpoint', 'Update workspace permissions', 'Refactor event delivery pipeline', 'Support paginated audit logs', 'Fix settings form validation'];
  const repositories = names.map((name, i) => {
    const recent = Array.from({length:counts[i]}, (_,j) => ({number:100+i*100+j, title:titles[j%titles.length], repo:name,
      created_at:iso(j * 29 / counts[i]), state:j<6?'open':'closed', draft:false, user:{login:authors[(j+i*4)%authors.length],type:'User'}, html_url:null}));
    const open = recent.slice(0,6).map((p,j) => ({...p, created_at:iso(3+j*1.6+i)}));
    const samples = open.slice(-2).map((pr,j) => ({pr, reviewsCapped:false,
      reviews: i === 0 || (i === 1 && j === 0) ? [] : [{state:'APPROVED', user:{login:'reviewer',type:'User'},submitted_at:new Date(Date.parse(pr.created_at)+(8+i+j)*3600000).toISOString()}],
      detail:{additions: i===2 ? 48:430, deletions:i===2?12:120}}));
    return {repo:{name, full_name:`northstar-example/${name}`,language:['TypeScript','Go','TypeScript'][i],stargazers_count:[1240,846,320][i],pushed_at:iso(i+0.2)}, recent, open, samples};
  });
  return summarize({login:'northstar-example',name:'Northstar Labs',description:'Developer infrastructure for ambitious teams.',public_repos:24}, repositories, now,
    {demo:true, repoScan:24, selectedCount:3, warnings:[]});
}
