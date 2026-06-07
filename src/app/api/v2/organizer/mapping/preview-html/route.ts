import { getAllClusters } from "@/lib/mapping-db";

export async function GET() {
  const clusters = getAllClusters();

  const clusterMeta = clusters.map((cl) => ({
    id: cl.id,
    name_bm: cl.name_bm,
    name_en: cl.name_en || cl.name_bm,
  }));

  const comps = clusters.flatMap((cl) =>
    cl.competitions.map((c) => {
      let pdfs: { name: string; url: string }[] = [];
      if (c.pdf_url) {
        try { pdfs = JSON.parse(c.pdf_url); } catch { pdfs = []; }
      }
      return {
        id: c.slug || c.id,
        name: c.name,
        cl: cl.id,
        int: c.is_international === 1,
        method: c.method ?? undefined,
        d: { bm: c.desc_bm ?? "", en: c.desc_en ?? "" },
        entries: c.entries.map((e) => [e.code, e.level]),
        pdfs,
      };
    })
  );

  const dataJson = JSON.stringify({ clusters: clusterMeta, comps });

  const html = `<!DOCTYPE html>
<html lang="ms">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Malaysia Techlympics 2026 — Peta Pertandingan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@500;700;800&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<style>
  :root{--navy:#0a1c3f;--navy-2:#0e2550;--box:#143764;--ink:#eaf0ff;--muted:#9fb0d8;--yellow:#ffc53d;--pink:#f4679d;--peri:#97a5f0;--green:#a8c653;--orange:#f89b53;}
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:var(--navy);color:var(--ink);font-family:'Outfit',sans-serif;min-height:100vh;overflow-x:auto;background-image:radial-gradient(rgba(151,165,240,.10) 1px,transparent 1px);background-size:26px 26px;}
  .wave{position:fixed;inset:0;pointer-events:none;z-index:0;opacity:.5;}
  .shell{position:relative;z-index:1;max-width:1160px;margin:0 auto;padding:32px 28px 80px;}
  .eyebrow{display:flex;align-items:center;gap:10px;letter-spacing:.22em;font-size:12px;font-weight:600;color:var(--yellow);text-transform:uppercase;}
  .eyebrow .dot{width:9px;height:9px;border-radius:50%;background:var(--yellow);display:inline-block;}
  .eyebrow .dot:nth-child(2){opacity:.7}.eyebrow .dot:nth-child(3){opacity:.4}
  h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:clamp(24px,4vw,42px);line-height:1.04;color:var(--yellow);margin:12px 0 6px;text-transform:uppercase;}
  .sub{color:var(--muted);font-size:14px;max-width:700px;font-weight:300;}
  .bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:24px 0 6px;}
  .btn{font-family:'Outfit',sans-serif;font-size:13px;font-weight:600;letter-spacing:.04em;color:var(--yellow);background:transparent;border:1.5px solid rgba(255,197,61,.55);border-radius:999px;padding:8px 18px;cursor:pointer;transition:.18s;}
  .btn:hover,.btn.on{background:var(--yellow);color:var(--navy);}
  .lang{margin-left:auto;display:flex;gap:0;border:1.5px solid rgba(151,165,240,.4);border-radius:999px;overflow:hidden;}
  .lang button{font-family:'Outfit',sans-serif;font-size:12px;font-weight:700;letter-spacing:.08em;padding:7px 14px;border:none;background:transparent;color:var(--muted);cursor:pointer;}
  .lang button.on{background:var(--yellow);color:var(--navy);}
  .search{flex:1;min-width:160px;max-width:280px;background:var(--navy-2);border:1.5px solid rgba(151,165,240,.3);border-radius:999px;color:var(--ink);font-family:'Outfit',sans-serif;font-size:13px;padding:9px 18px;outline:none;transition:.18s;}
  .search::placeholder{color:#6c7ca6;}.search:focus{border-color:var(--yellow);}
  .legend{display:flex;flex-wrap:wrap;gap:14px;font-size:12px;color:var(--muted);margin:8px 0 4px;}
  .legend span{display:inline-flex;align-items:center;gap:6px;}
  .legend i{width:10px;height:10px;border-radius:50%;display:inline-block;}
  .legend .inttag{border:1px solid var(--peri);color:var(--peri);border-radius:4px;font-size:9px;font-weight:700;padding:1px 5px;letter-spacing:.06em;}
  #tree{width:100%;}#tree svg{width:100%;display:block;}
  .lk{fill:none;stroke:rgba(151,165,240,.4);stroke-width:1.4;}
  .nd{cursor:pointer;}.nd text{font-family:'Outfit',sans-serif;pointer-events:none;}
  .nd:hover rect.bx{filter:brightness(1.25);}
  .hint{color:#6c7ca6;font-size:12px;margin-top:4px;}
  .panel{position:fixed;right:20px;bottom:20px;width:min(340px,calc(100vw - 40px));background:var(--navy-2);border:1.5px solid rgba(151,165,240,.35);border-radius:16px;padding:18px 20px;z-index:10;box-shadow:0 18px 50px rgba(0,0,0,.5);transform:translateY(20px);opacity:0;pointer-events:none;transition:.25s ease;max-height:65vh;overflow:auto;}
  .panel.on{transform:translateY(0);opacity:1;pointer-events:auto;}
  .panel h2{font-family:'Bricolage Grotesque',sans-serif;font-size:16px;font-weight:700;color:#fff;line-height:1.25;padding-right:24px;}
  .chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;border-radius:999px;padding:3px 10px;margin:8px 4px 4px 0;background:var(--box);color:var(--ink);border:1px solid rgba(151,165,240,.4);}
  .chip.int{border-color:var(--peri);color:var(--peri);}
  .where{font-size:12px;color:var(--muted);margin:6px 0 4px;line-height:1.8;}
  .meta{font-size:12px;color:var(--yellow);margin:2px 0 6px;}
  .desc{font-size:13px;color:var(--ink);font-weight:300;line-height:1.65;}
  .pa{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}
  .pa .btn{font-size:12px;padding:6px 12px;}
  .draft{font-size:11px;color:#6c7ca6;margin-top:10px;font-style:italic;}
  .x{position:absolute;top:12px;right:12px;background:none;border:none;color:var(--muted);font-size:18px;cursor:pointer;line-height:1;}
  .x:hover{color:#fff;}
  footer{margin-top:32px;color:#56668f;font-size:11px;letter-spacing:.04em;}
  .no-data{text-align:center;padding:60px 20px;color:var(--muted);}
  .no-data p{font-size:1.1rem;margin-bottom:10px;}
</style>
</head>
<body>
<svg class="wave" viewBox="0 0 1440 900" preserveAspectRatio="none">
  <path d="M-50,640 C300,520 520,780 900,660 C1180,570 1320,700 1500,610" fill="none" stroke="rgba(56,138,221,.28)" stroke-width="1.5"/>
  <path d="M-50,700 C320,580 560,830 940,700 C1210,610 1340,740 1500,660" fill="none" stroke="rgba(56,138,221,.18)" stroke-width="1.5"/>
</svg>
<div class="shell">
  <div class="eyebrow"><span class="dot"></span><span class="dot"></span><span class="dot"></span> <span id="t-eyebrow"></span></div>
  <h1>Malaysia Techlympics 2026<br><span id="t-title"></span></h1>
  <p class="sub" id="t-sub"></p>
  <div class="bar">
    <button class="btn" id="b-exp" onclick="expandAll()"></button>
    <button class="btn" id="b-col" onclick="collapseAll()"></button>
    <button class="btn" id="b-int" onclick="toggleInt()"></button>
    <input class="search" id="q" type="text">
    <div class="lang">
      <button id="l-bm" class="on" onclick="setLang('bm')">BM</button>
      <button id="l-en" onclick="setLang('en')">EN</button>
    </div>
  </div>
  <div class="legend" id="legend"></div>
  <p class="hint" id="t-hint"></p>
  <div id="tree"></div>
  <footer id="t-footer"></footer>
</div>

<div class="panel" id="panel">
  <button class="x" onclick="closePanel()" aria-label="Close">&#10005;</button>
  <h2 id="p-name"></h2>
  <div id="p-chips"></div>
  <p class="where" id="p-where"></p>
  <p class="meta" id="p-method"></p>
  <p class="desc" id="p-desc"></p>
  <div class="pa" id="p-pdf-area"></div>
  <p class="draft" id="p-draft"></p>
</div>

<script>
const __DATA__ = ${dataJson};
const CLUSTERS_META = __DATA__.clusters;
const COMPS = __DATA__.comps;
const STR={bm:{eyebrow:"Pemetaan pertandingan",title:"Peta Pertandingan",sub:"Terokai kluster program rasmi sehingga ke setiap pertandingan dan kategori. Ketik kotak untuk kembangkan, ketik pertandingan untuk lihat butiran.",expand:"Kembangkan semua",collapse:"Tutup semua",intf:"Antarabangsa",search:"Cari pertandingan…",hint:"Lencana kuning = bilangan penyertaan. Tanda INT = terbuka kepada penyertaan antarabangsa.",download:"⤓ Muat turun modul (PDF)",register:"Daftar",regmsg:"Aliran pendaftaran akan dipautkan ke platform Techlympics.",offered:"Ditawarkan pada",intl:"Terbuka kepada penyertaan antarabangsa",draft:"Deskripsi draf — modul PDF belum dimuat naik.",footer:"Pratonton · Malaysia Techlympics 2026",levels:{kids:"Sekolah Rendah",teens:"Sekolah Menengah",youth:"Belia",open:"Terbuka",kindergarten:"Tadika"},methods:{online:"Sepenuhnya dalam talian (zon & akhir)",walkin:"Walk-in (zon & akhir)",hybrid:"Zon dalam talian (3 hari) · akhir fizikal",finalonly:"Peringkat akhir sahaja — walk-in dalam talian"},clusters:Object.fromEntries(CLUSTERS_META.map(c=>[c.id,c.name_bm]))},en:{eyebrow:"Competition pathway",title:"Competition Map",sub:"Explore the programme clusters down to every competition and category. Tap a box to expand, tap a competition to see details.",expand:"Expand all",collapse:"Collapse all",intf:"International",search:"Search a competition…",hint:"Yellow badge = entries inside. INT = open to international participants.",download:"⤓ Download module (PDF)",register:"Register",regmsg:"Registration flow — to be linked to the Techlympics platform.",offered:"Offered at",intl:"Open to international participants",draft:"Draft descriptions — PDF modules not yet uploaded.",footer:"Preview · Malaysia Techlympics 2026",levels:{kids:"Primary School",teens:"Secondary School",youth:"Youth",open:"Open",kindergarten:"Kindergarten"},methods:{online:"Fully online (zone & final)",walkin:"Walk-in (zone & final)",hybrid:"Online zone (3 days) · physical final",finalonly:"Final stage only — online walk-in"},clusters:Object.fromEntries(CLUSTERS_META.map(c=>[c.id,c.name_en||c.name_bm]))}};
let lang="bm";
const S=()=>STR[lang];
const LVCOLOR={kids:"#f4679d",teens:"#97a5f0",youth:"#a8c653",open:"#f89b53",kindergarten:"#ffc53d"};
if(COMPS.length===0){
  document.getElementById("tree").innerHTML='<div class="no-data"><p>Tiada data pertandingan.</p><p style="font-size:.9rem;color:#6c7ca6;">Sila tambah pertandingan dalam editor terlebih dahulu.</p></div>';
} else {
  const data={t:"root",children:CLUSTERS_META.map(cl=>({t:"cl",cl:cl.id,children:COMPS.filter(c=>c.cl===cl.id).map(c=>({t:"comp",ref:c,children:c.entries.map(e=>({t:"lvl",comp:c,code:e[0],lvl:e[1]}))}))}))};
  function label(d){const dd=d.data;if(dd.t==="root")return"Malaysia Techlympics 2026";if(dd.t==="cl")return S().clusters[dd.cl]||"Kluster "+dd.cl;if(dd.t==="comp")return dd.ref.name;return S().levels[dd.lvl]||dd.lvl;}
  function wrap(txt,max){const words=txt.split(" ");const lines=[];let cur="";words.forEach(w=>{if((cur+" "+w).trim().length>max&&cur){lines.push(cur);cur=w;}else cur=(cur+" "+w).trim();});if(cur)lines.push(cur);return lines.slice(0,3);}
  const W={0:185,1:175,2:235,3:160},BH={0:46,1:52,2:36,3:28},COLX={0:0,1:235,2:460,3:745};
  const VW=935,M={left:12,right:12,top:34,bottom:24};
  const root=d3.hierarchy(data);
  root.descendants().forEach((d,i)=>{d.id=i;d._children=d.children;});
  root.descendants().filter(d=>d.depth===2).forEach(d=>{d.children=null;});
  const svg=d3.select("#tree").append("svg");
  const gLink=svg.append("g"),gNode=svg.append("g");
  const tree=d3.tree().nodeSize([62,1]);
  const diagonal=d3.linkHorizontal().x(d=>d.y).y(d=>d.x);
  let query="",intOnly=false;
  function leafCount(d){return(d._children||[]).reduce((s,c)=>s+(c._children?leafCount(c):1),0);}
  function isLeaf(d){return!d._children;}
  function compOf(d){return d.data.t==="comp"?d.data.ref:(d.data.t==="lvl"?d.data.comp:null);}
  function dimmed(d){const c=compOf(d);if(!c)return false;if(intOnly&&!c.int)return true;if(query&&!c.name.toLowerCase().includes(query))return true;return false;}
  function highlighted(d){const c=compOf(d);if(!c)return false;return(query&&c.name.toLowerCase().includes(query))||(intOnly&&c.int&&!query);}
  function update(source){
    tree(root);const nodes=root.descendants(),links=root.links();
    nodes.forEach(d=>{d.y=COLX[d.depth];});
    let x0=Infinity,x1=-Infinity;nodes.forEach(d=>{x0=Math.min(x0,d.x);x1=Math.max(x1,d.x);});
    const H=x1-x0+M.top+M.bottom+34;
    svg.transition().duration(320).attr("viewBox","0 0 "+VW+" "+H);
    const oy=M.top-x0,ox=M.left;
    const node=gNode.selectAll("g.nd").data(nodes,d=>d.id);
    const nE=node.enter().append("g").attr("class","nd").attr("transform",d=>"translate("+((source?source.y0??d.y:d.y)+ox)+","+((source?source.x0??d.x:d.x)+oy)+")").attr("opacity",0)
      .on("click",(e,d)=>{if(d.data.t==="comp"){d.children=d.children?null:d._children;openPanel(d.data.ref);update(d);}else if(d.data.t==="lvl"){openPanel(d.data.comp);}else if(d.depth>0){d.children=d.children?null:d._children;update(d);}});
    nE.append("rect").attr("class","bx");nE.append("text").attr("class","lbl");nE.append("circle").attr("class","badge");nE.append("text").attr("class","bnum");nE.append("rect").attr("class","itag");nE.append("text").attr("class","itxt");
    const nA=node.merge(nE);
    nA.transition().duration(320).attr("opacity",d=>dimmed(d)?.2:1).attr("transform",d=>"translate("+(d.y+ox)+","+(d.x+oy)+")");
    nA.select("rect.bx").attr("x",0).attr("y",d=>-BH[d.depth]/2).attr("width",d=>W[d.depth]).attr("height",d=>BH[d.depth]).attr("rx",d=>d.data.t==="lvl"?BH[d.depth]/2:10).attr("fill",d=>d.data.t==="lvl"?LVCOLOR[d.data.lvl]||LVCOLOR.open:(d.depth===0?"#0a1c3f":"#143764")).attr("stroke",d=>d.depth===0?"#ffc53d":(highlighted(d)?"#ffffff":(d.data.t==="lvl"?"none":"rgba(151,165,240,.45)"))).attr("stroke-width",d=>d.depth===0?2:1.5);
    nA.select("text.lbl").each(function(d){const el=d3.select(this);el.attr("text-anchor","middle").attr("x",W[d.depth]/2).attr("font-size",d.depth===0?13.5:d.depth===1?11:d.data.t==="lvl"?11.5:11).attr("font-weight",600).attr("fill",d.data.t==="lvl"?"#0a1c3f":(d.depth===0?"#ffc53d":"#eaf0ff"));const maxc=d.depth===0?16:d.depth===1?22:40;const lines=wrap(label(d),maxc);el.text(null);lines.forEach((ln,i)=>{el.append("tspan").attr("x",W[d.depth]/2).attr("y",(i-(lines.length-1)/2)*12+4).text(ln);});});
    nA.select("circle.badge").attr("cx",d=>W[d.depth]).attr("cy",d=>-BH[d.depth]/2).attr("r",11).attr("fill","#ffc53d").attr("opacity",d=>(!isLeaf(d)&&!d.children)?1:0);
    nA.select("text.bnum").attr("x",d=>W[d.depth]).attr("y",d=>-BH[d.depth]/2).attr("dy",3.5).attr("text-anchor","middle").attr("font-size",10.5).attr("font-weight",700).attr("fill","#0a1c3f").attr("opacity",d=>(!isLeaf(d)&&!d.children)?1:0).text(d=>isLeaf(d)?"":leafCount(d));
    nA.select("rect.itag").attr("x",d=>W[d.depth]-34).attr("y",d=>BH[d.depth]/2-7).attr("width",28).attr("height",14).attr("rx",4).attr("fill","#0a1c3f").attr("stroke","#97a5f0").attr("stroke-width",1).attr("opacity",d=>d.data.t==="comp"&&d.data.ref.int?1:0);
    nA.select("text.itxt").attr("x",d=>W[d.depth]-20).attr("y",d=>BH[d.depth]/2).attr("dy",3.5).attr("text-anchor","middle").attr("font-size",8.5).attr("font-weight",700).attr("letter-spacing",".06em").attr("fill","#97a5f0").attr("opacity",d=>d.data.t==="comp"&&d.data.ref.int?1:0).text("INT");
    node.exit().transition().duration(320).attr("opacity",0).attr("transform","translate("+((source?source.y:0)+ox)+","+((source?source.x:0)+oy)+")").remove();
    const link=gLink.selectAll("path").data(links,d=>d.target.id);
    link.enter().append("path").attr("class","lk").attr("opacity",0).merge(link).transition().duration(320).attr("opacity",d=>dimmed(d.target)?.15:1).attr("d",d=>diagonal({source:{x:d.source.x+oy,y:d.source.y+ox+W[d.source.depth]},target:{x:d.target.x+oy,y:d.target.y+ox}}));
    link.exit().transition().duration(320).attr("opacity",0).remove();
    nodes.forEach(d=>{d.x0=d.x;d.y0=d.y;});
  }
  function openPanel(c){
    document.getElementById("p-name").textContent=c.name;
    let chips='<span class="chip">'+(S().clusters[c.cl]||"Kluster "+c.cl)+'</span>';
    if(c.int)chips+='<span class="chip int">INT · '+S().intf+'</span>';
    document.getElementById("p-chips").innerHTML=chips;
    document.getElementById("p-where").textContent=S().offered+": "+c.entries.map(e=>e[0]+" · "+(S().levels[e[1]]||e[1])).join("   |   ");
    document.getElementById("p-method").textContent=c.method?S().methods[c.method]:"";
    document.getElementById("p-desc").textContent=c.d[lang]||"";
    const pdfArea=document.getElementById("p-pdf-area");
    pdfArea.innerHTML="";
    const hasPdfs=c.pdfs&&c.pdfs.length>0;
    if(hasPdfs){
      c.pdfs.forEach(doc=>{const btn=document.createElement("button");btn.className="btn";btn.textContent="📄 "+doc.name;btn.onclick=()=>window.open(doc.url,"_blank");pdfArea.appendChild(btn);});
    }
    document.getElementById("p-draft").style.display=hasPdfs?"none":"";
    document.getElementById("panel").classList.add("on");
  }
  function closePanel(){document.getElementById("panel").classList.remove("on");}
  window.closePanel=closePanel;
  function expandAll(){root.descendants().forEach(d=>{if(d._children)d.children=d._children;});update(root);}
  function collapseAll(){root.children=root._children;root.children.forEach(cl=>{cl.children=cl._children;cl.children.forEach(c=>c.children=null);});update(root);}
  function toggleInt(){intOnly=!intOnly;document.getElementById("b-int").classList.toggle("on",intOnly);if(intOnly)expandToComps();else update(root);}
  function expandToComps(){root.children=root._children;root.children.forEach(cl=>{cl.children=cl._children;});update(root);}
  window.expandAll=expandAll;window.collapseAll=collapseAll;window.toggleInt=toggleInt;
  function applyLang(){
    document.documentElement.lang=lang==="bm"?"ms":"en";
    document.getElementById("t-eyebrow").textContent=S().eyebrow;
    document.getElementById("t-title").textContent=S().title;
    document.getElementById("t-sub").textContent=S().sub;
    document.getElementById("b-exp").textContent=S().expand;
    document.getElementById("b-col").textContent=S().collapse;
    document.getElementById("b-int").textContent=S().intf;
    document.getElementById("q").placeholder=S().search;
    document.getElementById("t-hint").textContent=S().hint;
    document.getElementById("t-footer").textContent=S().footer;
    document.getElementById("p-draft").textContent=S().draft;
    document.getElementById("legend").innerHTML=Object.keys(LVCOLOR).map(k=>'<span><i style="background:'+LVCOLOR[k]+'"></i>'+(S().levels[k]||k)+'</span>').join("")+'<span><span class="inttag">INT</span>'+S().intf+'</span>';
  }
  function setLang(l){lang=l;document.getElementById("l-bm").classList.toggle("on",l==="bm");document.getElementById("l-en").classList.toggle("on",l==="en");applyLang();update(root);if(document.getElementById("panel").classList.contains("on"))closePanel();}
  window.setLang=setLang;
  document.getElementById("q").addEventListener("input",e=>{query=e.target.value.toLowerCase().trim();if(query)expandToComps();else update(root);});
  applyLang();update(root);
}
</script>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}
