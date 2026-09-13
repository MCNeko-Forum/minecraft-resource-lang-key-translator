// 单文件模式：state.item 为当前打开的唯一文件（lang 语言文件 / archive 资源包与世界文件）
const state = {
  item: null,
  hasUnsavedChanges: false,
  options: { stripCodes: true },
  translateTarget: '',
  glossary: [],
  scope: { lang: true, manifest: true, signs: true, books: true, customNames: true, misc: true, npc: true, scripts: true, officialGlossary: true },
  service: 'client.edge'
};

const $ = (id) => document.getElementById(id);
const snackbar = (message) => { $('snackbar').textContent = message; $('snackbar').open = true; };

// 翻译术语表（设置弹窗维护，localStorage 持久化）：翻译时原文术语强制替换为指定译文；读不到（隐身模式/Node 自检）就当空表
const loadGlossary = () => {
  try {
    const list = JSON.parse(localStorage.getItem('mc-lang-glossary') || '[]');
    return Array.isArray(list) ? list.filter((item) => item && typeof item.source === 'string' && typeof item.target === 'string') : [];
  } catch { return []; }
};
state.glossary = loadGlossary();

// 翻译范围开关（设置弹窗维护，localStorage 持久化）：关闭的类型在翻译时整体跳过
const loadScope = () => {
  try {
    const saved = JSON.parse(localStorage.getItem('mc-lang-scope') || '{}');
    return { ...state.scope, ...(saved && typeof saved === 'object' ? saved : {}) };
  } catch { return { ...state.scope }; }
};
state.scope = loadScope();
const saveScope = () => { try { localStorage.setItem('mc-lang-scope', JSON.stringify(state.scope)); } catch {} };

// 翻译服务（设置弹窗选择）：client.edge 浏览器直连微软翻译（免服务器，官方文档推荐）；translate.service 为开源公共服务（负载高易故障）
const SERVICES = ['client.edge', 'translate.service'];
const loadService = () => {
  try { const saved = localStorage.getItem('mc-translate-service'); return SERVICES.includes(saved) ? saved : 'client.edge'; } catch { return 'client.edge'; }
};
const applyService = () => window.translate?.service?.use?.(state.service);
const saveService = () => { try { localStorage.setItem('mc-translate-service', state.service); } catch {} };
state.service = loadService();
applyService();

// 基岩版官方支持的 29 种语言（来源：Microsoft Learn Add-On Pack Contents）
const BEDROCK_LANGUAGES = {
  en_US: '英语（美国）', en_GB: '英语（英国）', de_DE: '德语（德国）',
  fr_FR: '法语（法国）', fr_CA: '法语（加拿大）', it_IT: '意大利语（意大利）',
  ja_JP: '日语（日本）', ko_KR: '韩语（韩国）', zh_CN: '简体中文（中国大陆）',
  zh_TW: '繁体中文（中国台湾）', ru_RU: '俄语（俄罗斯）', es_ES: '西班牙语（西班牙）',
  es_MX: '西班牙语（墨西哥）', pt_BR: '葡萄牙语（巴西）', pt_PT: '葡萄牙语（葡萄牡）',
  nl_NL: '荷兰语（荷兰）', bg_BG: '保加利亚语', cs_CZ: '捷克语',
  da_DK: '丹麦语', el_GR: '希腊语', fi_FI: '芬兰语',
  hu_HU: '匈牙利语', id_ID: '印尼语', nb_NO: '挪威语',
  pl_PL: '波兰语', sk_SK: '斯洛伐克语', sv_SE: '瑞典语',
  tr_TR: '土耳其语', uk_UA: '乌克兰语'
};

// 基岩语言代码 → xnx3/translate 语言名（地区变体共享同一翻译语言，已对照 api.translate.zvo.cn/language.json 核实）
const TRANSLATE_LANGUAGES = {
  en_US: 'english', en_GB: 'english', de_DE: 'deutsch',
  fr_FR: 'french', fr_CA: 'french', it_IT: 'italian',
  ja_JP: 'japanese', ko_KR: 'korean', zh_CN: 'chinese_simplified',
  zh_TW: 'chinese_traditional', ru_RU: 'russian', es_ES: 'spanish',
  es_MX: 'spanish', pt_BR: 'portuguese', pt_PT: 'portuguese',
  nl_NL: 'dutch', bg_BG: 'bulgarian', cs_CZ: 'czech',
  da_DK: 'danish', el_GR: 'greek', fi_FI: 'finnish',
  hu_HU: 'hungarian', id_ID: 'indonesian', nb_NO: 'norwegian',
  pl_PL: 'polish', sk_SK: 'slovak', sv_SE: 'swedish',
  tr_TR: 'turkish', uk_UA: 'ukrainian'
};

const languageMenuItems = () => Object.entries(BEDROCK_LANGUAGES).map(([code, name]) => `<mdui-menu-item value="${code}">${code} · ${name}</mdui-menu-item>`).join('');
// 非标准语言代码别名（部分资源包误用 en_UK）：查语言表前归一化，目标语言列表只含 29 种标准语言
const LANGUAGE_ALIASES = { en_UK: 'en_GB' };
const normalizeLanguage = (code) => LANGUAGE_ALIASES[code] || code;
const fileLabel = (fileName, language) => { const name = BEDROCK_LANGUAGES[normalizeLanguage(language)]; return fileName + (language && name ? `（${name}）` : ''); };
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

// 去掉误输的下载后缀，导出时统一由后缀选择器决定
const stripExt = (value) => String(value).trim().replace(/\.(mcpack|mcaddon|mcworld|mctemplate|zip)$/i, '');
// 双后缀 + 副本标记：.mcpack / .mcaddon / .mcworld / .mctemplate 与结尾 .zip 之间的任意文本都视为副本标记整体去除
// （.mcpack.zip / .mcpack (1)(2)(3).zip / .mcpack - 副本.zip / .mcaddon（副本2）.zip 均保留最后的扩展名；中间文本不含点号，防止误吞正常文件名）
const DOUBLE_EXT_RE = /\.(mcpack|mcaddon|mcworld|mctemplate)[^.]*\.zip$/i;
// 导出后缀识别：双后缀识别为对应扩展名（去除结尾 .zip），其它后缀回退 zip
function archiveExtOf(fileName) {
  const lower = fileName.toLowerCase();
  const m = lower.match(DOUBLE_EXT_RE);
  if (m) return m[1];
  const ext = lower.split('.').pop();
  return ['mcpack', 'mcaddon', 'mcworld', 'mctemplate', 'zip'].includes(ext) ? ext : 'zip';
}
// 包基础文件名：双后缀（含副本标记）整体去除（foo.mcpack (1).zip → foo），单后缀走 stripExt
function packBaseName(fileName) {
  const name = String(fileName).trim();
  return DOUBLE_EXT_RE.test(name) ? name.replace(DOUBLE_EXT_RE, '') : stripExt(name);
}

function inferLanguage(fileName) {
  const match = fileName.match(/^([A-Za-z]{2,3}_[A-Za-z]{2,4})\.(?:lang|txt)$/i);
  return match ? match[1] : '';
}

// TextEncoder / TextDecoder 全局实例复用
const te = new TextEncoder();
const td = new TextDecoder();

// level.dat 解析（Bedrock Edition 格式）：头部 int32 存储版本（固定10）+ int32 NBT大小，后跟小端序未压缩 NBT
// 字符串长度 u16（上限0xffff），列表计数 i32；原生未压缩，兼容 gzip/zlib 压缩（嗅探魔数）
async function parseLevelDat(rawBytes) {
  let bytes = new Uint8Array(rawBytes);  // 强制转换，避免 Node.js Buffer 兼容问题
  let compression = null;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) { bytes = new Uint8Array(pako.ungzip(bytes)); compression = 'gzip'; }
  else if (bytes[0] === 0x78 && (bytes[1] === 0x9c || bytes[1] === 0xda)) { bytes = new Uint8Array(pako.inflate(bytes)); compression = 'deflate'; }
  
  // 辅助函数：读取小端整数（避免 Node.js buffer 问题）
  const getInt32LE = (offset) => bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24);
  const getUint16LE = (offset) => bytes[offset] | (bytes[offset + 1] << 8);
  
  const storageVersion = getInt32LE(0);
  const nbtSize = getInt32LE(4);
  
  function findLevelNameTag() {
    let pos = 8;
    const tags = [];
    while (pos < bytes.length) {
      const tagType = bytes[pos++];
      if (tagType === 0) break;
      const nameLen = getUint16LE(pos); pos += 2;
      const name = td.decode(bytes.slice(pos, pos + nameLen)); pos += nameLen;
      tags.push({ tagType, name });
      
      // TAG_Compound (10): 跳过名字后继续扫描内部 tags（不跳过 value）
      if (tagType === 10) continue;
      
      if (tagType === 8 && name === 'LevelName') {
        const valueLen = getUint16LE(pos);
        const valueStart = pos + 2;
        const valueEnd = valueStart + valueLen;
        return { valueStart, valueEnd, valueLen, oldName: td.decode(bytes.slice(valueStart, valueEnd)) };
      }
      if (tagType === 1) pos += 1;
      else if (tagType === 2) pos += 2;
      else if (tagType === 3) pos += 4;
      else if (tagType === 4) pos += 8;
      else if (tagType === 5) pos += 4;
      else if (tagType === 6) pos += 8;
      else if (tagType === 7) { const len = getInt32LE(pos); pos += 4 + len; }
      else if (tagType === 8) { const len = getUint16LE(pos); pos += 2 + len; }
      else if (tagType === 9) { 
        const listType = bytes[pos++]; 
        const count = getInt32LE(pos); 
        pos += 4;
        // 跳过 list 内容（简化：假设空列表或基本类型列表）
        if (listType === 1) pos += count;
        else if (listType === 2) pos += count * 2;
        else if (listType === 3) pos += count * 4;
        else if (listType === 4) pos += count * 8;
        else if (listType === 5) pos += count * 4;
        else if (listType === 6) pos += count * 8;
      }
      else { console.warn('未知 NBT tag 类型:', tagType, 'at', pos - nameLen - 3); return null; }
    }
    console.warn('未找到 LevelName，已扫描 tags:', tags);
    return null;
  }
  
  const tag = findLevelNameTag();
  if (!tag) return null;
  return { bytes, storageVersion, nbtSizeOffset: 4, compression, ...tag };
}

async function buildLevelDat(parsed, newName) {
  const newNameBytes = te.encode(newName);
  if (newNameBytes.length > 0xffff) throw new Error('世界名称过长（超 65535 字节）');
  
  const newNameBytesLength = newNameBytes.length;
  const oldLen = parsed.valueEnd - parsed.valueStart;
  const delta = newNameBytesLength - oldLen;
  
  const result = new Uint8Array(parsed.bytes.length + delta);
  result.set(parsed.bytes.slice(0, parsed.valueStart - 2));
  
  // 写入新名称长度（u16 小端）
  result[parsed.valueStart - 2] = newNameBytesLength & 0xff;
  result[parsed.valueStart - 1] = (newNameBytesLength >> 8) & 0xff;
  
  result.set(newNameBytes, parsed.valueStart);
  result.set(parsed.bytes.slice(parsed.valueEnd), parsed.valueStart + newNameBytesLength);
  
  // 写入新 NBT 大小（i32 小端）
  const newNbtSize = parsed.bytes.length - 8 + delta;
  result[parsed.nbtSizeOffset] = newNbtSize & 0xff;
  result[parsed.nbtSizeOffset + 1] = (newNbtSize >> 8) & 0xff;
  result[parsed.nbtSizeOffset + 2] = (newNbtSize >> 16) & 0xff;
  result[parsed.nbtSizeOffset + 3] = (newNbtSize >> 24) & 0xff;
  
  // 如果原始输入是压缩的，重新压缩
  if (parsed.compression === 'gzip') {
    const stream = new CompressionStream('gzip');
    return await streamBytes(result, stream);
  } else if (parsed.compression === 'deflate') {
    const stream = new CompressionStream('deflate');
    return await streamBytes(result, stream);
  }
  
  return result;
}

// NPC 对话解析（minecraft:npc_dialogue）：遍历 dialogue/ 文件夹下的 JSON，提取 scenes 数组里的 npc_name / text / buttons[].name
async function parseDialogues(zip) {
  const dialogues = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !(path.includes('/dialogue/') || path.startsWith('dialogue/')) || !path.endsWith('.json')) continue;
    try {
      const text = await entry.async('text');
      const obj = JSON.parse(text);
      const npcDlg = obj['minecraft:npc_dialogue'];
      if (!npcDlg?.scenes) continue;
      for (const scene of npcDlg.scenes) {
        if (scene.npc_name) dialogues.push({ path, sceneId: scene.scene_id, field: 'npc_name', value: scene.npc_name });
        const sceneText = typeof scene.text === 'string' ? scene.text : scene.text?.rawtext?.[0]?.text;
        if (sceneText) dialogues.push({ path, sceneId: scene.scene_id, field: 'text', value: sceneText });
        if (scene.buttons) {
          scene.buttons.forEach((btn, i) => {
            if (btn.name) dialogues.push({ path, sceneId: scene.scene_id, field: `button_${i}`, value: btn.name });
          });
        }
      }
    } catch {}
  }
  return dialogues;
}

// 脚本字面量提取（启发式）：含字母 + 含空格 + 不含 % = 多词自然语句（非代码标识符）；含转义或 ${} 的跳过
// ponytail: 当前启发式跳过单词标识符和含 % 的格式串，可能漏掉部分翻译内容；升级方向是 AST 解析或正则库调用检测
function extractScriptLiterals(code) {
  const literals = [];
  const re = /(["'`])(?:(?!\1|\\|\$\{).)*?\1/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    const raw = match[0];
    const quote = raw[0];
    const content = raw.slice(1, -1);
    if (!content || content.includes('\\') || content.includes('${')) continue;
    if (/[a-zA-Z]/.test(content) && /\s/.test(content) && !content.includes('%')) {
      literals.push({ value: content, start: match.index, end: re.lastIndex });
    }
  }
  return literals;
}

// 解析语言文件（.lang / .txt）：键值对格式，## 注释，空行忽略；stripCodes 选项移除颜色代码 §
function parseLangText(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || line.trim().startsWith('##')) {
      entries.push({ type: 'comment', content: line });
      continue;
    }
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) {
      entries.push({ type: 'invalid', content: line });
      continue;
    }
    const key = line.slice(0, eqIndex);
    const value = line.slice(eqIndex + 1);
    entries.push({ type: 'pair', key, value });
  }
  return entries;
}

function exportLangText(entries) {
  return entries.map(e => {
    if (e.type === 'pair') return `${e.key}=${e.value}`;
    return e.content;
  }).join('\n');
}

// 加载单个文件：.lang/.txt → lang 项；.mcpack/.mcaddon/.zip/.mcworld/.mctemplate → archive 项
async function loadFile(file) {
  const name = file.name;
  const isLang = /\.(lang|txt)$/i.test(name);
  
  if (isLang) {
    const text = await file.text();
    const entries = parseLangText(text);
    const language = inferLanguage(name);
    return {
      kind: 'lang',
      name,
      language,
      entries,
      translations: [],
      sourceFile: name
    };
  }
  
  const bytes = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(bytes);
  
  // 检测是否为世界文件（含 level.dat）
  const levelDatEntry = zip.file('level.dat');
  const isWorld = !!levelDatEntry;
  
  let worldName = null;
  let levelDatParsed = null;
  if (isWorld && levelDatEntry) {
    const levelDatBytes = await levelDatEntry.async('uint8array');
    levelDatParsed = await parseLevelDat(levelDatBytes);
    if (levelDatParsed) worldName = levelDatParsed.oldName;
  }

  // 世界名纯文本副本（levelname.txt 与 level.dat 的 LevelName 一致，下载时随译名重写）
  let levelNameTxt = null;
  const levelNameTxtEntry = isWorld ? zip.file('levelname.txt') : null;
  if (levelNameTxtEntry) {
    try { levelNameTxt = (await levelNameTxtEntry.async('text')).trim(); } catch {}
  }
  
  // 提取 texts/ 文件夹下的语言文件
  const langFiles = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !path.includes('/texts/') || !/\.(lang|txt)$/i.test(path)) continue;
    const fileName = path.split('/').pop();
    const text = await entry.async('text');
    const entries = parseLangText(text);
    const language = inferLanguage(fileName);
    langFiles.push({ name: fileName, path, language, entries });
  }
  
  // 提取 manifest.json
  let manifest = null;
  const manifestEntry = zip.file('manifest.json');
  if (manifestEntry) {
    try {
      const text = await manifestEntry.async('text');
      const obj = JSON.parse(text);
      if (obj.header?.name || obj.header?.description) {
        manifest = { name: obj.header.name || '', description: obj.header.description || '' };
      }
    } catch {}
  }
  
  // 提取 NPC 对话
  const dialogue = await parseDialogues(zip);
  
  // 提取脚本字面量
  const scripts = [];
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.(js|ts)$/i.test(path)) continue;
    try {
      const code = await entry.async('text');
      const literals = extractScriptLiterals(code);
      if (literals.length) scripts.push({ path, literals });
    } catch {}
  }
  
  return {
    kind: 'archive',
    name,
    extension: archiveExtOf(name),
    isWorld,
    worldName,
    levelDatParsed,
    levelNameTxt,
    langFiles,
    manifest,
    dialogue,
    scripts,
    zip
  };
}

// 标记未保存修改
function markUnsaved() {
  state.hasUnsavedChanges = true;
}

// 渲染当前文件到 workspace
function renderWorkspace() {
  const workspace = $('workspace');
  const fileCount = $('file-count');
  
  if (!state.item) {
    workspace.innerHTML = '';
    fileCount.textContent = '尚未选择文件';
    return;
  }
  
  const item = state.item;
  fileCount.textContent = item.name;
  
  if (item.kind === 'lang') {
    workspace.innerHTML = `
      <mdui-card class="lang-card">
        <div class="card-title">
          <h2>${escapeHtml(fileLabel(item.name, item.language))}</h2>
          <div class="card-actions">
            <mdui-dropdown>
              <mdui-button slot="trigger" variant="text">翻译</mdui-button>
              <mdui-menu>${languageMenuItems()}</mdui-menu>
            </mdui-dropdown>
            <mdui-button variant="outlined" data-action="download">下载原文</mdui-button>
          </div>
        </div>
        <div class="pairs-container">
          ${item.entries.filter(e => e.type === 'pair').map((e, i) => `
            <div class="pair-row">
              <code class="pair-key">${escapeHtml(e.key)}</code>
              <input type="text" class="pair-value" data-index="${i}" value="${escapeHtml(e.value)}">
            </div>
          `).join('')}
        </div>
      </mdui-card>
      ${item.translations.length ? `
        <mdui-card class="results-card">
          <div class="card-title">
            <h2>翻译结果 (${item.translations.length})</h2>
            ${item.translations.length >= 2 ? `
              <div class="bundle-row">
                <mdui-text-field id="bundle-name" variant="outlined" label="打包文件名" value="${escapeHtml(bundleDefaultName(item.name))}"></mdui-text-field>
                <mdui-button id="bundle-download" variant="filled">打包下载 (.zip)</mdui-button>
              </div>
            ` : ''}
          </div>
          <div class="results-list">
            ${item.translations.map((t, i) => `
              <details class="result-block">
                <summary>
                  <span class="result-lang">${escapeHtml(fileLabel(item.name, t.lang))}</span>
                  <span class="result-actions">
                    <mdui-button variant="text" data-result-download="${i}">下载</mdui-button>
                    <mdui-button variant="text" data-result-delete="${i}">删除</mdui-button>
                  </span>
                </summary>
                <div class="pairs-container">
                  ${t.entries.filter(e => e.type === 'pair').map((e, j) => `
                    <div class="pair-row">
                      <code class="pair-key">${escapeHtml(e.key)}</code>
                      <input type="text" class="pair-value" data-result="${i}" data-index="${j}" value="${escapeHtml(e.value)}">
                    </div>
                  `).join('')}
                </div>
              </details>
            `).join('')}
          </div>
        </mdui-card>
      ` : ''}
    `;
  } else {
    const parts = [];
    
    if (item.isWorld && item.worldName) {
      parts.push(`
        <div class="scope-row">
          <span>世界名称：${escapeHtml(item.worldName)}</span>
        </div>
      `);
    }
    
    if (item.manifest) {
      parts.push(`
        <div class="scope-row">
          <span>资源包名称：${escapeHtml(item.manifest.name)}</span>
        </div>
        <div class="scope-row">
          <span>资源包描述：${escapeHtml(item.manifest.description)}</span>
        </div>
      `);
    }
    
    if (item.langFiles.length) {
      parts.push(`<div class="scope-row"><strong>语言文件 (${item.langFiles.length})</strong></div>`);
      item.langFiles.forEach((lf, i) => {
        const pairCount = lf.entries.filter(e => e.type === 'pair').length;
        parts.push(`<div class="scope-row">• ${escapeHtml(lf.name)}（${pairCount} 条）</div>`);
      });
    }
    
    if (item.dialogue.length) {
      parts.push(`<div class="scope-row"><strong>NPC 对话 (${item.dialogue.length} 条)</strong></div>`);
    }
    
    if (item.scripts.length) {
      const totalLiterals = item.scripts.reduce((sum, s) => sum + s.literals.length, 0);
      parts.push(`<div class="scope-row"><strong>脚本字符串 (${totalLiterals} 条)</strong></div>`);
    }
    
    workspace.innerHTML = `
      <mdui-card class="archive-card">
        <div class="card-title">
          <h2>${escapeHtml(item.name)}</h2>
          <div class="card-actions">
            <mdui-dropdown>
              <mdui-button slot="trigger" variant="text">翻译</mdui-button>
              <mdui-menu>${languageMenuItems()}</mdui-menu>
            </mdui-dropdown>
            <mdui-button variant="outlined" data-action="download">下载</mdui-button>
          </div>
        </div>
        <div class="archive-summary">${parts.join('')}</div>
      </mdui-card>
    `;
  }
  
  // 绑定事件
  workspace.querySelectorAll('.pair-value').forEach(input => {
    input.addEventListener('input', () => {
      const index = parseInt(input.dataset.index);
      if (input.dataset.result !== undefined) {
        // 翻译结果编辑
        const t = item.translations[parseInt(input.dataset.result)];
        const pairEntries = t.entries.filter(e => e.type === 'pair');
        pairEntries[index].value = input.value;
      } else {
        const pairEntries = item.entries.filter(e => e.type === 'pair');
        pairEntries[index].value = input.value;
      }
      markUnsaved();
    });
  });

  // 翻译结果：单文件下载
  workspace.querySelectorAll('[data-result-download]').forEach(btn => {
    btn.addEventListener('click', () => downloadResult(parseInt(btn.dataset.resultDownload)));
  });

  // 翻译结果：删除
  workspace.querySelectorAll('[data-result-delete]').forEach(btn => {
    btn.addEventListener('click', () => {
      item.translations.splice(parseInt(btn.dataset.resultDelete), 1);
      markUnsaved();
      renderWorkspace();
    });
  });

  // 多语言结果：打包下载
  workspace.querySelector('#bundle-download')?.addEventListener('click', () => {
    downloadBundle();
  });

  workspace.querySelectorAll('mdui-menu').forEach(menu => {
    menu.addEventListener('change', (e) => {
      const targetLang = e.target.value;
      if (targetLang) translateItem(targetLang);
    });
  });
  
  workspace.querySelector('[data-action="download"]')?.addEventListener('click', () => {
    downloadItem();
  });
}

// Part 4: 翻译逻辑 ==========================================

// 术语匹配器缓存
const glossaryMatchersCache = new Map();

function getGlossaryMatchers(target) {
  if (glossaryMatchersCache.has(target)) return glossaryMatchersCache.get(target);
  
  const matchers = [];
  const glossaryToUse = state.scope.officialGlossary 
    ? [...state.glossary, ...(window.OFFICIAL_GLOSSARY || [])] 
    : state.glossary;
  
  for (const item of glossaryToUse) {
    const en = Array.isArray(item) ? item[0] : item.en || item.source;
    const zh = Array.isArray(item) ? item[1] : item.zh || item.target;
    if (!en || !zh) continue;
    const pattern = en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    matchers.push({ regex: new RegExp(`\\b${pattern}\\b`, 'gi'), replacement: zh });
  }
  
  glossaryMatchersCache.set(target, matchers);
  return matchers;
}

async function translateItem(targetLang) {
  if (!state.item) return;
  
  const item = state.item;
  const matchers = getGlossaryMatchers(targetLang);
  
  // 翻译函数
  const translate = async (text) => {
    if (!text.trim()) return text;
    
    // 先用术语表替换
    let result = text;
    for (const { regex, replacement } of matchers) {
      result = result.replace(regex, replacement);
    }
    
    // 调用翻译服务
    if (state.service !== 'none') {
      try {
        const resp = await fetch('/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            text: result, 
            to: targetLang, 
            service: state.service,
            stripCodes: state.options.stripCodes 
          })
        });
        if (resp.ok) {
          const data = await resp.json();
          result = data.translated || result;
        }
      } catch (e) {
        console.error('Translation error:', e);
      }
    }
    
    return result;
  };
  
  if (item.kind === 'lang') {
    // 翻译 .lang 文件：原文保留，每种目标语言生成一份独立翻译结果
    if (!state.scope.lang) return;

    const resultEntries = [];
    for (const entry of item.entries) {
      if (entry.type === 'pair') {
        resultEntries.push({ type: 'pair', key: entry.key, value: await translate(entry.value) });
      } else {
        resultEntries.push({ ...entry });
      }
    }

    // 同语言重复翻译时替换旧结果
    const existing = item.translations.findIndex(t => t.lang === targetLang);
    if (existing >= 0) item.translations[existing] = { lang: targetLang, entries: resultEntries };
    else item.translations.push({ lang: targetLang, entries: resultEntries });

    markUnsaved();
    renderWorkspace();
  } else {
    // 翻译压缩包内容
    
    // 世界名称（杂项：level.dat 的 LevelName 与 levelname.txt 共用同一译名）
    if (state.scope.misc && item.isWorld && item.levelDatParsed) {
      item.levelDatParsed.newName = await translate(item.levelDatParsed.oldName);
    }
    
    // manifest.json
    if (state.scope.manifest && item.manifest) {
      if (item.manifest.name) {
        item.manifest.name = await translate(item.manifest.name);
      }
      if (item.manifest.description) {
        item.manifest.description = await translate(item.manifest.description);
      }
    }
    
    // 语言文件
    if (state.scope.lang) {
      for (const lf of item.langFiles) {
        for (const entry of lf.entries) {
          if (entry.type === 'pair') {
            entry.value = await translate(entry.value);
          }
        }
      }
    }
    
    // NPC 对话
    if (state.scope.npc) {
      for (const dlg of item.dialogue) {
        dlg.text = await translate(dlg.text);
        dlg.buttonText = await translate(dlg.buttonText);
      }
    }
    
    // 脚本字面量
    if (state.scope.scripts) {
      for (const script of item.scripts) {
        for (const literal of script.literals) {
          literal.translated = await translate(literal.value);
        }
      }
    }
    
    markUnsaved();
    renderWorkspace();
  }
}

// Part 5: 下载逻辑 ==========================================

// 翻译结果文件名：源文件名为语言码格式（en_US.lang）时直接替换语言码，否则在原名后追加
const langResultName = (sourceName, lang) => {
  const ext = /\.txt$/i.test(sourceName) ? 'txt' : 'lang';
  if (/^[a-z]{2,3}(?:[_-][a-z0-9]{2,4})?\.(?:lang|txt)$/i.test(sourceName)) return `${lang}.${ext}`;
  const dot = sourceName.lastIndexOf('.');
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  return `${base}_${lang}.${ext}`;
};

// 打包下载默认文件名：原名_translations
const bundleDefaultName = (sourceName) => {
  const dot = sourceName.lastIndexOf('.');
  const base = dot > 0 ? sourceName.slice(0, dot) : sourceName;
  return `${base}_translations`;
};

// 下载单个语言翻译结果（.lang 文件）
function downloadResult(i) {
  const item = state.item;
  const t = item.translations[i];
  if (!t) return;
  const blob = new Blob([exportLangText(t.entries)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = langResultName(item.name, t.lang);
  a.click();
  URL.revokeObjectURL(url);
}

// 多语言结果打包下载（.zip，文件名固定加 .zip 后缀）
async function downloadBundle() {
  const item = state.item;
  if (!item?.translations.length) return;
  const zip = new JSZip();
  for (const t of item.translations) {
    zip.file(langResultName(item.name, t.lang), exportLangText(t.entries));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const raw = document.getElementById('bundle-name')?.value?.trim() || bundleDefaultName(item.name);
  const name = `${stripExt(raw) || bundleDefaultName(item.name)}.zip`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function downloadItem() {
  if (!state.item) return;
  
  const item = state.item;
  
  if (item.kind === 'lang') {
    // 直接下载 .lang 文件
    const text = exportLangText(item.entries);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
    state.hasUnsavedChanges = false;
  } else {
    // 重建压缩包
    const zip = item.zip;
    
    // 更新世界名称
    if (item.isWorld && item.levelDatParsed?.newName) {
      const newBytes = await buildLevelDat(item.levelDatParsed, item.levelDatParsed.newName);
      zip.file('level.dat', newBytes);
      // levelname.txt 与 level.dat 保持一致（存在才重写）
      if (item.levelNameTxt !== null) zip.file('levelname.txt', item.levelDatParsed.newName + '\n');
    }
    
    // 更新 manifest.json
    if (item.manifest) {
      const manifestEntry = zip.file('manifest.json');
      if (manifestEntry) {
        const text = await manifestEntry.async('text');
        const obj = JSON.parse(text);
        if (item.manifest.name) obj.header.name = item.manifest.name;
        if (item.manifest.description) obj.header.description = item.manifest.description;
        zip.file('manifest.json', JSON.stringify(obj, null, 2));
      }
    }
    
    // 更新语言文件
    for (const lf of item.langFiles) {
      const text = lf.entries.map(e => {
        if (e.type === 'pair') return `${e.key}=${e.value}`;
        return e.content;
      }).join('\n');
      zip.file(lf.path, text);
    }
    
    // 更新 NPC 对话
    for (const dlg of item.dialogue) {
      const entry = zip.file(dlg.path);
      if (entry) {
        const text = await entry.async('text');
        const obj = JSON.parse(text);
        const scene = obj['minecraft:npc_dialogue']?.scenes?.[dlg.sceneIndex];
        if (scene) {
          scene.npc_name = dlg.text;
          const btn = scene.buttons?.[dlg.buttonIndex];
          if (btn) btn.name = dlg.buttonText;
        }
        zip.file(dlg.path, JSON.stringify(obj, null, 2));
      }
    }
    
    // 更新脚本
    for (const script of item.scripts) {
      const entry = zip.file(script.path);
      if (entry) {
        let code = await entry.async('text');
        const sortedLiterals = [...script.literals].sort((a, b) => b.start - a.start);
        for (const lit of sortedLiterals) {
          if (lit.translated) {
            const quote = code[lit.start];
            const newLiteral = quote + lit.translated + quote;
            code = code.slice(0, lit.start) + newLiteral + code.slice(lit.end);
          }
        }
        zip.file(script.path, code);
      }
    }
    
    // 生成并下载
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.name;
    a.click();
    URL.revokeObjectURL(url);
    state.hasUnsavedChanges = false;
  }
}

// Part 6: 上传处理 ==========================================

// 文件上传事件
$('file-input').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;
  
  const file = files[0];
  
  // 如果已有文件，显示覆盖确认弹窗
  if (state.item) {
    const dialog = $('overwrite-dialog');
    const overwriteText = $('overwrite-text');
    overwriteText.textContent = `当前已有文件"${state.item.name}"，是否覆盖？${state.hasUnsavedChanges ? '未保存的修改将会丢失。' : ''}`;
    
    dialog.open = true;
    
    // 等待用户选择
    const result = await new Promise(resolve => {
      const confirm = () => {
        dialog.open = false;
        resolve(true);
      };
      const cancel = () => {
        dialog.open = false;
        resolve(false);
      };
      
      $('overwrite-confirm').addEventListener('click', confirm, { once: true });
      $('overwrite-cancel').addEventListener('click', cancel, { once: true });
      dialog.addEventListener('close', () => resolve(false), { once: true });
    });
    
    if (!result) {
      e.target.value = '';
      return;
    }
  }
  
  // 加载新文件
  try {
    state.item = await loadFile(file);
    state.hasUnsavedChanges = false;
    renderWorkspace();
  } catch (err) {
    console.error('Load error:', err);
    alert('文件加载失败：' + err.message);
  }
  
  e.target.value = '';
});

// 上传按钮点击
$('file-pick').addEventListener('click', () => {
  $('file-input').click();
});

// Part 7: 未保存提示 ==========================================

window.addEventListener('beforeunload', (e) => {
  if (state.hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '';
  }
});

// Part 8: 设置页事件绑定 ==========================================

// 翻译服务选择（mdui-radio-group 的 change 事件）
$('service-choice').addEventListener('change', (e) => {
  state.service = e.target.value;
  saveService();
  applyService();
});

// 翻译范围开关（统一 data-scope 绑定并初始化；disabled 开关不可交互，无需处理）
document.querySelectorAll('[data-scope]').forEach(sw => {
  sw.checked = state.scope[sw.dataset.scope];
  sw.addEventListener('change', () => {
    state.scope[sw.dataset.scope] = sw.checked;
    saveScope();
    if (sw.dataset.scope === 'officialGlossary') glossaryMatchersCache.clear();
  });
});

// 术语表编辑：原文 → 译文 行编辑器，实时保存到 localStorage
const glossaryList = $('glossary-list');
const saveGlossary = () => { try { localStorage.setItem('mc-lang-glossary', JSON.stringify(state.glossary)); } catch {} };
const renderGlossary = () => {
  glossaryList.innerHTML = state.glossary.map((g, i) => `
    <div class="glossary-row">
      <mdui-text-field variant="outlined" data-g="${i}" data-f="source" value="${escapeHtml(g.source)}" placeholder="原文"></mdui-text-field>
      <span class="material-icons glossary-arrow" aria-hidden="true">arrow_forward</span>
      <mdui-text-field variant="outlined" data-g="${i}" data-f="target" value="${escapeHtml(g.target)}" placeholder="译文"></mdui-text-field>
      <mdui-button variant="text" icon data-glossary-del="${i}"><span class="material-icons" aria-hidden="true">delete</span></mdui-button>
    </div>
  `).join('');
  glossaryList.querySelectorAll('mdui-text-field').forEach(input => {
    input.addEventListener('change', () => {
      state.glossary[+input.dataset.g][input.dataset.f] = input.value;
      saveGlossary();
      glossaryMatchersCache.clear();
    });
  });
  glossaryList.querySelectorAll('[data-glossary-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      state.glossary.splice(+btn.dataset.glossaryDel, 1);
      saveGlossary();
      renderGlossary();
      glossaryMatchersCache.clear();
    });
  });
};
$('glossary-add').addEventListener('click', () => {
  state.glossary.push({ source: '', target: '' });
  renderGlossary();
});

// Tab 切换由 mdui-tabs 自动同步 panel 的 active 属性，无需手动绑定

// Part 9: 初始化 ==========================================

// 主题切换
$('theme-toggle').addEventListener('click', () => {
  document.documentElement.classList.toggle('mdui-theme-dark');
});

// 初始化设置页状态（scope 开关已在 data-scope 绑定循环中初始化）
$('service-choice').value = state.service;
renderGlossary();

// 初始化渲染
renderWorkspace();
