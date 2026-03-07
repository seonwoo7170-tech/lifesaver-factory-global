
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const axios = require('axios');
const FormData = require('form-data');
const { createCanvas, loadImage, registerFont } = require('canvas');
const path = require('path');

// [FONT_FIX] 프리미엄 썸네일 폰트 (G마켓 산스 Bold) 및 백업 폰트 설정
const fontDir = path.join(__dirname, 'assets', 'fonts');
const localGmarket = path.join(fontDir, 'GmarketSansBold.ttf');
const localPretendard = path.join(fontDir, 'Pretendard-Black.ttf');

const fontPaths = [
    { path: localGmarket, family: 'GmarketSans' },
    { path: localPretendard, family: 'Pretendard' },
    { path: path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', 'malgunbd.ttf'), family: 'VUE_K_Font' },
    { path: '/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf', family: 'VUE_K_Font' }
];

let activeFont = 'sans-serif';
let fontFound = false;

for (const fontInfo of fontPaths) {
    if (fs.existsSync(fontInfo.path)) {
        try {
            registerFont(fontInfo.path, { family: fontInfo.family });
            activeFont = fontInfo.family;
            fontFound = true;
            console.log(`✅ 폰트 등록 완료: ${path.basename(fontInfo.path)} (Family: ${fontInfo.family})`);
            break;
        } catch (e) {
            console.log(`⚠️ 폰트 등록 실패 (${path.basename(fontInfo.path)}): ${e.message}`);
        }
    }
}


if (!fontFound) {
    console.log('🚨 사용 가능한 폰트를 찾지 못했습니다. 시스템 기본 폰트를 시도합니다.');
}




// --- [LOCAL_SETUP] Load secrets from secrets_config.json ---
if (fs.existsSync('secrets_config.json')) {
    try {
        const secrets = JSON.parse(fs.readFileSync('secrets_config.json', 'utf8'));
        for (const [k, v] of Object.entries(secrets)) {
            if (!process.env[k]) process.env[k] = v;
        }
        console.log('✅ Local secrets loaded from secrets_config.json');
    } catch (e) {
        console.log('⚠️ secrets_config.json load error: ' + e.message);
    }
}

const MASTER_GUIDELINE = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Vue blog — 통합 멀티플랫폼 블로그 에이전트
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

사용자가 키워드를 입력하면, 아래 지침을 준수하여
네이버 블로그 / 블로그스팟 / 워드프레스에 바로 발행 가능한
HTML 소스코드를 생성한다.


════════════════════════════════════════
   PART 0 — 번역 및 우선순위 (절대 규칙)
════════════════════════════════════════

[GLOBAL LANGUAGE ROUTING & TRANSLATION]
★ [언어 우선순위 축]: 프롬프트 맨 아래에 명시된 **[TARGET_LANGUAGE]** 가 최우선이자 절대적인 지침입니다.
  1. 만약 **[TARGET_LANGUAGE]: Korean** 이라면, 모든 내용을 한국어로 작성하세요.
  2. 만약 **[TARGET_LANGUAGE]: English** 라면, 입력 키워드와 상관없이 **100% 원어민 수준의 영어로만 작성**하세요.
  3. 지정된 언어 모드에 맞춰 모든 UI 컴포넌트 이름 및 이미지 메타데이터도 해당 언어로 자동 번역하여 출력하세요.

════════════════════════════════════════
  PART A — 핵심 철학 (4대 원칙)
════════════════════════════════════════

① 적게 (Less is More): 강조 박스 글 전체 3~4개. 연속 배치 금지.
② 정확하게 (Precision): 모든 수치는 검색 데이터 기반. 출처 명시.
④ 진짜처럼 (Authenticity): AI 패턴 회피. 실제 블로거의 불규칙한 서사. 구어체 줄임말(don't, it's 등)을 적극 사용하고 상투적인 AI 오프닝을 배제하라.
⑤ 돈 되게 (Revenue First): 체류시간 극대화. 애드센스 최적화 여백.

════════════════════════════════════════
  PART B — 입출력 & 분량
════════════════════════════════════════

■ 분량: 7,000자 ~ 최대 9,000자 (지정된 TARGET_LANGUAGE 텍스트 기준)
  ★ [초강력 경고]: 요약된 개조식 리스트만 남발하지 말고, 압도적인 서사(전문가의 썰, 구체적 예시, 풍부한 설명)를 텍스트 단락(<p>)으로 길게 풀어내어 분량을 강제로 늘리되, 가독성을 위해 문단을 잘게 쪼개세요.

■ 출력 규칙 및 치트키 (AI 흔적 완벽 제거):
  [1] 상단 이미지 메타데이터: IMG_0~3 (JSON 형식)
  [2] 본문 HTML: <h1> 태그 금지. 첫 제목은 <h2>.
  [3] 이미지 치환자: [[IMG_0]], [[IMG_1]], [[IMG_2]], [[IMG_3]]
  [4] **제목 숫자 금지**: 모든 제목(H2, H3)에 '1.', '2.', 'Step 1.' 같은 숫자나 순번을 **절대로** 붙이지 마세요. 매끄러운 텍스트 제목만 허용합니다. (나열식 구조 탈피)
  [5] **AI 상투어 완전 박멸**: "10년 차 전문가로서...", "오늘의 주제는~", "결론적으로", "잊지 못할 특별한 경험", "댓글로 공유해주세요!" 등 AI 특유의 정형화된 서론/결론과 뻔한 형용사를 모조리 지우세요.
  [6] **구체적 에피소드(핵심 치트키)**: 두루뭉술한 썰이 아니라 "2024년 여름, 몰디브 OO 리조트 투숙 중 에어컨 고장으로 겪은 최악의 서비스"와 같이 아주 구체적인 시점, 장소, 상황을 본문에 노출하여 생생한 인간의 경험을 증명하세요.
  [7] **문장 길이의 극단적 변주**: AI의 정형화된 문장 길이를 깨부수세요! 호흡이 긴 문장 뒤에는 "진짜 럭셔리는 따로 있습니다.", "최악이었죠.", "명심하세요." 같은 아주 짧은 단답형 문장을 무작위로 섞으세요.
  [8] **냉소적/위트있는 솔직함**: 지나친 친절함과 긍정을 버리세요. "비싼 돈 주고 갔는데 이건 정말 돈 낭비였습니다", "이런 서비스는 돈 낭비입니다" 등 약간 까칠하고 냉소적인 비판을 반드시 1~2개 포함하세요. 이것이 독자가 이 글을 '진짜 사람이 쓴 글'이라 확신하게 만드는 핵심입니다.
  [9] **나열식 구조 최소화**: '3가지 장점', '4가지 특징' 형태로 무조건 번호 매겨 나열하는 기계계적인 템플릿 구조를 피하고, 썰을 풀듯 자연스러운 문단 전개(의식의 흐름)를 우선하세요.
  [10] **결론 유니크화**: 'Conclusion' 대신 상황에 맞는 독특한 H2 제목을 사용하고, \`closing-box\`에서 상투적인 질문 대신 뼈 때리는 조언으로 쿨하게 마무리하세요.

════════════════════════════════════════
  PART D — Zero-AI Signature (금지 및 필수 지침)
════════════════════════════════════════
  [1] **금지 접속사**: \`In addition\`, \`Furthermore\`, \`Moreover\`, \`Additionally\`, \`Consequently\` 등 기계적인 연결어를 절대 쓰지 마세요. 대신 문맥적으로 자연스럽게 넘어가거나 앞 문장의 단어를 받아 설명하세요.
  [2] **디테일의 끝**: "기기를 정기적으로 점검하세요"라고 하지 말고, "작업실 구석에 쌓인 고양이 털이 쿨러 속도를 15% 늦추고 있습니다"라고 구체적이고 감각적으로 묘사하세요.

════════════════════════════════════════
  PART F — 글 구조 (프레임워크)
════════════════════════════════════════

① <h1> 제목: 경험신호 + 궁금증 유발.
② 목차 (TOC): 앵커 링크 포함. 인라인 스타일 절대 금지.
③ 썸네일 카피 (IMG_0): 유튜브 어그로 수준의 파격적 카피.
④ 스니펫 도입부: 150자 이내 요약.
⑤ 본문 섹션: 6~8개 심층 섹션.
⑥ FAQ: 8~12개 압도적 정보량.

[디자인 컴포넌트 클래스]
- TOC: <div class='toc-box'>
- 강조상자: <div class='tip-box'>, <div class='warn-box'>
- 전문가 팁: <div class='tip-box'><h3>Smileseon's Pro Tip</h3>...</div>
- 버튼: <a href='URL' class='cluster-btn'>...</a>
- 섹션: <h2 id='slug'>, <h3>

════════════════════════════════════════
  PART J — E-E-A-T 품질 엔진
════════════════════════════════════════

[Experience]: 글 전체가 하나의 경험 서사(실패/후회담 1건 필수).
[Expertise]: 비교 테이블 1개 필수, 업계 용어 풀이.
[Authoritativeness]: 공식 데이터 인용, 공식 버튼 배치.
[Trustworthiness]: 면책조항 필수, 단점/한계 노출.

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
# [VUE STUDIO ULTIMATE ADD-ON: ADDITIONAL RULES]
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. **목차(TOC) 배치 및 기능**: 
    - 반드시 본문 도입부 직후에 \`<div class='toc-box'>\`를 배치하세요.
    - 모든 \`<h2>\` 태그에는 반드시 내용과 관련된 영문 ID를 부여하세요. (예: \`<h2 id='maintenance-tips'>\`)
    - 목차 내의 링크(\`href='#id'\`)와 섹션의 ID를 100% 일치시켜 클릭 시 해당 섹션으로 이동하게 만드세요.
5. **글박스 배치 규칙**: 글박스는 반드시 해당 섹션의 설명이 끝난 후(다음 H2 직전)에 배치하세요.
6. **면책 조항 강조**: 최하단 배치 및 \`<strong>⚠️ 면책 조항</strong>\` 레이블 포함 필수.
`;

const STYLE = `
<style>
  @import url('https://fonts.googleapis.com/css2?family=Pretendard:wght@400;500;600;700&display=swap');
  
  /* 전역 컨테이너 */
  .vue-premium { 
    font-family: 'Pretendard', sans-serif; 
    color: #334155; 
    line-height: 1.85; 
    font-size: 17px; 
    max-width: 840px; 
    margin: 0 auto; 
    padding: 40px 24px; 
    word-break: keep-all; 
    background-color: #ffffff;
  }
  
  /* 본문 텍스트 */
  .vue-premium p { 
    margin: 30px 0; 
    letter-spacing: -0.015em; 
  }
  
  /* H2 (섹션 제목) - 그라데이션 및 세련된 디자인 */
  .vue-premium h2 { 
    font-size: 28px; 
    font-weight: 800; 
    color: #0f172a; 
    margin: 80px 0 35px; 
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .vue-premium h2::before {
    content: '';
    display: block;
    width: 6px;
    height: 32px;
    background: linear-gradient(to bottom, #3b82f6, #6366f1);
    border-radius: 4px;
  }
  
  /* H3 (소제목) */
  .vue-premium h3 {
    font-size: 22px;
    font-weight: 700;
    color: #1e293b;
    margin: 45px 0 20px;
  }

  /* 목차 상자 */
  .toc-box { 
    background: #f1f5f9; 
    border: 1px solid #e2e8f0; 
    border-radius: 16px; 
    padding: 30px 35px; 
    margin: 45px 0; 
  }
  .toc-box h3 { margin-top: 0; font-size: 19px; margin-bottom: 20px; }
  .toc-box ul { list-style: none; padding: 0; margin: 0; }
  .toc-box li { margin-bottom: 15px; position: relative; padding-left: 25px; }
  .toc-box li::before { content: '▶'; position: absolute; left: 0; color: #3b82f6; font-size: 10px; top: 4px; }
  .toc-box a { color: #475569; text-decoration: none; font-weight: 500; }

  /* 팁, 경고, 인사이트, 데이터 상자 통합 디자인 */
  .tip-box, .warn-box, .insight-box, .data-box { border-radius: 16px; padding: 26px 30px; margin: 40px 0; position: relative; border: 1px solid transparent; }
  
  .tip-box { background: #f0fdf4; border-color: #dcfce7; color: #166534; }
  .warn-box { background: #fff1f2; border-color: #ffe4e6; color: #991b1b; }
  .insight-box { background: #fdf2f8; border-color: #fce7f3; color: #9d174d; }
  .data-box { background: #eff6ff; border-color: #dbeafe; color: #1e40af; }

  /* 테이블 */
  .vue-premium table { width: 100%; border-collapse: separate; border-spacing: 0; margin: 45px 0; border-radius: 16px; overflow: hidden; border: 1px solid #f1f5f9; }
  .vue-premium th { background: #f8fafc; padding: 20px; font-weight: 700; }
  .vue-premium td { padding: 18px 20px; border-top: 1px solid #f1f5f9; }

  /* 버튼 */
  .cluster-btn {
    display: block;
    background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%);
    color: white !important;
    padding: 16px 30px;
    border-radius: 12px;
    text-decoration: none !important;
    font-weight: 700;
    text-align: center;
    margin: 30px 0;
    box-shadow: 0 10px 15px -3px rgba(59, 130, 246, 0.3);
  }

  /* 마무리 상자 (라이트 파스텔 오렌지 테마) */
  .closing-box { background: #fff7ed; border: 2px dashed #fed7aa; color: #9a3412; padding: 45px; border-radius: 24px; margin: 80px 0; text-align: center; }
  .closing-box h2 { justify-content: center; margin-top: 0; color: #ea580c; border: none; }
  .closing-box h2::before { display: none; }
  .closing-box p { font-style: italic; font-size: 19px; color: #c2410c; }
  .disclaimer-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; margin: 100px 0 40px; color: #64748b; font-size: 13.5px; line-height: 1.6; text-align: justify; word-break: keep-all; }
  .disclaimer-box strong { color: #475569; display: block; margin-bottom: 8px; }
</style>
<div class='vue-premium'>
`;

function getKSTDateString() {
    return new Date(Date.now() + 9 * 3600000).toISOString().split('T')[0];
}

function getLogTime() {
    return new Date(Date.now() + 9 * 3600000).toISOString().split('T')[1].substring(0, 8);
}

function report(msg, type = 'info') {
    const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : type === 'error' ? '🚨' : 'ℹ️';
    const logMsg = `[${getLogTime()} KST] ${icon} ${msg}`;
    console.log(logMsg);
}

function clean(raw, mode = 'text') {
    if (!raw) return mode === 'arr' ? '[]' : '';
    let txt = raw.replace(/`\`\`(html|json|javascript|js|css)?/gi, '').replace(/`\`\`/g, '').trim();
    if (mode === 'arr') {
        const start = txt.indexOf('[');
        const end = txt.lastIndexOf(']');
        if (start !== -1 && end !== -1) txt = txt.substring(start, end + 1);
    }
    return txt;
}

async function callAI(model, prompt) {
    try {
        const res = await model.generateContent(prompt);
        return res.response.text();
    } catch (e) {
        const msg = e.message.toLowerCase();
        if (msg.includes('429') || msg.includes('quota') || msg.includes('exhausted')) {
            report('⏳ [API 할당량 초과] 60초 후 다시 시도합니다...', 'warning');
            await new Promise(r => setTimeout(r, 60000));
            return callAI(model, prompt);
        }
        throw e;
    }
}

async function searchSerper(query, lang) {
    try {
        report(`🔍 [실시간 리서치]: "${query}" 관련 구글 검색 데이터 수집 중...`);
        const res = await axios.post('https://google.serper.dev/search', { q: query, gl: lang === 'ko' ? 'kr' : 'us', hl: lang }, { headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' }, timeout: 15000 });
        const data = res.data.organic || [];
        const result = { text: data.slice(0, 5).map(o => `Title: ${o.title}\nSnippet: ${o.snippet}`).join('\n\n') };
        report(`📊 [데이터 확보]: 상위 ${data.length}개 검색 결과 분석 완료`);
        return result;
    } catch (e) {
        report(`⚠️ [Serper 에러]: ${e.message}`, 'warning');
        return { text: '' };
    }
}

async function genImg(prompt, model, idx, ratio = '16:9') {
    try {
        const revised = await callAI(model, `Provide a high-quality stable diffusion prompt (${ratio}) based on: ${prompt}. Output only prompt.`);
        const cleanPrompt = revised.trim().replace(/^"|"$/g, '');
        report(`🎨 [이미지 설계]: ${cleanPrompt.substring(0, 100)}${cleanPrompt.length > 100 ? '...' : ''}`);

        let imageUrl = '';
        const kieKey = process.env.KIE_API_KEY;

        // 1. Kie.ai (Premium Image Generation)
        if (kieKey && kieKey.length > 5) {
            try {
                report(`   ㄴ [Kie.ai] z-image 호출 중 (이미지 생성)...`);
                const cr = await axios.post('https://api.kie.ai/api/v1/jobs/createTask', {
                    model: 'z-image',
                    input: { prompt: revised + ', high-end, editorial photography, 8k', aspect_ratio: ratio }
                }, { headers: { Authorization: 'Bearer ' + kieKey }, timeout: 20000 });

                const tid = cr.data.taskId || cr.data.data?.taskId;
                if (tid) {
                    for (let a = 0; a < 15; a++) {
                        await new Promise(r => setTimeout(r, 6000));
                        const pr = await axios.get('https://api.kie.ai/api/v1/jobs/recordInfo?taskId=' + tid, { headers: { Authorization: 'Bearer ' + kieKey }, timeout: 10000 });
                        const state = pr.data.state || pr.data.data?.state;
                        if (state === 'success') {
                            const resData = pr.data.resultJson || pr.data.data?.resultJson;
                            const resJson = typeof resData === 'string' ? JSON.parse(resData) : resData;
                            imageUrl = resJson.resultUrls[0];
                            break;
                        }
                        if (state === 'fail' || state === 'failed') break;
                    }
                }
            } catch (e) { report(`   ㄴ [Kie.ai] 중단 (${e.message}): 다음 엔진 전환`, 'warning'); }
        }

        // 2. Pollinations.ai (FLUX Fallback)
        if (!imageUrl) {
            const [w, h] = ratio === '2:3' ? [800, 1200] : [1080, 720];
            imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(revised)}?width=${w}&height=${h}&seed=${Math.floor(Math.random() * 99999)}&nologo=true&enhance=true`;
        }

        // 3. ImgBB Upload (영구 보관)
        const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } });
        if (res.status !== 200) throw new Error("Image download failed");

        const form = new FormData();
        form.append('image', Buffer.from(res.data).toString('base64'));
        const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
        return ir.data.data.url;
    } catch (e) {
        try {
            // Level 2 Fallback: High quality stock photo
            const seed = prompt.replace(/[^a-zA-Z]/g, '').substring(0, 10) + idx;
            const fallbackUrl = `https://picsum.photos/seed/${seed}/1080/720`;
            const fbRes = await axios.get(fallbackUrl, { responseType: 'arraybuffer', timeout: 5000 });
            const form = new FormData();
            form.append('image', Buffer.from(fbRes.data).toString('base64'));
            const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
            return ir.data.data.url;
        } catch (fallbackErr) {
            // Level 3 Fallback: Canvas Error Image
            try {
                const cv = createCanvas(1080, 720);
                const ctx = cv.getContext('2d');
                const h = Math.floor(Math.random() * 360);
                const grad = ctx.createLinearGradient(0, 0, 1080, 720);
                grad.addColorStop(0, `hsl(${h}, 70%, 40%)`);
                grad.addColorStop(1, `hsl(${h + 60}, 70%, 20%)`);
                ctx.fillStyle = grad;
                ctx.fillRect(0, 0, 1080, 720);

                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                for (let i = 0; i < 8; i++) {
                    ctx.beginPath();
                    ctx.arc(Math.random() * 1080, Math.random() * 720, Math.random() * 300 + 100, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
                ctx.font = 'bold 45px sans-serif';
                ctx.fillText('Dynamic Display Image', 540, 360);
                const form = new FormData();
                form.append('image', cv.toBuffer('image/jpeg').toString('base64'));
                const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
                return ir.data.data.url;
            } catch (e) { return ''; }
        }
    }
}

async function genThumbnail(meta, model, ratio = '16:9') {
    try {
        const bgUrl = await genImg(meta.bgPrompt || meta.prompt || meta.mainTitle || target, model, 0, ratio);
        const bg = await loadImage(bgUrl);
        const isPin = ratio === '2:3';
        const w = isPin ? 800 : 1200;
        const h = isPin ? 1200 : 630;
        const cv = createCanvas(w, h);
        const ctx = cv.getContext('2d');
        ctx.drawImage(bg, 0, 0, w, h);
        if (isPin) {
            ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
            ctx.fillRect(0, 0, w, h);
        }
        const grad = ctx.createLinearGradient(0, h * 0.3, 0, h);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(0.6, 'rgba(0,0,0,0.7)');
        grad.addColorStop(1, 'rgba(0,0,0,0.95)');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.shadowColor = 'rgba(0,0,0,0.9)';
        ctx.shadowBlur = 15;
        const mainTitle = (meta.mainTitle || meta.prompt || '').trim();
        const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(mainTitle);
        let fontSize = isPin ? (isKorean ? 68 : 58) : 60;
        ctx.font = `bold ${fontSize}px "${activeFont}", "Malgun Gothic", "NanumGothic", "Arial", sans-serif`;

        let lines = [];
        let maxLineW = w * 0.82;
        if (isKorean) {
            let currentLine = '';
            for (let char of mainTitle) {
                let testLine = currentLine + char;
                if (ctx.measureText(testLine).width > maxLineW) {
                    lines.push(currentLine);
                    currentLine = char;
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine);
        } else {
            let words = mainTitle.split(' ');
            let currentLine = '';
            for (let word of words) {
                let testLine = currentLine + word + ' ';
                if (ctx.measureText(testLine).width > maxLineW) {
                    lines.push(currentLine.trim());
                    currentLine = word + ' ';
                } else {
                    currentLine = testLine;
                }
            }
            lines.push(currentLine.trim());
        }

        if (lines.length > 4) {
            fontSize = Math.floor(fontSize * 0.8);
        }
        ctx.font = `bold ${fontSize}px "${activeFont}", "Malgun Gothic", "NanumGothic", sans-serif`;

        const totalH = lines.length * (fontSize + 18);
        let y = isPin ? (h * 0.8) - (totalH / 2) : (h * 0.55) - (totalH / 2);
        for (let l of lines) {
            ctx.fillText(l, w / 2, y);
            y += fontSize + 18;
        }

        // [ATTRIBUTION_FIX] 하단 라벨 추가
        ctx.fillStyle = '#38bdf8';
        ctx.font = `bold 28px "${activeFont}", sans-serif`;
        ctx.fillText('designed by smileseon', w / 2, h * 0.9);

        const form = new FormData();
        form.append('image', cv.toBuffer('image/jpeg').toString('base64'));
        const ir = await axios.post('https://api.imgbb.com/1/upload?key=' + process.env.IMGBB_API_KEY, form, { headers: form.getHeaders() });
        return ir.data.data.url;
    } catch (e) {
        return await genImg(meta.mainTitle || meta.prompt, model, 0, ratio);
    }
}




async function writeAndPost(model, target, lang, blogger, bId, pTime, extraLinks = [], idx, total, persona = '') {
    const { text: searchData } = await searchSerper(target, lang);
    let pillarContext = '';

    if (extraLinks.length > 0) {
        const isKo = lang === 'ko';
        const btnText = isKo ? "▶ 관련 가이드 자세히 보기" : "▶ Read More Guide";
        const links = extraLinks.map((l, idx) => `[서브글 ${idx + 1}] 제목: ${l.title}\n[복사해서 본문에 넣을 HTML 코드]:\n<div style='margin: 40px 0;'><p style='font-size:16px; font-weight:700; color:#334155;'>🎯 Related Deep Dive:</p><a href='${l.url}' class='cluster-btn'>${l.title} ${btnText}</a></div>`).join('\n\n');

        const contextPrompt = isKo
            ? `[INTERNAL_LINK_PUNITIVE_MISSION]: 이 포스팅은 메인 허브(Pillar) 글입니다. 
            ★ 절대 규칙: 아래 제공된 ${extraLinks.length}개의 <서브글> 리스트를 기반으로, 본문 중간중간 관련된 내용이 나올 때 해당 서브글로 이동하는 버튼을 **반드시 각각 하나씩** 삽입하세요.
            ⚠️ 엉뚱한 링크를 만들지 마세요! 아래 리스트에 있는 **[복사해서 본문에 넣을 HTML 코드]**를 1글자도 바꾸지 말고 그대로 복사해서 배치만 하세요.`
            : `[INTERNAL_LINK_PUNITIVE_MISSION]: This is a Pillar post. 
            ★ STRICT RULE: You must insert exactly ${extraLinks.length} buttons in the article body linking to the provided sub-articles.
            ⚠️ DO NOT generate your own links! Simply COPY AND PASTE the exact **[복사해서 본문에 넣을 HTML 코드]** provided below into appropriate related sections of your content.`;
        pillarContext = `\n${contextPrompt}\n\n[서브글 목록 및 주입용 코드]\n${links}`;
    }

    const personaTag = persona ? `\n[SPECIFIC_PERSONA]: ${persona}` : '';
    const langTag = `\n[TARGET_LANGUAGE]: ${lang === 'ko' ? 'Korean' : 'English'}${personaTag}`;
    report(`🔥 [${idx}/${total}] 집필 시작: ${target}`);
    report(`💻 [AI 프롬프트 생성 중]: 리서치 데이터 ${searchData.length}자 포함...`);

    const h1Instruction = lang === 'ko'
        ? "<h1>(10년차 SEO 전문가의 구글 상단 노출을 위한 롱테일 키워드 제목)</h1>"
        : "<h1>(SEO Optimized Long-tail Keyword Title for Google Ranking)</h1>";

    const metaTitles = lang === 'ko'

        ? { thumb: "썸네일용 매력적인 짧은 한글 제목", pin: "핀터레스트용 세로형 매력적인 한글 제목" }
        : { thumb: "Short, eye-catching English title for thumbnail", pin: "Viral English title for Pinterest vertical pin" };

    // MISSION 분량 확보를 위한 강력한 지침 추가
    const m1Prompt = MASTER_GUIDELINE + `
[MISSION: FULL POST GENERATION] 
정확히 아래 포맷에 맞춰서 한 번에 모든 글을 작성해야 합니다. 절대 포맷을 어기지 마세요.
전체 글 분량은 6,000자~8,000자 이상 확보하도록 상세하게 풀어 쓰세요. 특히, 짧게 넘어가지 말고 본문의 섹션별 설명을 매우 길게 늘려야 합니다.

[필수 디자인 컴포넌트 - 반드시 본문에 포함하세요]:
★ 배치 전략:
    - 글이 지루해지지 않도록, H2 텍스트가 2개째 등장하는 타이밍마다 삽입하여 독자의 시선을 적절하게 환기하세요.
    - **[Time Awareness]**: Today's date is ${getKSTDateString()}. Always write based on the latest available information as of today. If referencing years, focus on the current year and future trends.

(A) 인사이트 박스 → <div class='insight-box'><strong>💡 Key Insight</strong><br>핵심 포인트 내용</div> — 최소 2개
(B) 전문가 꿀팁 → <div class='tip-box'><strong>💡 Smileseon's Pro Tip</strong><br>꿀팁 내용</div> — 최소 2개
(C) 면책 조항 (Disclaimer): 반드시 글의 최하단에 위치시키고 레이블을 강조하세요.
(D) 치명적 주의 → <div class='warn-box'><strong>🚨 Critical Warning</strong><br>주의 내용</div> — 최소 1개
(E) 신뢰 데이터 → <div class='data-box'><strong>📊 Fact Check</strong><br>팩트 체크 내용</div> — 최소 2개
(F) 마무리 박스 → <div class='closing-box'><h2>최종 마무리</h2><p>핵심 요약</p></div> — 글 맨 마지막에 반드시 1개
(G) 각 섹션에 가능하면 <table> 포함 (4열x4행 이상의 비교 데이터)
(H) FAQ 섹션에 최소 8~10개의 Q&A 포함

[META_DATA_START]
{
  "IMG_0": { "mainTitle": "${metaTitles.thumb}", "bgPrompt": "썸네일 배경 이미지 묘사 영문 프롬프트" },
  "IMG_1": { "prompt": "본문 첫번째 이미지 묘사 영문 프롬프트" },
  "IMG_2": { "prompt": "본문 두번째 이미지 묘사 영문 프롬프트" },
  "IMG_3": { "prompt": "본문 세번째 이미지 묘사 영문 프롬프트" },
  "IMG_PINTEREST": { "mainTitle": "${metaTitles.pin}", "prompt": "Pinterest 전용 세로형(2:3) 고퀄리티 이미지 묘사 영문 프롬프트" }
}
[META_DATA_END]


[CONTENT_START]
${h1Instruction}
<div class='toc-box'>
  <h3>Table of Contents</h3>
  <ul>
    <li><a href='#section-1'>첫번째 섹션 제목</a></li>
    <li><a href='#section-2'>두번째 섹션 제목</a></li>
  </ul>
</div>
<h2 id='section-1'>첫번째 섹션</h2>
<p>본문 내용...</p>
<div class='insight-box'><strong>💡 Key Insight</strong><br>인사이트 내용</div>
[[IMG_1]]
<h2 id='section-2'>두번째 섹션</h2>
<p>본문 내용...</p>
<div class='tip-box'><strong>💡 Smileseon's Pro Tip</strong><br>꿀팁 내용</div>
<h2>세번째 섹션</h2>
<p>본문 내용...</p>
<div class='data-box'><strong>📊 Fact Check</strong><br>데이터 내용</div>
[[IMG_2]]
<h2>네번째 섹션</h2>
<p>본문 내용...</p>
<div class='warn-box'><strong>🚨 Critical Warning</strong><br>주의 내용</div>
[[IMG_3]]
... 끝까지 (8~10개의 FAQ, closing-box 마무리 포함)
<div class='closing-box'><h2>최종 마무리</h2><p>핵심 요약</p></div>
[CONTENT_END]

★ 경고: 본문 내에 이미지 삽입부에는 절대로 <img src=...> 태그를 쓰지 말고, 오직 [[IMG_1]], [[IMG_2]], [[IMG_3]] 과 같은 치환자만 적으세요.
${target}
${searchData}
${pillarContext}
${langTag}`;

    const m1 = await callAI(model, m1Prompt);

    let finalHtml = '';
    let m0 = null;
    const imgMetas = {};

    // === 메타데이터 파싱 (신규 포맷 + 레거시 포맷 모두 지원) ===
    try {
        const metaMatch = m1.match(/\[META_DATA_START\]([\s\S]*?)\[META_DATA_END\]/i);
        if (metaMatch) {
            const cleanJsonStr = metaMatch[1].replace(/```json/i, '').replace(/```/g, '').trim();
            const metaJson = JSON.parse(cleanJsonStr);
            if (metaJson.IMG_0) m0 = metaJson.IMG_0;
            if (metaJson.IMG_1) imgMetas[1] = metaJson.IMG_1;
            if (metaJson.IMG_2) imgMetas[2] = metaJson.IMG_2;
            if (metaJson.IMG_3) imgMetas[3] = metaJson.IMG_3;
            if (metaJson.IMG_PINTEREST) imgMetas['P'] = metaJson.IMG_PINTEREST;
        }
    } catch (e) { report('⚠️ 신규 메타 파싱 실패, 레거시 파싱 시도', 'warning'); }

    // 레거시 포맷 파싱 (IMG_0: { mainTitle: "...", bgPrompt: "..." })
    if (!m0) {
        const legacyRegex = /IMG_(\d+):\s*\{([^}]*)\}/gi;
        let lm;
        while ((lm = legacyRegex.exec(m1)) !== null) {
            const i = Number(lm[1]), raw = lm[2];
            if (i === 0) m0 = { mainTitle: (raw.match(/mainTitle:\s*['"](.*?)['"]/i) || [])[1] || target, bgPrompt: (raw.match(/bgPrompt:\s*['"](.*?)['"]/i) || raw.match(/prompt:\s*['"](.*?)['"]/i) || [])[1] || target };
            else imgMetas[i] = { prompt: (raw.match(/prompt:\s*['"](.*?)['"]/i) || [])[1] || target };
        }
    }

    if (!m0) m0 = { mainTitle: target, bgPrompt: 'Abstract premium background' };

    // === 본문 추출 ===
    const contentMatch = m1.match(/\[CONTENT_START\]([\s\S]*?)\[CONTENT_END\]/i);
    if (contentMatch) {
        finalHtml = contentMatch[1].trim();
    } else {
        const metaEndIdx = m1.indexOf('[META_DATA_END]');
        finalHtml = metaEndIdx !== -1 ? m1.substring(metaEndIdx + 15).trim() : clean(m1, 'text');
    }

    // === 본문에서 메타데이터 잔여물 완전 제거 (최강 정규식) ===
    finalHtml = finalHtml.replace(/\[META_DATA_START\][\s\S]*?\[META_DATA_END\]/gi, '');
    finalHtml = finalHtml.replace(/\[CONTENT_START\]/gi, '').replace(/\[CONTENT_END\]/gi, '');
    finalHtml = finalHtml.replace(/IMG_\d+\s*[:=]\s*\{[\s\S]*?\}/gi, '');
    finalHtml = finalHtml.replace(/\{\s*"IMG_\d+"[\s\S]*?\}/g, '');
    finalHtml = finalHtml.replace(/```json[\s\S]*?```/gi, '');
    finalHtml = finalHtml.replace(/^\s*text\s*$/gm, '');

    // [MARKDOWN_TO_HTML] 마크다운 **강조** 문법을 HTML 태그로 변환시켜 깨짐 현상 방지
    finalHtml = finalHtml.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    finalHtml = finalHtml.trim();

    let finalTitle = target;
    const h1Match = finalHtml.match(/<h1.*?>([\s\S]*?)<\/h1>/i);
    if (h1Match) finalTitle = h1Match[1].replace(/<[^>]+>/g, '').trim();
    finalHtml = finalHtml.replace(/<h1.*?>[\s\S]*?<\/h1>/gi, '').trim();

    if (m0) {
        const url0 = await genThumbnail(m0, model);
        finalHtml = `<img src='${url0}' alt='${m0.mainTitle}' style='width:100%; border-radius:15px; margin-bottom:40px;'>` + finalHtml.replace(/\s*\[\[IMG_0\]\]\s*/gi, '');
    }
    for (let i = 1; i <= 3; i++) {
        const reg = new RegExp(`\\s*\\[\\[IMG_${i}\\]\\]\\s*`, 'gi');
        if (reg.test(finalHtml)) {
            const urlI = await genImg((imgMetas[i] || {}).prompt || target, model, i);
            finalHtml = finalHtml.replace(reg, `<div style='text-align:center; margin:35px 0;'><img src='${urlI}' alt='${target}' style='width:100%; border-radius:12px;'></div>`);
        } else {
            // 만약 치환자가 없다면 H2 태그 위에 강제로 이미지를 주입
            const urlI = await genImg((imgMetas[i] || {}).prompt || target, model, i);
            let injected = false;
            let count = 0;
            finalHtml = finalHtml.replace(/<h2/gi, (match) => {
                count++;
                if (count === (i * 2)) {
                    injected = true;
                    return `<div style='text-align:center; margin:35px 0;'><img src='${urlI}' alt='${target}' style='width:100%; border-radius:12px;'></div>\n<h2`;
                }
                return match;
            });
        }
    }

    // === [IMG_PINTEREST] 처리 (2:3 수직 이미지 - 최상단 히든 썸네일) ===
    let urlPin = '';
    try {
        const pinMeta = imgMetas['P'] || { mainTitle: target, bgPrompt: target + " premium vertical pinterest style infographic 2026" };
        if (!pinMeta.mainTitle) pinMeta.mainTitle = target; // [TITLE_STABILITY] 영문 prompt가 제목으로 쓰이는 것 방지
        urlPin = await genThumbnail(pinMeta, model, '2:3');

        const pinHtml = `<div style='display:none;'><img src='${urlPin}' alt='Pinterest Optimized - ${target}'></div>\n`;
        // 무조건 최상단에 히든으로 삽입 (기존 치환자는 제거)
        finalHtml = pinHtml + finalHtml.replace(/\[\[IMG_PINTEREST\]\]/gi, '');
    } catch (pinErr) {
        report('⚠️ 핀터레스트 썸네일 생성 실패: ' + pinErr.message, 'warning');
    }

    // === [LINK_STABILITY] 메인글 하단에 서브글 링크 목록 자동 생성 (안전장치) ===
    if (extraLinks.length > 0) {
        const isKo = lang === 'ko';
        const sectionTitle = isKo ? "🔗 함께 읽으면 좋은 관련 가이드" : "🔗 Recommended Related Guides";
        let linkListHtml = `\n<div class='related-posts-box' style='margin-top:50px; padding:30px; background:rgba(99,102,241,0.05); border-left:5px solid #6366f1; border-radius:15px;'>`;
        linkListHtml += `<h3 style='margin-top:0; color:#6366f1;'>${sectionTitle}</h3><ul style='list-style:none; padding:0; margin:0;'>`;

        extraLinks.forEach(link => {
            linkListHtml += `<li style='margin:15px 0; padding-bottom:10px; border-bottom:1px solid rgba(0,0,0,0.05);'>
                <a href='${link.url}' style='text-decoration:none; font-weight:bold; color:#1e40af; display:block; transition:all 0.3s;'>
                    • ${link.title} <span style='color:#6366f1; font-size:0.8em; margin-left:10px;'>기사 보기 →</span>
                </a>
            </li>`;
        });
        linkListHtml += `</ul></div>\n`;

        // 본문 마지막에 관련 글 섹션 강제 결합
        finalHtml += linkListHtml;
    }

    // [CRITICAL FIX]: Remove redundant hardcoded disclaimer here because AI will generate it based on Master Guideline.
    const isFuture = pTime.getTime() > Date.now() + 60000;
    const reqBody = {
        title: finalTitle,
        content: STYLE + finalHtml + '</div>',
        published: pTime.toISOString()
    };
    // [SCHEDULE_STABILITY]: 시간이 미래라면 구글 블로그 API 스펙에 맞춰 명시적으로 SCHEDULED 상태를 던집니다.
    if (isFuture) reqBody.status = 'SCHEDULED';

    const res = await blogger.posts.insert({ blogId: bId, isDraft: false, requestBody: reqBody });
    report(`🖋️ [포스팅 성공]: "${finalTitle}"`, 'success');
    report(`🔗 [URL]: ${res.data.url}`);
    return { title: finalTitle, url: res.data.url };
}

async function run() {
    const config = JSON.parse(fs.readFileSync('cluster_config.json', 'utf8'));
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    const blogger = google.blogger({ version: 'v3', auth });

    report(`⚙️ 설정을 로드했습니다. (언어: ${config.blog_lang}, 모드: ${config.post_mode})`);
    report(`🚀 [TEST MODE]: daily_count(${config.daily_count}) 제한을 무시하고 즉시 실행합니다. (Unlimited Mode Enabled)`);

    report('🛡️ [Turbo Full-Mode]: 프리미엄 클러스터 구축 시작');


    let baseKeyword = config.pillar_topic || 'PC Hardware';
    const categories = {
        "1": { name: "PC Repair & Maintenance", query: "PC repair maintenance tips guide 2026", persona: "15년 경력의 베테랑 PC 정비사" },
        "2": { name: "Latest Hardware & Parts", query: "latest PC components hardware news 2026", persona: "하드웨어 벤치마크 전문 리뷰어" },
        "3": { name: "Gaming & Peripherals", query: "best gaming gear peripherals trends 2026", persona: "프로게이머 출신의 게이밍 기어 전문가" },
        "4": { name: "AI & Future Technology", query: "future AI technology trends 2026", persona: "실리콘밸리 기술 전략가이자 미래학자" },
        "5": { name: "Coding & Software", query: "programming software development trends 2026", persona: "풀스택 시니어 소프트웨어 엔지니어" },
        "6": { name: "Cooking & Recipes", query: "trending food recipes cooking tips 2026", persona: "미쉐린 가이드 스타일의 요리 연구가" },
        "7": { name: "Fashion & Beauty", query: "latest fashion beauty style trends 2026", persona: "글로벌 패션 에디터이자 스타일 디렉터" },
        "8": { name: "Health & Medical", query: "health wellness medical insights 2026", persona: "전문 헬스 케어 어드바이저" },
        "9": { name: "Global News & Issues", query: "global news world issue summary 2026", persona: "국제 정세 전문 시사 평론가" },
        "10": { name: "Finance & Stock", query: "finance stock market investment trends 2026", persona: "월스트리트 출신 투자 칼럼니스트" },
        "11": { name: "Travel & Adventure", query: "world travel destination adventure 2026", persona: "럭셔리 트래블 작가이자 탐험가" },
        "12": { name: "Home & Interior", query: "modern home interior design furniture 2026", persona: "하이엔드 공간 디자이너" }
    };

    if (baseKeyword === '자동생성') {
        const targetCats = config.target_categories || ["1"];
        let selectedCatKey;

        if (targetCats.includes("ALL")) {
            const keys = Object.keys(categories);
            selectedCatKey = keys[Math.floor(Math.random() * keys.length)];
            report(`🌐 [ALL 모드]: 전체 카테고리 중 랜덤 선정 (${categories[selectedCatKey].name})`);
        } else {
            selectedCatKey = targetCats[Math.floor(Math.random() * targetCats.length)];
            report(`📂 [복수 카테고리]: 선택된 목록 중 선정 (${categories[selectedCatKey].name})`);
        }

        const currentCat = categories[selectedCatKey];
        report(`🔍 [실시간 트렌드 분석]: ${currentCat.name} 분야의 이슈 파악...`);

        const trendSource = await searchSerper(currentCat.query, config.blog_lang);
        const pool = config.clusters || [];

        const selectionPrompt = `You are an elite trend analyst. 
        Date: ${getKSTDateString()}
        Category: ${currentCat.name}
        Persona: ${currentCat.persona}
        
        [Real-time News]:
        ${trendSource.text}
        
        [Keyword Pool]:
        ${pool.slice(0, 50).join(', ')}
        
        ★ MISSION: Select the best keyword from the pool OR create a new one based on trends.
        Output only the final keyword.`;

        const selectionRes = await callAI(model, selectionPrompt);
        baseKeyword = selectionRes.trim().replace(/^"|"$/g, '');
        config.selected_persona = currentCat.persona;
        report(`🎯 최종 전략 주제 확정: [ ${baseKeyword} ]`);
    } else {
        report(`📌 고정 키워드 사용: ${baseKeyword}`);
        config.selected_persona = ''; // 고정 키워드 시에는 페르소나 명시 안 함(기본값 사용)
    }

    // 1단계: 세부 주제 추출 (강력한 SEO 전략 + 페르소나 적용)
    const langName = config.blog_lang === 'ko' ? 'Korean' : 'English';
    const personaTag = config.selected_persona ? `\n[SPECIFIC_PERSONA]: ${config.selected_persona}` : '';

    const clusterPrompt = `You are a 10-year veteran blog Google SEO expert specializing in Topic Clusters.${personaTag}
    Today's date is ${getKSTDateString()}. 
    Niche: '${baseKeyword}'
    
    ★ MISSION: Create 5 high-performing blog post titles (1 Pillar + 4 Spokes) in ${langName} that dominate Google Search.
    
    [IMPORTANT: PERSONA VOICE]:
    - Use the vocabulary, tone, and perspective of the [SPECIFIC_PERSONA] defined above.
    - If the persona is an engineer, be technical and precise. If a chef, be sensory and authoritative.
    
    [SEO STRATEGIES TO APPLY]:
    1. **Recency (2026)**: Include '2026' naturally to trigger freshness.
    2. **Title Variety**: **DO NOT** use the same structure for all titles. Mix styles: Curiosity, Expert Opinion, Question-Based, Case Study, and 1-2 occasional Listicles.
    3. **Powerful Benefits**: Mention a specific, visceral benefit suited to your persona.
    4. **No Generic Fillers**: Avoid repetitive hooks like "Ultimate Guide". Use unique, persona-driven authority hooks.
    5. **No Numbered Heading**: NEVER use "1.", "2." in titles.
    
    Output ONLY a JSON array of 5 titles string.`;
    const clusterRes = await callAI(model, clusterPrompt);
    let list = JSON.parse(clean(clusterRes, 'arr'));

    // [Safety Fix] AI가 ["A", "B"] 대신 [{"title":"A"}, {"title":"B"}] 형태로 줄 경우 처리
    if (Array.isArray(list) && list.length > 0 && typeof list[0] === 'object') {
        list = list.map(item => item.title || item.topic || item.headline || Object.values(item)[0]);
    }

    report(`📜 [생성된 클러스터 구조]:`);
    list.forEach((t, i) => report(`   ${i === 0 ? '🏆 Pillar' : '🎈 Spoke ' + i}: ${t}`));

    const pillarTitle = list[0]; const spokes = list.slice(1);
    const subLinks = [];

    // [Time Optimization] 스케줄 기준 시간 설정 및 절대 예약 시간 체계 (UTC 기준)
    let currentTime = new Date();
    // [해결] 엔진 구동 시간을 넉넉히 감안하여, '무조건 첫 글부터 미래'로 지정되게 15분 뒤로 기본 세팅
    currentTime.setMinutes(currentTime.getMinutes() + 15);

    if (config.schedule_time) {
        const [sh, sm] = config.schedule_time.split(':');
        const kstOffsetMs = 9 * 3600000;
        let nowKst = new Date(Date.now() + kstOffsetMs);
        nowKst.setUTCHours(parseInt(sh), parseInt(sm), 0, 0); // KST 기준으로 시간 강제 맞춤
        if (nowKst.getTime() < Date.now() + kstOffsetMs) {
            nowKst.setUTCDate(nowKst.getUTCDate() + 1); // 지정 시간이 이미 지났다면 내일로 예약
        }
        currentTime = new Date(nowKst.getTime() - kstOffsetMs); // 다시 UTC 기준 절대 Date로 변환
    }

    // 2단계: Spoke(서브 글) 먼저 작성 - 실제 URL 확보
    for (let i = 0; i < spokes.length; i++) {
        // [핵심] 랜덤 지연 설정 시 '글 하나당' 1~120분 랜덤 시간 예약
        if (config.random_delay) {
            const delay = Math.floor(Math.random() * 120) + 1;
            currentTime.setMinutes(currentTime.getMinutes() + delay);
            report(`🎲 [Spoke ${i + 1}] ${delay}분 지연 예약: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
        } else {
            // [해결] 기본 5분 간격은 엔진 실행시간(2-3분)때문에 미래가 아닌 '현재'로 꼬일 수 있으므로 20분 간격으로 지연
            if (i > 0) currentTime.setMinutes(currentTime.getMinutes() + 20);
            report(`⏰ [Spoke ${i + 1}] 20분 간격 예약 지정시간: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
        }

        const pTime = new Date(currentTime.getTime());
        const sRes = await writeAndPost(model, spokes[i], config.blog_lang, blogger, config.blog_id, pTime, [], i + 1, 5, config.selected_persona);
        if (sRes) subLinks.push(sRes);
        await new Promise(r => setTimeout(r, 30000));
    }

    // 3단계: Pillar(메인 글) 마지막 작성
    report(`🎯 최종 메인 허브(Pillar) 글 작성: ${pillarTitle}`);
    if (config.random_delay) {
        const finalDelay = Math.floor(Math.random() * 120) + 1;
        currentTime.setMinutes(currentTime.getMinutes() + finalDelay);
        report(`🎲 [Pillar] ${finalDelay}분 최종 지연 예약: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
    } else {
        currentTime.setMinutes(currentTime.getMinutes() + 20);
        report(`⏰ [Pillar] 최종 블로그 예약 지정시간: ${new Date(currentTime.getTime() + 9 * 3600000).toISOString().replace('T', ' ').substring(0, 16)} KST`);
    }

    const pillarTime = new Date(currentTime.getTime());
    await writeAndPost(model, pillarTitle, config.blog_lang, blogger, config.blog_id, pillarTime, subLinks, 5, 5, config.selected_persona);
    report('🌈 프리미엄 클러스터 전략 완료!', 'success');
}
run().catch(e => { report(e.message, 'error'); process.exit(1); });
