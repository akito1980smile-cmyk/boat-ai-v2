'use strict';
const venues=['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'];
const $=id=>document.getElementById(id), pad=n=>String(n).padStart(2,'0');
const jst=new Date(Date.now()+9*3600000).toISOString().slice(0,10);$('date').value=jst;
venues.forEach((v,i)=>$('venue').add(new Option(`${pad(i+1)} ${v}`,pad(i+1))));$('venue').value='12';for(let r=1;r<=12;r++)$('race').add(new Option(`${r}R`,r));$('race').value='12';
let entries=[],pred=[],isDemo=false,oddsMap={};
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
function render(){let venue=venues[Number($('venue').value)-1];$('raceTitle').textContent=`${$('date').value} ${venue} ${$('race').value}R 出走表${isDemo?'（サンプル）':''}`;$('entries').innerHTML=entries.map(e=>`<tr><td><span class="lane ${e.lane>1?'lane'+e.lane:''}">${e.lane}</span></td><td>${safe(e.name)}</td><td>${safe(e.class)}</td><td>${fmt(e.national)}</td><td>${fmt(e.local)}</td><td>${fmt(e.motor)}%</td><td>${fmt(e.exhibition)}</td></tr>`).join('');$('dataNote').textContent=isDemo?'2026/11/7 住之江12Rの提供画像から作成した固定サンプル。現在の実データではありません。':'公開CSVから取得。欠損項目は—表示。';compute()}
function fmt(x){return x==null?'—':Number(x).toFixed(2)}
function compute(){
 pred=[];
 if(entries.length!==6){$('predictions').innerHTML='';$('best').textContent='—';$('bestP').textContent='—';$('betSummary').textContent='';return}
 // Plackett-Luce style sequential ordering: P(a,b,c)=P(a)*P(b|a)*P(c|a,b).
 // Hand-tuned strengths, not fitted to historical outcomes; NOT calibrated probabilities.
 const strengths=entries.map(e=>{
  let score=1+(e.national??6.5)*.16+(e.local??6.5)*.08+(e.motor??35)*.008+(e.exhibition==null?0:(6.85-e.exhibition)*1.5);
  return Math.max(.2,score)*([1.65,1.10,1.03,.94,.77,.62][e.lane-1]);
 });
 const total=strengths.reduce((a,b)=>a+b,0);
 for(let a=0;a<6;a++)for(let b=0;b<6;b++)for(let c=0;c<6;c++){
  if(a===b||a===c||b===c)continue;
  const p=strengths[a]/total*strengths[b]/(total-strengths[a])*strengths[c]/(total-strengths[a]-strengths[b]);
  const bet=`${a+1}-${b+1}-${c+1}`;
  const odd=oddsMap[bet]||null;
  pred.push({bet,p,odds:odd,ev:odd?p*odd:null});
 }
 pred.sort((a,b)=>b.p-a.p);
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
