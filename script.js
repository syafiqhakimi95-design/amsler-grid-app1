// --- STATE ---
let patient = {};
let currentEye = "OD";

// Tech Config (SMARTPHONE FIXED)
const CARD_LONG_CM = 8.56;  // Laptop
const CARD_SHORT_CM = 5.40; // Smartphone
let targetCalibCm = CARD_LONG_CM; 

let pxPerCm = 0;
let gridSizePx = 0;
const GRID_DIM = 20; 
let gridData = [];   

let results = { OD: null, OS: null };
let fixCheck = 0; let fixLoss = 0; let fixTimer = null;
let isDrawing = false; let activePen = 'distort'; 
let currentPath = [];

const canvas = document.getElementById('amslerCanvas');
const ctx = canvas.getContext('2d');

// --- NAVIGATION ---
function goBackReg() { document.getElementById('screen-calib').classList.remove('active'); document.getElementById('screen-reg').classList.add('active'); }
function selectSingle(gid, el) { document.querySelectorAll(`#${gid} .chip`).forEach(c => c.classList.remove('selected')); el.classList.add('selected'); }

function toggleMulti(el) {
    if(el.innerText==="None"){ el.parentElement.querySelectorAll('.chip').forEach(c => c.classList.remove('selected')); el.classList.add('selected'); }
    else { 
        const none = Array.from(el.parentElement.children).find(c=>c.innerText==="None");
        if(none) none.classList.remove('selected');
        el.classList.toggle('selected');
    }
}

function setPen(type, el) {
    activePen = type;
    document.querySelectorAll('.pen-tool').forEach(t=>t.classList.remove('active'));
    el.classList.add('active');
}

// --- SETUP & CALIBRATION ---
function gotoCalibration() {
    const name = document.getElementById('pName').value;
    const age = document.getElementById('pAge').value;
    const genEl = document.querySelector('#grpGender .selected');
    const devEl = document.querySelector('#grpDevice .selected');
    
    if(!name || !age || !genEl || !devEl) return alert("Please complete details");
    
    let meds = [];
    document.querySelectorAll('#grpMeds .selected').forEach(c=>meds.push(c.innerText));

    patient = { name, age, gender: genEl.innerText, history: meds.join(", "), device: devEl.getAttribute('data-type') };
    setupCalibrationUI();
    document.getElementById('screen-reg').classList.remove('active');
    document.getElementById('screen-calib').classList.add('active');
}

function setupCalibrationUI() {
    const box = document.getElementById('calibBox');
    const instruct = document.getElementById('calib-instruct');
    const slider = document.getElementById('calibSlider');
    
    box.style.width = ""; box.style.height = ""; // Reset

    if (patient.device === 'smartphone') {
        // SMARTPHONE: USE SHORT SIDE (5.4cm)
        targetCalibCm = CARD_SHORT_CM;
        instruct.innerHTML = `<div style="text-align:left; font-size:0.9rem">1. Hold card against screen.<br>2. Use <strong>SHORT SIDE</strong> (5.4 cm).<br>3. Adjust slider to match box <strong>HEIGHT</strong>.</div>`;
        box.style.width = "100px"; 
        updateCalibBox(250); slider.value = 250; slider.min = 100; slider.max = 600;
    } else {
        // LAPTOP: USE LONG SIDE (8.56cm)
        targetCalibCm = CARD_LONG_CM;
        instruct.innerHTML = "Place card on screen. Match box <strong>WIDTH</strong> to <strong>LONG EDGE</strong> (8.56 cm).";
        box.style.height = "120px";
        updateCalibBox(350); slider.value = 350; slider.min = 200; slider.max = 800;
    }
}

function updateCalibBox(val) { 
    const box = document.getElementById('calibBox');
    if(patient.device === 'smartphone') {
        box.style.height = val + "px"; 
        box.innerHTML = `HEIGHT<br>${(val/100).toFixed(0)} unit`;
    } else {
        box.style.width = val + "px";
        box.innerHTML = `WIDTH<br>8.56 cm`;
    }
}

function finishCalibration() {
    const val = document.getElementById('calibSlider').value;
    pxPerCm = val / targetCalibCm;
    const dist = patient.device === 'smartphone' ? 30 : 50;
    gridSizePx = (2 * dist * Math.tan(10 * Math.PI/180)) * pxPerCm;
    
    canvas.width = gridSizePx; canvas.height = gridSizePx;
    resetGrid();

    document.getElementById('screen-calib').classList.remove('active');
    document.getElementById('screen-grid').classList.add('active');
    startFixation();
}

// --- GRID ENGINE ---
function resetGrid() {
    gridData = Array(GRID_DIM).fill().map(() => Array(GRID_DIM).fill(null));
    drawBaseGrid();
}
function drawBaseGrid() {
    ctx.fillStyle="white"; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.strokeStyle="black"; ctx.lineWidth=1;
    ctx.beginPath();
    const step = gridSizePx / GRID_DIM;
    for(let i=0; i<=gridSizePx; i+=step){ ctx.moveTo(i,0); ctx.lineTo(i,gridSizePx); ctx.moveTo(0,i); ctx.lineTo(gridSizePx,i); }
    ctx.stroke();
    ctx.fillStyle="black"; ctx.beginPath(); ctx.arc(gridSizePx/2, gridSizePx/2, gridSizePx*0.015, 0, Math.PI*2); ctx.fill();
}

// --- DRAWING ---
function getPos(e) {
    const r = canvas.getBoundingClientRect();
    const cx = e.touches?e.touches[0].clientX:e.clientX;
    const cy = e.touches?e.touches[0].clientY:e.clientY;
    return { x: cx - r.left, y: cy - r.top };
}
function startDraw(e) {
    if(e.cancelable) e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
    if (activePen === 'distort') {
        ctx.fillStyle = "rgba(231, 76, 60, 0.5)"; ctx.fillRect(pos.x, pos.y, 2, 2);
        captureData(pos.x, pos.y);
    } else { currentPath = [{x:pos.x, y:pos.y}]; }
}
function draw(e) {
    if(!isDrawing) return;
    if(e.cancelable) e.preventDefault();
    const pos = getPos(e);
    ctx.lineWidth = activePen==='scotoma' ? 3 : 4; ctx.lineCap = "round"; ctx.lineJoin = "round";
    
    if (activePen === 'distort') {
        ctx.strokeStyle = "rgba(231, 76, 60, 0.5)";
        ctx.lineTo(pos.x, pos.y); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(pos.x, pos.y);
        captureData(pos.x, pos.y);
    } else {
        ctx.strokeStyle = "rgba(44, 62, 80, 1)";
        ctx.lineTo(pos.x, pos.y); ctx.stroke();
        currentPath.push({x:pos.x, y:pos.y});
    }
}
function stopDraw() {
    if(isDrawing && activePen === 'scotoma' && currentPath.length > 2) {
        ctx.beginPath(); ctx.moveTo(currentPath[0].x, currentPath[0].y);
        for(let p of currentPath) ctx.lineTo(p.x, p.y);
        ctx.closePath(); ctx.fillStyle = "black"; ctx.fill();
        updateGridDataForPoly();
    }
    isDrawing=false; ctx.beginPath(); 
}
canvas.addEventListener('mousedown', startDraw); canvas.addEventListener('mousemove', draw); canvas.addEventListener('mouseup', stopDraw);
canvas.addEventListener('touchstart', startDraw, {passive:false}); canvas.addEventListener('touchmove', draw, {passive:false}); canvas.addEventListener('touchend', stopDraw);

function captureData(x, y) {
    const step = gridSizePx / GRID_DIM;
    const c = Math.floor(x/step); const r = Math.floor(y/step);
    if(c>=0 && c<GRID_DIM && r>=0 && r<GRID_DIM) gridData[r][c] = 'distort';
}
function updateGridDataForPoly() {
    const step = gridSizePx / GRID_DIM;
    for(let r=0; r<GRID_DIM; r++){
        for(let c=0; c<GRID_DIM; c++){
            let cx = (c*step) + (step/2); let cy = (r*step) + (step/2);
            if(ctx.isPointInPath(cx, cy)) gridData[r][c] = 'scotoma';
        }
    }
}

// --- ACTIONS ---
function handleMainAction() {
    const btn = document.getElementById('btn-main-action');
    if (currentEye === 'OD') {
        saveEye('OD');
        currentEye = 'OS';
        document.getElementById('dispEye').innerText = "LEFT EYE (OS)";
        btn.innerHTML = 'SAVE OS & FINISH <span class="material-icons">check</span>';
        resetGrid();
        alert("Right Eye Saved. Switch to LEFT EYE.");
    } else if (currentEye === 'OS') {
        saveEye('OS');
        clearTimeout(fixTimer);
        generateReportData();
        document.getElementById('screen-grid').classList.remove('active');
        document.getElementById('screen-preview').classList.add('active');
    }
}
function saveEye(eye) {
    results[eye] = {
        img: canvas.toDataURL("image/png"),
        stats: calculateStats(gridData),
        reliability: fixCheck>0 ? Math.round(((fixCheck-fixLoss)/fixCheck)*100)+"%" : "N/A"
    };
    fixCheck=0; fixLoss=0;
}
function calculateStats(data) {
    let s = { dist:0, scot:0, total:0, scores:{TL:0, TR:0, BL:0, BR:0}, qCount:{TL:0, TR:0, BL:0, BR:0} };
    const centerIdx = [9, 10]; 
    for(let r=0; r<GRID_DIM; r++){
        for(let c=0; c<GRID_DIM; c++){
            if(data[r][c] !== null){
                s.total++;
                if(data[r][c]==='distort') s.dist++; else s.scot++;
                let quad = '';
                if(r<10 && c<10) quad='TL'; else if(r<10 && c>=10) quad='TR'; else if(r>=10 && c<10) quad='BL'; else quad='BR';
                s.qCount[quad]++;
                if(centerIdx.includes(r) && centerIdx.includes(c)) s.scores[quad] = 4;
            }
        }
    }
    ['TL','TR','BL','BR'].forEach(q => {
        if(s.scores[q] !== 4) {
            const count = s.qCount[q];
            if(count === 0) s.scores[q]=0; else if(count <= 10) s.scores[q]=1; else if(count <= 25) s.scores[q]=2; else s.scores[q]=3; 
        }
    });
    return s;
}

// --- EXTRAS ---
function startFixation() {
    clearTimeout(fixTimer);
    const t = Math.random()*(25000-15000)+15000;
    fixTimer = setTimeout(()=>{ document.getElementById('modal-fixation').style.display='flex'; }, t);
}
function confirmFixation(ok) {
    fixCheck++; if(!ok) fixLoss++;
    document.getElementById('modal-fixation').style.display='none';
    startFixation();
}

function generateReportData() {
    const d = new Date();
    document.getElementById('repDate').innerText = d.toLocaleDateString();
    document.getElementById('repName').innerText = patient.name;
    document.getElementById('repID').innerText = "MRN-"+Math.floor(Math.random()*10000);
    document.getElementById('repDemo').innerText = `${patient.age} / ${patient.gender}`;
    document.getElementById('repHistory').innerText = patient.history;
    document.getElementById('repDevice').innerText = patient.device.toUpperCase();
    
    ['OD','OS'].forEach(eye => {
        const r = results[eye];
        if(r) {
            document.getElementById('img'+eye).src = r.img;
            const isAbnormal = r.stats.total > 0;
            document.getElementById(eye.toLowerCase()+'_norm').innerHTML = isAbnormal ? '<span class="cb"></span>' : '<span class="cb checked"></span>';
            document.getElementById(eye.toLowerCase()+'_abn').innerHTML = isAbnormal ? '<span class="cb checked"></span>' : '<span class="cb"></span>';
            
            const totalScore = r.stats.scores.TL + r.stats.scores.TR + r.stats.scores.BL + r.stats.scores.BR;
            let sev = "Normal";
            if(totalScore > 0) sev = "Mild"; if(totalScore > 4) sev = "Moderate"; if(totalScore > 8) sev = "Severe";
            if(r.stats.scores.TL===4 || r.stats.scores.TR===4 || r.stats.scores.BL===4 || r.stats.scores.BR===4) sev = "Severe (Central)";
            
            document.getElementById(eye.toLowerCase()+'_severity').innerText = sev;
            document.getElementById(eye.toLowerCase()+'_sq').innerText = r.stats.total;
            document.getElementById(eye.toLowerCase()+'_pct').innerText = ((r.stats.total/400)*100).toFixed(1);
            document.getElementById(eye.toLowerCase()+'_rel').innerText = r.reliability;

            document.getElementById(eye.toLowerCase()+'_qs_st').innerText = r.stats.scores.TL;
            document.getElementById(eye.toLowerCase()+'_qs_sn').innerText = r.stats.scores.TR;
            document.getElementById(eye.toLowerCase()+'_qs_it').innerText = r.stats.scores.BL;
            document.getElementById(eye.toLowerCase()+'_qs_in').innerText = r.stats.scores.BR;
            document.getElementById(eye.toLowerCase()+'_qs_tot').innerText = totalScore;
        }
    });
}

function downloadPDF() {
    const element = document.getElementById('report-container');
    element.style.display = 'block'; 
    const opt = { margin:[0.3, 0.3, 0.3, 0.3], filename:`Amsler_${patient.name}.pdf`, image:{ type: 'jpeg', quality: 0.98 }, html2canvas:{ scale: 2, useCORS: true }, jsPDF:{ unit: 'in', format: 'a4', orientation: 'portrait' } };
    html2pdf().set(opt).from(element).save().then(() => { element.style.display = 'none'; });
}