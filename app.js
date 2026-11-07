'use strict';
const venues=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const $=id=>document.getElementById(id), pad=n=>String(n).padStart(2,'0');
const jst=new Date(Date.now()+9*3600000).toISOString().slice(0,10);$('date').value=jst;
venues.forEach((v,i)=>$('venue').add(new Option(`${pad(i+1)} ${v}`,pad(i+1))));$('venue').value='12';for(let r=1;r<=12;r++)$('race').add(new Option(`${r}R`,r));$('race').value='12';
let entries=[],pred=[],isDemo=false,oddsMap={};
let conceptRows=[],conceptEnabled=false;
const sample=[['松井繁',6.99,7.31,42.75,6.77],['村上遼',6.69,5.33,45.38,6.79],['池田浩二',7.72,8,35.66,6.78],['久田敏之',7.88,7.59,33.58,6.84],['山田哲也',6.57,5.25,39.2,6.89],['石本裕武',6.67,6.44,31.06,6.73]].map((a,i)=>({lane:i+1,name:a[0],class:'A1',national:a[1],local:a[2],motor:a[3],exhibition:a[4]}));
function csvParse(text){let rows=[],row=[],cell='',quoted=false;for(let i=0;i<text.length;i++){let c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++}else quoted=!quoted}else if(c===','&&!quoted){row.push(cell);cell=''}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell=''}else cell+=c}row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows}
function objects(csv){let rows=csvParse(csv.replace(/^\ufeff/,''));if(!rows.length)return [];let h=rows.shift();return rows.map(r=>Object.fromEntries(h.map((k,i)=>[k.trim(),(r[i]||'').trim()])))}
function val(o,keys){for(const k of keys){if(o[k]!==undefined&&o[k]!=='')return o[k]}return ''}
function number(v){let n=parseFloat(String(v).replace(/[%％]/g,''));return Number.isFinite(n)?n:null}
function matching(o,code,r,date){const id=val(o,['レースコード','race_code','race_id']);if(id&&/^\d{12}$/.test(id))return id===date.replaceAll('-','')+code+pad(r);const venue=val(o,['レース場コード','場コード','場番号','競艇場コード','jcd']);const race=val(o,['レース回','レース番号','R','race_no']);return venue&&race&&pad(Number(venue))===code&&Number(String(race).replace(/R$/i,''))===r}
function normalize(rows,code,r,date){const matched=rows.filter(o=>matching(o,code,r,date));const byLane=new Map();for(const o of matched){if(val(o,['艇1_選手名'])){for(let j=1;j<=6;j++){const prefix=`艇${j}_`;const name=val(o,[prefix+'選手名']);if(!name)continue;byLane.set(j,{lane:j,name,class:val(o,[prefix+'級別']),national:number(val(o,[prefix+'全国勝率'])),local:number(val(o,[prefix+'当地勝率'])),motor:number(val(o,[prefix+'モーター2連対率'])),exhibition:null})}continue}
let lane=number(val(o,['艇番','枠番','艇番号','枠','boat_no','lane']));if(lane>=1&&lane<=6)byLane.set(lane,{lane,name:val(o,['選手名','氏名','レーサー名','選手氏名','name'])||'未取得',class:val(o,['級別','級','class']),national:number(val(o,['全国勝率','勝率','全国_勝率'])),local:number(val(o,['当地勝率','当地_勝率'])),motor:number(val(o,['モーター2連対率','モーター2連率'])),exhibition:null})}return [...byLane.values()].sort((a,b)=>a.lane-b.lane)}
async function getCSV(dataset,date){const [y,m,d]=date.split('-');const path=`${dataset}/${y}/${m}/${d}.csv`;const urls=[`data/cache/${path}`,`https://boatracecsv.github.io/data/${path}`];let errors=[];for(const url of urls){try{const response=await fetch(url,{cache:'no-store'});if(!response.ok)throw Error(`HTTP ${response.status}`);const rows=objects(await response.text());if(!rows.length)throw Error('CSVが空です');return {rows,url}}catch(e){errors.push(`${url}: ${e.message}`)}}throw Error(errors.join(' / '))}
const safe=s=>String(s??'—').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(){let venue=venues[Number($('venue').value)-1];$('raceTitle').textContent=`${$('date').value} ${venue} ${$('race').value}R 出走表${isDemo?'（サンプル）':''}`;$('entries').innerHTML=entries.map(e=>`<tr><td><span class="lane ${e.lane>1?'lane'+e.lane:''}">${e.lane}</span></td><td>${safe(e.name)}</td><td>${safe(e.class)}</td><td>${fmt(e.national)}</td><td>${fmt(e.local)}</td><td>${fmt(e.motor)}%</td><td>${fmt(e.exhibition)}</td></tr>`).join('');$('dataNote').textContent=isDemo?'2026/11/7 住之江12Rの提供画像から作成した固定サンプル。現在の実データではありません。':'公開CSVから取得。欠損項目は—表示。';applyConcept();compute()}
function fmt(x){return x==null?'—':Number(x).toFixed(2)}
// Shared pre-race model: historical simulation uses only race-card fields (no post-race data).
function probabilitiesFor(racers, useConcept=true){
 if(racers.length!==6)return [];
 const strengths=racers.map(e=>{
  const score=1+(e.national??6.5)*.16+(e.local??6.5)*.08+(e.motor??35)*.008+(e.exhibition==null?0:(6.85-e.exhibition)*1.5);
  let factor=1;
  // Experimental heuristic, not calibrated or endorsed by BOATBoy.
  if(useConcept && e.concept){
   const c=e.concept;
   if(e.lane===1 && c.win1!=null)factor*=Math.max(.65,Math.min(1.5, .75+c.win1/200));
   if(e.lane===2 && c.escape2!=null)factor*=Math.max(.8,Math.min(1.2,1.1-c.escape2/500));
   if(e.lane>=2 && c.makuri!=null)factor*=Math.max(.85,Math.min(1.25,.9+c.makuri/150));
   if(e.lane>=2 && c.sashi!=null)factor*=Math.max(.85,Math.min(1.25,.9+c.sashi/150));
  }
  return Math.max(.2,score)*([1.65,1.10,1.03,.94,.77,.62][e.lane-1])*factor;
 });
 const total=strengths.reduce((a,b)=>a+b,0),out=[];
 for(let a=0;a<6;a++)for(let b=0;b<6;b++)for(let c=0;c<6;c++){
  if(a===b||a===c||b===c)continue;
  const p=strengths[a]/total*strengths[b]/(total-strengths[a])*strengths[c]/(total-strengths[a]-strengths[b]);
  out.push({bet:`${a+1}-${b+1}-${c+1}`,p});
 }
 return out.sort((a,b)=>b.p-a.p);
}
function compute(){
 pred=[];
 if(entries.length!==6){$('predictions').innerHTML='';$('best').textContent='—';$('bestP').textContent='—';$('betSummary').textContent='';return}
 // Plackett-Luce style sequential ordering: P(a,b,c)=P(a)*P(b|a)*P(c|a,b).
 // Hand-tuned strengths, not fitted to historical outcomes; NOT calibrated probabilities.
 pred=probabilitiesFor(entries,conceptEnabled).map(item=>{const odd=oddsMap[item.bet]||null;return {...item,odds:odd,ev:odd?item.p*odd:null};});
 $('best').textContent=pred[0].bet;$('bestP').textContent=(pred[0].p*100).toFixed(2)+'%';renderBets();
}
function selectedBets(){
 const strategy=$('strategy').value;
 let sorted=[...pred];
 if(strategy==='ev')sorted=sorted.filter(p=>p.ev!=null&&p.ev>1).sort((a,b)=>b.ev-a.ev);
 else if($('sort').value==='ev')sorted.sort((a,b)=>(b.ev??-1)-(a.ev??-1));
 return sorted.slice(0,Number($('count').value));
}
function renderBets(){
 const selected=selectedBets();
 const budget=Math.max(0,Math.floor((Number($('budget').value)||0)/100)*100);
 const units=Math.floor(budget/100);
 const allocations=selected.map((p,i)=>i<Math.min(units,selected.length)?100:0);
 let remaining=units-Math.min(units,selected.length),cursor=0;
 while(remaining>0&&selected.length){allocations[cursor%selected.length]+=100;remaining--;cursor++}
 $('predictions').innerHTML=selected.map((p,i)=>`<tr><td><b>${p.bet}</b></td><td>${(p.p*100).toFixed(2)}%</td><td>${p.odds??'—'}</td><td>${p.ev==null?'—':p.ev.toFixed(3)+'倍'}</td><td>${allocations[i]}円</td></tr>`).join('');
 const spent=allocations.reduce((a,b)=>a+b,0);
 $('betSummary').textContent=`${selected.length}点 / 配分 ${spent.toLocaleString()}円（設定予算 ${budget.toLocaleString()}円） / 確率合計 ${(pred.reduce((a,b)=>a+b.p,0)*100).toFixed(6)}%。期待値は推定確率×オッズであり利益を保証しません。`;
}
$('export').onclick=()=>{
 if(!pred.length){$('message').textContent='先に出走表を取得してください';return}
 const rows=[['race_id','bet','estimated_probability','odds','expected_return_multiple','sample'],...pred.map(p=>[`${$('date').value.replaceAll('-','')}${$('venue').value}${pad($('race').value)}`,p.bet,p.p.toFixed(8),p.odds??'',p.ev?.toFixed(6)??'',isDemo?'yes':'no'])];
 const csv='\ufeff'+rows.map(r=>r.join(',')).join('\r\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`boat-ai-v3-${$('date').value}-${$('venue').value}-${$('race').value}R.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('load').onclick=async()=>{const date=$('date').value;if(!date)return;const code=$('venue').value,r=Number($('race').value);$('load').disabled=true;$('message').textContent='公開CSVを取得中…';$('status').textContent='取得中';$('message').className='muted';entries=[];isDemo=false;render();try{const card=await getCSV('programs/race_cards',date);const result=normalize(card.rows,code,r,date);if(result.length!==6)throw Error(`該当レースの6艇を確認できません（${result.length}艇）。開催がない、未公開、またはCSV仕様変更の可能性があります。`);let exhibitionStatus='展示情報未取得';try{const preview=await getCSV('previews/tkz',date);const row=preview.rows.find(o=>matching(o,code,r,date));if(row){let found=0;for(const e of result){const raw=val(row,[`艇${e.lane}_展示タイム`,`艇${e.lane}_展示`, `艇${e.lane}_展示航走タイム`]);const n=number(raw);if(n>0){e.exhibition=n;found++}}exhibitionStatus=`展示${found}艇取得`}}catch(e){exhibitionStatus='展示CSV未公開または取得不可'}entries=result;render();$('message').textContent=`実データ取得成功（${card.rows.length}レース中の該当レース） / ${exhibitionStatus} / 取得元: ${card.url}`;$('status').textContent='実データ';$('message').className='success'}catch(err){entries=[];render();$('message').textContent=`実データ取得失敗: ${err.message}。日付・場・Rを確認してください。サンプルは自動表示しません。`;$('status').textContent='取得失敗';$('message').className='error'}finally{$('load').disabled=false}};
$('demo').onclick=()=>{entries=sample.map(x=>({...x}));isDemo=true;$('date').value='2026-11-07';$('venue').value='12';$('race').value='12';$('message').textContent='提供画像のサンプルを表示中（ライブ取得ではありません）';$('status').textContent='サンプル';$('message').className='muted';render()};
$('applyOdds').onclick=()=>{oddsMap={};for(const line of $('odds').value.split(/\r?\n/)){const [bet,odd]=line.split(',').map(x=>x.trim());if(/^([1-6]-){2}[1-6]$/.test(bet)&&number(odd)>0)oddsMap[bet]=number(odd)}compute()};for(const id of ['sort','count','budget','strategy'])$(id).onchange=renderBets;
// Historical evaluation uses only archived pre-race prediction probabilities.
const validBet=bet=>/^[1-6]-[1-6]-[1-6]$/.test(bet)&&new Set(bet.split('-')).size===3;
const csvRows=async file=>objects(await file.text()).filter(r=>r.race_id!=='race_id');
$('runBacktest').onclick=async()=>{
 const predictionFiles=[...$('predictionHistory').files], resultFile=$('resultHistory').files[0];
 const message=$('backtestMsg');message.className='muted';
 for(const id of ['tested','hit','roi','logloss','brier','actualP'])$(id).textContent='—';
 $('backtestRows').innerHTML='';
 if(!predictionFiles.length||!resultFile){message.textContent='予測CSVと確定結果CSVを両方選択してください。';return}
 $('runBacktest').disabled=true;
 try{
  const predictions=new Map();let ignoredSample=0;
  for(const file of predictionFiles){
   for(const row of await csvRows(file)){
    const id=String(row.race_id||'').trim(),bet=String(row.bet||'').trim(),p=Number(row.estimated_probability);
    if(String(row.sample||'').toLowerCase()==='yes'){ignoredSample++;continue}
    if(!/^\d{12}$/.test(id)||!validBet(bet)||row.estimated_probability===''||!Number.isFinite(p)||p<0||p>1)throw Error(`予測CSV「${file.name}」に不正な行があります: ${id} / ${bet}`);
    if(!predictions.has(id))predictions.set(id,new Map());
    if(predictions.get(id).has(bet))throw Error(`予測が重複しています: ${id} / ${bet}`);
    predictions.get(id).set(bet,p);
   }
  }
  const results=new Map();
  for(const row of await csvRows(resultFile)){
   const id=String(row.race_id||'').trim(),actual=String(row.actual||'').trim();
   const hasPayout=String(row.payout??'').trim()!=='';
   const payout=hasPayout?Number(row.payout):null;
   if(!/^\d{12}$/.test(id)||!validBet(actual)||(hasPayout&&(!Number.isFinite(payout)||payout<0)))throw Error(`結果CSVに不正な行があります: ${id} / ${actual}`);
   if(results.has(id))throw Error(`結果CSVでレースIDが重複: ${id}`);
   results.set(id,{actual,payout});
  }
  const topN=Number($('backtestTop').value),stake=Number($('backtestStake').value);
  if(!Number.isInteger(stake)||stake<100||stake%100!==0)throw Error('購入額は100円以上・100円単位で指定してください。');
  let evaluated=0,wins=0,spent=0,returned=0,priced=0,ll=0,bs=0,actualPSum=0,invalid=0,unmatched=0;
  const details=[];
  for(const [id,betMap] of predictions){
   const result=results.get(id);
   if(!result){unmatched++;continue}
   const values=[...betMap.values()],total=values.reduce((a,b)=>a+b,0);
   if(betMap.size!==120||Math.abs(total-1)>0.001||!betMap.has(result.actual)){invalid++;continue}
   const ranked=[...betMap].sort((a,b)=>b[1]-a[1]).slice(0,topN);
   const hit=ranked.some(([bet])=>bet===result.actual),correctP=betMap.get(result.actual);
   const raceSpend=topN*stake,raceReturn=result.payout==null?null:(hit?result.payout*stake/100:0);
   evaluated++;if(hit)wins++;actualPSum+=correctP;
   ll+=-Math.log(Math.max(correctP,1e-15));
   bs+=([...betMap].reduce((sum,[bet,p])=>sum+(p-(bet===result.actual?1:0))**2,0));
   if(raceReturn!=null){spent+=raceSpend;returned+=raceReturn;priced++}
   details.push({id,actual:result.actual,hit,correctP,raceSpend,raceReturn});
  }
  if(!evaluated)throw Error(`照合可能な120通りの予測がありません（結果未照合 ${unmatched}レース、不完全な予測 ${invalid}レース）。`);
  $('tested').textContent=String(evaluated);
  $('hit').textContent=(wins/evaluated*100).toFixed(1)+'%';
  $('roi').textContent=priced? (returned/spent*100).toFixed(1)+'%':'—';
  $('logloss').textContent=(ll/evaluated).toFixed(4);
  $('brier').textContent=(bs/evaluated).toFixed(4);
  $('actualP').textContent=(actualPSum/evaluated*100).toFixed(2)+'%';
  $('backtestRows').innerHTML=details.map(d=>`<tr><td>${safe(d.id)}</td><td>${safe(d.actual)}</td><td>${d.hit?'的中':'不的中'}</td><td>${(d.correctP*100).toFixed(2)}%</td><td>${d.raceSpend.toLocaleString()}円</td><td>${d.raceReturn==null?'—':d.raceReturn.toLocaleString()+'円'}</td></tr>`).join('');
  message.textContent=`照合 ${evaluated}レース、的中 ${wins}レース。結果未照合 ${unmatched}レース、不完全な予測 ${invalid}レース、サンプル行除外 ${ignoredSample}行。回収率は払戻がある ${priced}レースのみ（投資 ${spent.toLocaleString()}円 / 払戻 ${returned.toLocaleString()}円）。予測の事前保存時刻はCSVだけでは検証できません。`;
  message.className='success';
 }catch(err){message.textContent='検証失敗: '+err.message;message.className='error'}
 finally{$('runBacktest').disabled=false}
};

// Historical reference simulation. No future outcomes are used in probability calculation.
$('autoVenue').add(new Option('全24場','all'));
venues.forEach((name,i)=>$('autoVenue').add(new Option(`${pad(i+1)} ${name}`,pad(i+1))));
$('autoVenue').value='all';
const yesterday=new Date(Date.parse(jst+'T00:00:00Z')-86400000).toISOString().slice(0,10);
$('autoEnd').value=yesterday;
$('autoStart').value=new Date(Date.parse(yesterday+'T00:00:00Z')-89*86400000).toISOString().slice(0,10);
const raceId=o=>String(val(o,['レースコード','race_code','race_id'])).trim();
const datesBetween=(start,end)=>{
 const a=Date.parse(start+'T00:00:00Z'),b=Date.parse(end+'T00:00:00Z');
 if(!Number.isFinite(a)||!Number.isFinite(b)||b<a)throw Error('開始日・終了日を確認してください。');
 const count=Math.round((b-a)/86400000)+1;
 if(count>90)throw Error('一度に検証できるのは最大90日間です。');
 if(b>=Date.parse(jst+'T00:00:00Z'))throw Error('結果確定済みの過去日を指定してください。');
 return Array.from({length:count},(_,i)=>new Date(a+i*86400000).toISOString().slice(0,10));
};
const uniqueRaceId=id=>/^\d{12}$/.test(id)&&Number(id.slice(8,10))>=1&&Number(id.slice(8,10))<=24&&Number(id.slice(10,12))>=1&&Number(id.slice(10,12))<=12;
let cancelAutoRequested=false, autoDetails=[],autoDateCount=0;
const topOptions=[1,3,5,10];
const summaryFor=(items,n,stake)=>{
 const races=items.length,wins=items.filter(d=>d.ranks[n]).length,spent=races*n*stake;
 const returned=items.reduce((s,d)=>s+(d.ranks[n]?d.payout*stake/100:0),0);
 const brier=races?items.reduce((s,d)=>s+d.brier,0)/races:null;
 return {races,wins,spent,returned,hit:races?wins/races*100:null,roi:spent?returned/spent*100:null,brier};
};
const pct=n=>n==null?'—':n.toFixed(1)+'%';
const yen=n=>n.toLocaleString('ja-JP')+'円';
const periodLabel=p=>p==='train'?'前半60日':p==='test'?'後半30日':'全期間';
function renderAutoResults(){
 const stake=Number($('autoStake').value),selectedN=Number($('autoTop').value),all=autoDetails;
 const sets={all,train:all.filter(d=>d.period==='train'),test:all.filter(d=>d.period==='test')};
 const overall=summaryFor(all,selectedN,stake);
 $('autoTested').textContent=String(overall.races);
 $('autoHit').textContent=pct(overall.hit);
 $('autoRoi').textContent=pct(overall.roi);
 $('autoBrier').textContent=overall.brier==null?'—':overall.brier.toFixed(4);
 $('periodRows').innerHTML=['train','test','all'].map(key=>{
  const s=summaryFor(sets[key],selectedN,stake);
  const days=key==='train'?Math.min(autoDateCount,60):key==='test'?Math.max(0,autoDateCount-60):autoDateCount;
  return `<tr><td>${periodLabel(key)}</td><td>${days}</td><td>${s.races}</td><td>${s.wins}</td><td>${pct(s.hit)}</td><td>${yen(s.spent)}</td><td>${yen(s.returned)}</td><td>${pct(s.roi)}</td><td>${s.brier==null?'—':s.brier.toFixed(4)}</td></tr>`;
 }).join('');
 $('topCompareRows').innerHTML=['train','test','all'].flatMap(key=>topOptions.map(n=>{
  const s=summaryFor(sets[key],n,stake);
  return `<tr><td>${periodLabel(key)}</td><td>${n}</td><td>${s.races}</td><td>${pct(s.hit)}</td><td>${yen(s.spent)}</td><td>${yen(s.returned)}</td><td>${pct(s.roi)}</td></tr>`;
 })).join('');
 const rankItems=sets[$('rankPeriod').value]||all;
 const stats=new Map();
 for(const d of rankItems){if(!stats.has(d.code))stats.set(d.code,[]);stats.get(d.code).push(d)}
 const ranked=[...stats].map(([code,rows])=>({code,...summaryFor(rows,selectedN,stake)}))
  .sort((a,b)=>(b.roi??-1)-(a.roi??-1)||b.races-a.races);
 $('venueRankRows').innerHTML=ranked.map((s,i)=>`<tr><td>${i+1}</td><td>${safe(venues[Number(s.code)-1])}</td><td>${s.races}</td><td>${s.wins}</td><td>${pct(s.hit)}</td><td>${yen(s.spent)}</td><td>${yen(s.returned)}</td><td>${pct(s.roi)}</td></tr>`).join('');
 $('autoRows').innerHTML=all.slice(0,300).map(d=>`<tr><td>${safe(d.id)}</td><td>${safe(d.actual)}</td><td>${d.ranks[selectedN]?'的中':'不的中'}</td><td>${(d.correctP*100).toFixed(2)}%</td><td>${yen(d.payout)}</td><td>${yen(d.ranks[selectedN]?d.payout*stake/100:0)}</td></tr>`).join('');
}
$('rankPeriod').onchange=()=>{if(autoDetails.length)renderAutoResults()};
$('cancelAuto').onclick=()=>{cancelAutoRequested=true;$('autoMsg').textContent='中止要求を受け付けました。現在の取得処理が終わり次第停止します。'};
$('exportAuto').onclick=()=>{
 if(!autoDetails.length)return;
 const n=Number($('autoTop').value),stake=Number($('autoStake').value);
 const header=['race_id','date','venue_code','venue','period','actual','predicted_probability','top_n','hit','stake_yen','payout_per_100_yen','returned_yen','brier'];
 const rows=autoDetails.map(d=>[d.id,d.date,d.code,venues[Number(d.code)-1],periodLabel(d.period),d.actual,d.correctP.toFixed(8),n,d.ranks[n]?1:0,n*stake,d.payout,d.ranks[n]?d.payout*stake/100:0,d.brier.toFixed(8)]);
 const csv='\ufeff'+[header,...rows].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=`boat-ai-v3.4-backtest-${$('autoStart').value}-${$('autoEnd').value}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('runAuto').onclick=async()=>{
 const button=$('runAuto'),cancel=$('cancelAuto'),msg=$('autoMsg');
 button.disabled=true;cancel.disabled=false;cancelAutoRequested=false;msg.className='muted';
 autoDetails=[];autoDateCount=0;$('exportAuto').disabled=true;
 for(const id of ['autoTested','autoHit','autoRoi','autoBrier'])$(id).textContent='—';
 for(const id of ['autoRows','venueRankRows','periodRows','topCompareRows'])$(id).innerHTML='';
 try{
  const dates=datesBetween($('autoStart').value,$('autoEnd').value),venue=$('autoVenue').value;
  const topN=Number($('autoTop').value),stake=Number($('autoStake').value);
  if(![1,3,5,10,20].includes(topN))throw Error('買い目数が不正です。');
  if(!Number.isInteger(stake)||stake<100||stake%100)throw Error('購入額は100円以上・100円単位にしてください。');
  autoDateCount=dates.length;
  let skipped=0,missing=0,processed=0;
  async function processDate(date,idx){
   if(cancelAutoRequested)return;
   let cards,payouts;
   try{[cards,payouts]=await Promise.all([getCSV('programs/race_cards',date),getCSV('results/payouts',date)]);}catch(err){missing++;processed++;return;}
   let results=null;
   try{results=(await getCSV('results/realtime',date)).rows;}catch(e){}
   const resultMap=new Map();
   if(results)for(const row of results){const id=raceId(row);if(uniqueRaceId(id))resultMap.set(id,row)}
   const seen=new Set();
   for(const row of payouts.rows){
    const id=raceId(row);
    if(!uniqueRaceId(id)||id.slice(0,8)!==date.replaceAll('-','')||(venue!=='all'&&id.slice(8,10)!==venue)||seen.has(id))continue;
    seen.add(id);
    const actual=String(val(row,['3連単_組番','３連単_組番','三連単_組番'])).trim();
    const payoutRaw=String(val(row,['3連単_払戻金','３連単_払戻金','三連単_払戻金'])).replace(/[,，円\s]/g,'');
    const payout=Number(payoutRaw);
    if(!validBet(actual)||!payoutRaw||!Number.isFinite(payout)||payout<=0){skipped++;continue}
    const resultRow=resultMap.get(id);
    if(results&&!resultRow){skipped++;continue}
    if(resultRow){const finishing=[1,2,3].map(n=>String(val(resultRow,[`${n}着_艇番`])).trim()).join('-');if(finishing!==actual){skipped++;continue}}
    const code=id.slice(8,10),r=Number(id.slice(10,12));
    const racers=normalize(cards.rows,code,r,date);
    if(racers.length!==6||racers.some(e=>!e.name||e.name==='未取得')){skipped++;continue}
    const probabilities=probabilitiesFor(racers,false),correct=probabilities.find(p=>p.bet===actual);
    if(!correct||probabilities.length!==120){skipped++;continue}
    const ranks={};for(const n of [...topOptions,20])ranks[n]=probabilities.slice(0,n).some(p=>p.bet===actual);
    const brier=probabilities.reduce((sum,p)=>sum+(p.p-(p.bet===actual?1:0))**2,0);
    autoDetails.push({id,date,code,period:idx<60?'train':'test',actual,payout,correctP:correct.p,brier,ranks});
   }
   processed++;
  }
  for(let i=0;i<dates.length;i+=3){
   if(cancelAutoRequested)break;
   msg.textContent=`過去レース検証中：${processed}/${dates.length}日処理済み、${autoDetails.length}レース検証済み（中止可能）`;
   await Promise.all(dates.slice(i,i+3).map((date,j)=>processDate(date,i+j)));
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!autoDetails.length)throw Error(`検証可能なレースがありません。未取得 ${missing}日、除外 ${skipped}レース。`);
  autoDetails.sort((a,b)=>a.id.localeCompare(b.id));
  renderAutoResults();$('exportAuto').disabled=false;
  const s=summaryFor(autoDetails,topN,stake);
  msg.textContent=`${cancelAutoRequested?'中止時点の途中集計':'検証完了'}：${processed}/${dates.length}日、${s.races}レース、的中${s.wins}、投資${yen(s.spent)}、払戻${yen(s.returned)}、未取得${missing}日、除外${skipped}レース。期間比較は指定開始日から60日目で分割。過去の出走表だけを使う参考シミュレーションであり、展示タイム・事前保存予測は使用していません。`;
  msg.className='success';
 }catch(err){msg.textContent='自動検証失敗: '+err.message;msg.className='error'}
 finally{button.disabled=false;cancel.disabled=true}
};


// User-provided licensed data only; no scraping, login automation or redistribution.
function applyConcept(){
 for(const e of entries){
  const row=conceptRows.find(x=>x.date===$('date').value && x.venue===pad(Number($('venue').value)) && Number(x.race)===Number($('race').value) && Number(x.lane)===e.lane);
  e.concept=row||null;
 }
 const found=entries.filter(e=>e.concept).length;
 $('conceptStatus').textContent=conceptRows.length?`読込 ${conceptRows.length}行 / 現在のレースに一致 ${found}/6艇（未一致は従来モデル）`:'未読込：従来モデルで予測';
}
// v3.7: Atomic multi-file import, incremental merging and duplicate reporting.
const conceptKey37=(r)=>`${r.date}|${r.venue}|${r.race}|${r.lane}`;
function updateConceptInventory(){
 const groups=new Map();
 for(const r of conceptRows){const k=`${r.date}|${r.venue}|${r.race}`;if(!groups.has(k))groups.set(k,new Set());groups.get(k).add(r.lane)}
 const complete=[...groups.values()].filter(x=>x.size===6).length;
 $('conceptRowCount').textContent=String(conceptRows.length);
 $('conceptRaceCount').textContent=String(groups.size);
 $('conceptFullCount').textContent=String(complete);
 $('conceptPartialCount').textContent=String(groups.size-complete);
 $('conceptExport').disabled=!conceptRows.length;
}
function parseConcept37(r,file,line){
 const v={date:String(r.date||'').trim(),venue:pad(Number(r.venue)),race:Number(r.race),lane:Number(r.lane)};
 const [y,m,d]=v.date.split('-').map(Number),dt=new Date(Date.UTC(y,m-1,d));
 if(!/^\d{4}-\d{2}-\d{2}$/.test(v.date)||dt.getUTCFullYear()!==y||dt.getUTCMonth()!==m-1||dt.getUTCDate()!==d||!Number.isInteger(Number(r.venue))||Number(r.venue)<1||Number(r.venue)>24||!Number.isInteger(v.race)||v.race<1||v.race>12||!Number.isInteger(v.lane)||v.lane<1||v.lane>6)throw Error(`${file} ${line}行目：日付・場(1～24)・R(1～12)・艇番(1～6)を確認してください`);
 for(const key of ['win1','escape2','makuri','sashi']){
  const raw=String(r[key]??'').replace('%','').trim(),n=raw===''?null:Number(raw);
  if(n!==null&&(!Number.isFinite(n)||n<0||n>100))throw Error(`${file} ${line}行目：${key}は0～100で入力してください`);
  v[key]=n;
 }
 return v;
}
// v3.8: all import methods use the same validated, atomic merge path.
const conceptStoreKey='boat-ai-v3.8-concept-rows';
function saveConceptLocal(){
 try{localStorage.setItem(conceptStoreKey,JSON.stringify(conceptRows));$('conceptStorageStatus').textContent=`ブラウザに自動保存済み：${conceptRows.length}行。バックアップは「統合CSVを保存」をご利用ください。`}
 catch(e){$('conceptStorageStatus').textContent='ブラウザへの自動保存に失敗しました。統合CSVを保存してください：'+e.message}
}
function importConceptTexts(sources){
 const incoming=[];
 for(const {name,text} of sources){
  const rows=objects(text.replace(/^\uFEFF/,''));
  if(!rows.length||!['date','venue','race','lane'].every(k=>Object.hasOwn(rows[0],k)))throw Error(`${name}：date,venue,race,lane 列とデータ行が必要です`);
  rows.forEach((r,i)=>incoming.push(parseConcept37(r,name,i+2)));
 }
 const merged=new Map(conceptRows.map(r=>[conceptKey37(r),r]));let duplicates=0;
 for(const r of incoming){const k=conceptKey37(r);if(merged.has(k))duplicates++;merged.set(k,r)}
 conceptRows=[...merged.values()].sort((a,b)=>conceptKey37(a).localeCompare(conceptKey37(b)));
 conceptEnabled=true;$('conceptToggle').checked=true;
 updateConceptInventory();applyConcept();compute();saveConceptLocal();
 $('conceptImportStatus').textContent=`追加 ${sources.length}件・${incoming.length}行 / 重複 ${duplicates}行（後読み優先）/ 統合 ${conceptRows.length}行。`;
 $('conceptImportStatus').className='success';
}
async function importConceptFiles(files){
 if(!files.length)return;
 try{const sources=await Promise.all(files.map(async f=>({name:f.name,text:await f.text()})));importConceptTexts(sources)}
 catch(err){$('conceptImportStatus').textContent='読み込み失敗（既存データは保持）：'+err.message;$('conceptImportStatus').className='error'}
}
$('conceptFile').addEventListener('change',async event=>{
 await importConceptFiles([...event.target.files]);event.target.value='';
});
$('conceptPasteAdd').addEventListener('click',()=>{
 try{importConceptTexts([{name:'貼り付けCSV',text:$('conceptPaste').value}]);$('conceptPaste').value=''}
 catch(err){$('conceptImportStatus').textContent='貼り付け失敗（既存データは保持）：'+err.message;$('conceptImportStatus').className='error'}
});
const drop=$('conceptDrop');
for(const name of ['dragenter','dragover'])drop.addEventListener(name,e=>{e.preventDefault();drop.style.background='#304d77'});
for(const name of ['dragleave','drop'])drop.addEventListener(name,e=>{e.preventDefault();drop.style.background=''});
drop.addEventListener('drop',e=>importConceptFiles([...e.dataTransfer.files].filter(f=>/\.csv$/i.test(f.name))));
for(let r=1;r<=12;r++)for(const id of ['conceptFrom','conceptTo'])$(id).add(new Option(`${r}R`,r));
$('conceptFrom').value='1';$('conceptTo').value='12';
function downloadConceptCSV(csv,filename){
 const url=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8'}));
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('conceptTemplate').addEventListener('click',()=>{
 const first=Number($('conceptFrom').value),last=Number($('conceptTo').value);
 if(first>last){$('conceptImportStatus').textContent='開始Rは終了R以下にしてください。';$('conceptImportStatus').className='error';return}
 const date=$('date').value,venue=pad(Number($('venue').value)),rows=['date,venue,race,lane,win1,escape2,makuri,sashi'];
 for(let race=first;race<=last;race++)for(let lane=1;lane<=6;lane++)rows.push(`${date},${venue},${race},${lane},,,,`);
 downloadConceptCSV(rows.join('\r\n'),`concept-template-${date}-${venue}-${first}R-${last}R.csv`);
 $('conceptImportStatus').textContent=`入力用テンプレートを保存：${last-first+1}レース・${(last-first+1)*6}行。数値を入力してから読み込んでください。`;
 $('conceptImportStatus').className='muted';
});
function restoreConceptLocal(){
 try{
  const raw=localStorage.getItem(conceptStoreKey);if(!raw)return;
  const parsed=JSON.parse(raw);if(!Array.isArray(parsed))throw Error('保存形式が不正です');
  const rows=parsed.map((r,i)=>parseConcept37(r,'ブラウザ保存',i+1));
  const unique=new Map(rows.map(r=>[conceptKey37(r),r]));conceptRows=[...unique.values()];
  if(conceptRows.length){conceptEnabled=true;$('conceptToggle').checked=true;updateConceptInventory();applyConcept();$('conceptImportStatus').textContent=`ブラウザ保存から${conceptRows.length}行を復元しました。`;$('conceptImportStatus').className='success'}
 }catch(e){$('conceptStorageStatus').textContent='保存データを復元できません：'+e.message}
}
$('conceptClear').addEventListener('click',()=>{
 if(!confirm('登録した新概念データをすべてクリアしますか？'))return;
 conceptRows=[];conceptEnabled=false;$('conceptToggle').checked=false;
 updateConceptInventory();applyConcept();compute();saveConceptLocal();
 $('conceptImportStatus').textContent='登録データをクリアしました。';$('conceptImportStatus').className='muted';
});
$('conceptExport').addEventListener('click',()=>{
 const cols=['date','venue','race','lane','win1','escape2','makuri','sashi'];
 downloadConceptCSV([cols.join(','),...conceptRows.map(r=>cols.map(k=>r[k]??'').join(','))].join('\r\n'),'boat-ai-v3.8-concept-merged.csv');
});
updateConceptInventory();restoreConceptLocal();
$('conceptToggle').addEventListener('change',event=>{conceptEnabled=event.target.checked;compute()});


// v3.6: paired comparison uses identical races with complete user-supplied pre-race concept rows.
// Never backfill missing lanes or use concept rows dated after the race.
let pairedResults=[];
const conceptKey=(date,venue,race,lane)=>`${date}|${pad(Number(venue))}|${Number(race)}|${Number(lane)}`;
function conceptIndex(){const m=new Map();for(const row of conceptRows)m.set(conceptKey(row.date,row.venue,row.race,row.lane),row);return m}
function pairedSummary(items,model,n,stake){
 const races=items.length,wins=items.filter(d=>d[model].ranks[n]).length;
 const spent=races*n*stake,returned=items.reduce((sum,d)=>sum+(d[model].ranks[n]?d.payout*stake/100:0),0);
 return {races,wins,spent,returned,hit:races?wins/races*100:null,roi:spent?returned/spent*100:null,brier:races?items.reduce((sum,d)=>sum+d[model].brier,0)/races:null};
}
function renderPaired(){
 const n=Number($('pairTop').value),stake=Number($('pairStake').value);
 $('pairRows').innerHTML=['train','test','all'].flatMap(period=>['off','on'].map(model=>{
  const rows=pairedResults.filter(d=>period==='all'||d.period===period),s=pairedSummary(rows,model,n,stake);
  return `<tr><td>${periodLabel(period)}</td><td>${model==='on'?'ON':'OFF'}</td><td>${s.races}</td><td>${s.wins}</td><td>${pct(s.hit)}</td><td>${yen(s.spent)}</td><td>${yen(s.returned)}</td><td>${pct(s.roi)}</td><td>${s.brier==null?'—':s.brier.toFixed(4)}</td></tr>`;
 })).join('');
 $('pairDetailRows').innerHTML=pairedResults.slice(0,300).map(d=>`<tr><td>${safe(d.id)}</td><td>${safe(d.actual)}</td><td>${d.off.ranks[n]?'的中':'不的中'}</td><td>${d.on.ranks[n]?'的中':'不的中'}</td><td>${(d.off.correctP*100).toFixed(2)}%</td><td>${(d.on.correctP*100).toFixed(2)}%</td></tr>`).join('');
 $('pairCount').textContent=String(pairedResults.length);
}
$('pairTop').onchange=()=>{if(pairedResults.length)renderPaired()};
$('pairStake').onchange=()=>{if(pairedResults.length)renderPaired()};
$('pairExport').onclick=()=>{
 if(!pairedResults.length)return;
 const n=Number($('pairTop').value),stake=Number($('pairStake').value);
 const head=['race_id','period','actual','payout_per_100','off_correct_probability','on_correct_probability','off_brier','on_brier','off_hit','on_hit','off_returned_yen','on_returned_yen'];
 const rows=pairedResults.map(d=>[d.id,periodLabel(d.period),d.actual,d.payout,d.off.correctP,d.on.correctP,d.off.brier,d.on.brier,Number(d.off.ranks[n]),Number(d.on.ranks[n]),d.off.ranks[n]?d.payout*stake/100:0,d.on.ranks[n]?d.payout*stake/100:0]);
 const csv='\ufeff'+[head,...rows].map(row=>row.map(v=>'"'+String(v).replace(/"/g,'""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='boat-ai-v3.6-concept-paired.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
$('pairRun').onclick=async()=>{
 const button=$('pairRun'),msg=$('pairMsg');button.disabled=true;pairedResults=[];$('pairExport').disabled=true;
 $('pairRows').innerHTML='';$('pairDetailRows').innerHTML='';$('pairCount').textContent='—';
 try{
  if(!conceptRows.length)throw Error('先に新概念データCSVを読み込んでください。');
  const dates=datesBetween($('autoStart').value,$('autoEnd').value),venue=$('autoVenue').value;
  const n=Number($('pairTop').value),stake=Number($('pairStake').value);
  if(![1,3,5,10,20].includes(n)||!Number.isInteger(stake)||stake<100||stake%100!==0)throw Error('買い目数・購入額を確認してください。');
  const index=conceptIndex(),group=new Map();
  for(const row of conceptRows){const k=conceptKey(row.date,row.venue,row.race,0).split('|').slice(0,3).join('|');if(!group.has(k))group.set(k,new Set());group.get(k).add(row.lane)}
  const eligible=[];
  for(let i=0;i<dates.length;i++)for(let code=1;code<=24;code++){
   if(venue!=='all'&&pad(code)!==venue)continue;
   for(let r=1;r<=12;r++)if(group.get(`${dates[i]}|${pad(code)}|${r}`)?.size===6)eligible.push({date:dates[i],idx:i,code:pad(code),r});
  }
  if(!eligible.length)throw Error('指定期間・場に6艇分揃った新概念データがありません。過去日付のCSVを追加してください。');
  const grouped=new Map();for(const race of eligible){if(!grouped.has(race.date))grouped.set(race.date,[]);grouped.get(race.date).push(race)}
  let missing=0,excluded=0,done=0;
  for(const [date,races] of grouped){
   msg.textContent=`比較検証中：${done}/${grouped.size}日、${pairedResults.length}レース照合済み`;
   let cards,payouts,results=null;
   try{[cards,payouts]=await Promise.all([getCSV('programs/race_cards',date),getCSV('results/payouts',date)]);try{results=(await getCSV('results/realtime',date)).rows}catch(e){}}
   catch(e){missing++;done++;continue}
   const payMap=new Map();for(const row of payouts.rows){const id=raceId(row);if(uniqueRaceId(id))payMap.set(id,row)}
   const resultMap=new Map();if(results)for(const row of results){const id=raceId(row);if(uniqueRaceId(id))resultMap.set(id,row)}
   for(const race of races){
    const id=date.replaceAll('-','')+race.code+pad(race.r),row=payMap.get(id);
    if(!row){excluded++;continue}
    const actual=String(val(row,['3連単_組番','３連単_組番','三連単_組番'])).trim();
    const payoutRaw=String(val(row,['3連単_払戻金','３連単_払戻金','三連単_払戻金'])).replace(/[,，円\s]/g,'');const payout=Number(payoutRaw);
    if(!validBet(actual)||!payoutRaw||!Number.isFinite(payout)||payout<=0){excluded++;continue}
    if(results){const rr=resultMap.get(id);if(!rr||[1,2,3].map(i=>String(val(rr,[`${i}着_艇番`])).trim()).join('-')!==actual){excluded++;continue}}
    const racers=normalize(cards.rows,race.code,race.r,date);
    if(racers.length!==6||racers.some(e=>!e.name||e.name==='未取得')){excluded++;continue}
    for(const e of racers)e.concept=index.get(conceptKey(date,race.code,race.r,e.lane))||null;
    if(racers.some(e=>!e.concept)){excluded++;continue}
    const models={};
    for(const [key,useConcept] of [['off',false],['on',true]]){
     const probs=probabilitiesFor(racers,useConcept),correct=probs.find(p=>p.bet===actual);
     if(probs.length!==120||!correct)break;
     const ranks={};for(const count of [1,3,5,10,20])ranks[count]=probs.slice(0,count).some(p=>p.bet===actual);
     models[key]={correctP:correct.p,brier:probs.reduce((sum,p)=>sum+(p.p-(p.bet===actual?1:0))**2,0),ranks};
    }
    if(!models.off||!models.on){excluded++;continue}
    pairedResults.push({id,date,code:race.code,period:race.idx<60?'train':'test',actual,payout,...models});
   }
   done++;await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!pairedResults.length)throw Error(`照合できた確定レースは0件です。未取得日${missing}、除外${excluded}。`);
  pairedResults.sort((a,b)=>a.id.localeCompare(b.id));renderPaired();$('pairExport').disabled=false;
  msg.textContent=`比較完了：${pairedResults.length}レース（6艇の新概念データが揃い、結果・払戻を照合できたレースのみ）。未取得日${missing}、除外${excluded}。同一レースをON/OFF両方で評価しました。`;
  msg.className='success';
 }catch(e){msg.textContent='比較検証：'+e.message;msg.className='error'}finally{button.disabled=false}
};
