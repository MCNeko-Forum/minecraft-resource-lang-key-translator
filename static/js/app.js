const state = {
  mode: 'archive',
  options: { stripCodes: true },
  archive: { file: null, groups: [], pendingDelete: null, exportName: '', exportExt: 'zip' },
  single: { file: null, entries: [], lines: [], sourceLanguage: '', targetLanguage: 'zh_CN', results: [], pendingDelete: null, exportName: '' },
  // 批量模式独立状态：packs 每项 { file, ext, groups }，files 每项 { file, entries, lines, issues, sourceLanguage, targetLanguages, results }
  archiveBatch: { packs: [], groups: [], exportName: '批量导出', pendingDelete: null },
  singleBatch: { files: [], exportName: '批量翻译', translateTarget: '', pendingDelete: null }
};

const $ = (id) => document.getElementById(id);
const snackbar = (message) => { $('snackbar').textContent = message; $('snackbar').open = true; };
// 去掉误输的下载后缀，导出时统一由后缀选择器决定
const stripExt = (value) => String(value).trim().replace(/\.(mcpack|mcaddon|zip)$/i, '');
// 批量模式与单文件模式共用渲染/翻译函数：按当前模式取对应状态和容器
const isBatchMode = () => state.mode.endsWith('-batch');
const archiveState = () => isBatchMode() ? state.archiveBatch : state.archive;
const singleState = () => isBatchMode() ? state.singleBatch : state.single;
const archiveRoot = () => $(isBatchMode() ? 'archive-batch-workspace' : 'archive-workspace');

const applyMode = (mode) => {
  state.mode = mode;
  document.querySelectorAll('.mode-panel').forEach((panel) => { panel.hidden = panel.dataset.mode !== mode; });
};

$('mode-tabs').addEventListener('change', (event) => {
  applyMode(event.target.value);
  // 写入 URL hash：刷新后保持在当前标签页，也可分享定位链接
  history.replaceState(null, '', `#${event.target.value}`);
});

// 初始化：优先恢复 URL hash 中的标签页（校验合法值，防注入任意 hash）
(() => {
  const hash = location.hash.slice(1);
  const valid = [...document.querySelectorAll('mdui-tab')].some((tab) => tab.value === hash);
  const mode = valid ? hash : 'archive';
  $('mode-tabs').value = mode;
  applyMode(mode);
})();

$('theme-toggle').addEventListener('click', () => document.documentElement.classList.toggle('mdui-theme-dark'));
$('archive-pick').addEventListener('click', () => $('archive-input').click());
$('single-pick').addEventListener('click', () => $('single-input').click());
$('archive-batch-pick').addEventListener('click', () => $('archive-batch-input').click());
$('single-batch-pick').addEventListener('click', () => $('single-batch-input').click());
// 清空 input value：重复选择同一个文件也能再次触发 change，进入覆盖确认
$('archive-input').addEventListener('change', (event) => { const file = event.target.files[0]; event.target.value = ''; loadArchive(file); });
$('single-input').addEventListener('change', (event) => { const file = event.target.files[0]; event.target.value = ''; loadSingleFile(file); });
$('archive-batch-input').addEventListener('change', (event) => { const files = [...event.target.files]; event.target.value = ''; loadArchiveBatch(files); });
$('single-batch-input').addEventListener('change', (event) => { const files = [...event.target.files]; event.target.value = ''; loadSingleFiles(files); });
$('cancel-delete').addEventListener('click', () => $('confirm-dialog').open = false);
$('confirm-delete').addEventListener('click', confirmDelete);

// 再次上传时的覆盖确认：取消或点击遮罩关闭都不做任何事，只有点确认才加载新文件
let pendingOverwrite = null;
function requestOverwrite(mode, file) {
  // 批量模式没有单一"当前文件"，显示已导入数量
  const current = mode === 'archive' ? state.archive.file : mode === 'single' ? state.single.file : null;
  const currentText = current ? `"${current.name}"` : `${mode === 'archive-batch' ? state.archiveBatch.packs.length : state.singleBatch.files.length} 个文件`;
  const incoming = Array.isArray(file) ? `${file.length} 个文件` : `"${file.name}"`;
  pendingOverwrite = { mode, file };
  $('overwrite-text').textContent = `当前已导入 ${currentText}，选择 ${incoming} 将覆盖当前内容，未导出的翻译结果会丢失。`;
  $('overwrite-dialog').open = true;
}
$('overwrite-cancel').addEventListener('click', () => { pendingOverwrite = null; $('overwrite-dialog').open = false; });
$('overwrite-dialog').addEventListener('close', () => { pendingOverwrite = null; });
// 覆盖确认后按来源模式分发加载
// 覆盖确认后按来源模式分发加载（批量模式直接追加，不经过覆盖确认）
const OVERWRITE_LOADERS = { archive: doLoadArchive, single: doLoadSingleFile };
$('overwrite-confirm').addEventListener('click', () => {
  const pending = pendingOverwrite;
  $('overwrite-dialog').open = false;
  if (pending) OVERWRITE_LOADERS[pending.mode]?.(pending.file);
});

// 一键翻译的覆盖确认：勾选的包覆盖，未勾的跳过；取消/点外面关闭 = 所有冲突包跳过（无冲突包仍正常翻译）
let pendingBatchTranslate = null;
$('batch-translate-confirm').addEventListener('click', () => {
  const pending = pendingBatchTranslate;
  pendingBatchTranslate = null;
  const override = new Set([...$('batch-translate-list').querySelectorAll('mdui-checkbox')].filter((box) => box.checked).map((box) => Number(box.dataset.batchPack)));
  $('batch-translate-dialog').open = false;
  if (pending) runBatchTranslate(pending.target, pending.sources, override);
});
$('batch-translate-cancel').addEventListener('click', () => { $('batch-translate-dialog').open = false; });
$('batch-translate-dialog').addEventListener('close', () => {
  const pending = pendingBatchTranslate;
  pendingBatchTranslate = null;
  if (pending) runBatchTranslate(pending.target, pending.sources, new Set());
});

async function loadArchive(file) {
  if (!file) return;
  if (state.archive.file) { requestOverwrite('archive', file); return; }
  await doLoadArchive(file);
}

// 解析资源包内的所有 texts 分组，单包与批量模式共用
async function parseArchiveGroups(file) {
  const zip = await JSZip.loadAsync(file);
  const groupMap = new Map();
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const parts = path.split('/');
    const index = parts.findIndex((part) => part.toLowerCase() === 'texts');
    if (index < 0 || index === parts.length - 1) continue;
    const groupPath = parts.slice(0, index + 1).join('/');
    const fileName = parts.at(-1);
    const extension = fileName.split('.').pop().toLowerCase();
    if (!['lang', 'txt', 'json'].includes(extension)) continue;
    const group = groupMap.get(groupPath) || { path: groupPath, files: [], zipEntries: {} };
    // lang/txt 预读文本供预览/修改（json 不展示不预读）
    group.files.push({ path, fileName, extension, language: inferLanguage(fileName), deleted: false, text: extension === 'json' ? '' : await entry.async('string') });
    group.zipEntries[path] = entry;
    groupMap.set(groupPath, group);
  }
  return [...groupMap.values()].filter((group) => group.files.some((item) => ['lang', 'txt'].includes(item.extension)));
}

async function doLoadArchive(file) {
  // 下载文件名与后缀自动填入：后缀按上传文件识别，其它后缀回退 zip；.mcpack.zip/.mcaddon.zip 双后缀识别为 mcpack/mcaddon（即去除结尾 .zip）
  const lower = file.name.toLowerCase();
  const ext = /\.(mcpack|mcaddon)\.zip$/.test(lower) ? lower.slice(0, -4).split('.').pop() : lower.split('.').pop();
  state.archive = { file, groups: [], pendingDelete: null, exportName: stripExt(file.name), exportExt: ['mcpack', 'mcaddon', 'zip'].includes(ext) ? ext : 'zip' };
  $('archive-name').textContent = file.name;
  try {
    state.archive.groups = await parseArchiveGroups(file);
    renderArchive();
    if (!state.archive.groups.length) snackbar('没有找到包含语言键值文件的 texts 文件夹');
  } catch (error) { snackbar(`资源包读取失败：${error.message}`); }
}

async function loadArchiveBatch(files) {
  if (!files?.length) return;
  await doLoadArchiveBatch(files);
}

// 批量整包：逐个解析，无语言文件的包不进入列表；groups 为所有包分组的扁平列表（groupIndex 跨包连续编号，复用单包的渲染与翻译）
async function doLoadArchiveBatch(files) {
  const packs = state.archiveBatch.packs;
  let skipped = 0;
  for (const file of files) {
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      const groups = await parseArchiveGroups(file);
      if (!groups.length) { skipped += 1; continue; }
      packs.push({ file, ext: ['mcpack', 'mcaddon', 'zip'].includes(ext) ? ext : 'zip', groups });
    }
    catch (error) { snackbar(`资源包 "${file.name}" 读取失败：${error.message}`); }
  }
  state.archiveBatch = { packs, groups: packs.flatMap((pack) => pack.groups), exportName: state.archiveBatch.exportName || '批量导出', translateTarget: state.archiveBatch.translateTarget || '', pendingDelete: null };
  $('archive-batch-name').textContent = `已选择 ${packs.length} 个资源包`;
  renderArchive();
  if (skipped) snackbar(`${skipped} 个包没有语言文件，已忽略`);
}

function inferLanguage(fileName) {
  const match = fileName.match(/^([A-Za-z]{2,3}_[A-Za-z]{2,4})\.(?:lang|txt)$/i);
  return match ? match[1] : '';
}

function parseText(text) {
  const entries = [];
  const lines = [];
  const seen = new Set();
  const issues = [];
  text.replace(/^\uFEFF/, '').split(/\r?\n/).forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) { lines.push({ type: 'raw', text: line }); return; }
    const separator = line.indexOf('=');
    if (separator < 1) { issues.push(`第 ${index + 1} 行缺少有效键值分隔符`); lines.push({ type: 'raw', text: line }); return; }
    const key = line.slice(0, separator);
    const value = line.slice(separator + 1);
    if (seen.has(key)) issues.push(`重复键：${key}`);
    seen.add(key);
    const entry = { key, value, line: index + 1 };
    entries.push(entry);
    lines.push({ type: 'entry', key, entry });
  });
  return { entries, lines, issues };
}

// 单个 texts 分组的卡片：批量模式下 groupIndex 为跨包连续编号，事件绑定依赖该索引
function groupCard(group, groupIndex) {
  return `
    <mdui-card class="group-card">
      <div class="group-header"><div><h2>语言文件夹：${escapeHtml(group.path)}</h2><p>该分组独立处理，不与其他 texts 文件夹合并</p></div><mdui-chip>${group.files.filter((item) => !item.deleted && item.extension !== 'json').length} 个语言文件</mdui-chip></div>
      <details class="review-box"><summary><span class="material-icons expand-icon" aria-hidden="true">expand_more</span><strong>语言文件</strong><span class="muted">${group.files.filter((item) => !item.deleted && item.extension !== 'json').length} 个文件，点击展开</span></summary><div class="file-list">${group.files.map((item, fileIndex) => item.extension === 'json' ? '' : `
        <div class="file-row ${item.deleted ? 'danger' : ''}">
          <div class="file-meta"><strong>${escapeHtml(fileLabel(item.fileName, item.language))}</strong><span class="muted">语言：${escapeHtml(item.language || '待选择')} · 路径：${escapeHtml(item.path)}</span></div>
          <div class="file-actions">${item.deleted ? '<mdui-chip>待删除</mdui-chip>' : `<mdui-button-icon aria-label="删除 ${escapeHtml(item.fileName)}" data-delete="${groupIndex}:${fileIndex}"><span class="material-icons" aria-hidden="true">delete</span></mdui-button-icon>`}</div>
          ${item.deleted ? '' : `<details class="review-box"><summary><span class="material-icons expand-icon" aria-hidden="true">expand_more</span><strong>源文件</strong><span class="muted">点击展开预览或修改</span></summary><div class="review-editor"><mdui-text-field variant="outlined" label="源文件内容（可修改）" rows="12" value="${escapeHtml(item.edited ?? item.text)}" data-archive-source-edit="${groupIndex}:${fileIndex}"></mdui-text-field></div></details>`}
        </div>`).join('')}</div></details>
      <div class="config-grid"><mdui-select label="源语言文件" data-source-group="${groupIndex}">${group.files.filter((item) => !item.deleted && item.extension !== 'json').map((item) => `<mdui-menu-item value="${escapeHtml(item.path)}">${escapeHtml(item.fileName)}${item.language ? ` · ${BEDROCK_LANGUAGES[normalizeLanguage(item.language)] ?? item.language}` : ''}</mdui-menu-item>`).join('')}</mdui-select><mdui-select label="目标语言（可多选）" multiple data-target-group="${groupIndex}">${targetOptions(group)}</mdui-select></div>
      <div class="advanced-options"><mdui-checkbox data-strip-codes ${state.options.stripCodes ? 'checked' : ''}>高级选项：翻译时删除格式代码（§ 及其后跟随的数字/字母）</mdui-checkbox></div>
      <div class="toolbar"><span class="muted">可同时生成多个不存在的目标语言文件</span><mdui-button variant="tonal" data-translate-group="${groupIndex}"><span class="material-icons" aria-hidden="true">translate</span>开始翻译</mdui-button></div>
      ${generatedList(group, groupIndex)}
    </mdui-card>`;
}

function renderArchive() {
  const root = archiveRoot();
  const as = archiveState();
  if (!as.groups.length) { root.innerHTML = '<div class="empty">请选择资源包后查看识别结果</div>'; return; }
  // 批量模式按包分节，每包一个标题；groupIndex 跨包连续编号，事件绑定与单包模式完全一致
  let offset = 0;
  const cards = as.packs
    ? as.packs.map((pack, packIndex) => {
        const section = `<div class="pack-section"><div class="pack-title"><span>${escapeHtml(pack.file.name)} · ${pack.groups.length} 个语言文件夹</span><mdui-button-icon aria-label="删除整包 ${escapeHtml(pack.file.name)}" data-delete-pack="${packIndex}"><span class="material-icons" aria-hidden="true">delete</span></mdui-button-icon></div>${pack.groups.map((group, index) => groupCard(group, offset + index)).join('')}</div>`;
        offset += pack.groups.length;
        return section;
      }).join('')
    : as.groups.map((group, groupIndex) => groupCard(group, groupIndex)).join('');
  // 批量：只填外层 zip 文件名，各包保留原后缀；单包：文件名 + 后缀选择
  const exportCard = as.packs
    ? `<mdui-card class="export-card"><div class="config-grid export-grid"><mdui-text-field label="打包文件名" value="${escapeHtml(as.exportName)}" id="archive-filename"></mdui-text-field></div><div class="toolbar"><span class="muted">每个资源包保留原有后缀，统一打进一个 zip</span><div class="toolbar-actions"><mdui-button variant="tonal" id="download-each-pack"><span class="material-icons" aria-hidden="true">download</span>逐包下载</mdui-button><mdui-button variant="filled" id="export-archive"><span class="material-icons" aria-hidden="true">folder_zip</span>打包下载全部（${as.packs.length} 个资源包）</mdui-button></div></div></mdui-card>`
    : `<mdui-card class="export-card"><div class="config-grid export-grid"><mdui-text-field label="下载文件名" value="${escapeHtml(as.exportName)}" id="archive-filename"></mdui-text-field><mdui-select label="文件后缀" value="${escapeHtml(as.exportExt)}" id="archive-ext"><mdui-menu-item value="mcpack">.mcpack</mdui-menu-item><mdui-menu-item value="mcaddon">.mcaddon</mdui-menu-item><mdui-menu-item value="zip">.zip</mdui-menu-item></mdui-select></div><div class="toolbar"><span class="muted">确认删除和翻译结果将在导出时写入副本</span><mdui-button variant="filled" id="export-archive"><span class="material-icons" aria-hidden="true">download</span>导出资源包</mdui-button></div></mdui-card>`;
  // 批量：顶部一键翻译卡（取每包第 1 个语言文件），底部导出卡；单包：文件名 + 后缀选择
  const translateAllCard = as.packs
    ? `<mdui-card class="export-card"><div class="config-grid"><mdui-select label="一键翻译至" value="${as.translateTarget || 'zh_CN'}" id="batch-target-lang">${languageMenuItems()}</mdui-select></div><div class="toolbar"><span class="muted">取每个包第 1 个语言文件作为源文件，生成所选目标语言</span><mdui-button variant="filled" id="translate-all-packs"><span class="material-icons" aria-hidden="true">translate</span>一键翻译</mdui-button></div></mdui-card>`
    : '';
  root.innerHTML = `${translateAllCard}<div class="group-list">${cards}</div>${exportCard}`;
  root.querySelectorAll('[data-delete]').forEach((button) => button.addEventListener('click', () => requestDelete(button.dataset.delete)));
  root.querySelectorAll('[data-delete-pack]').forEach((button) => button.addEventListener('click', () => requestDeletePack(Number(button.dataset.deletePack))));
  root.querySelectorAll('[data-delete-generated]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); requestDeleteGenerated(button.dataset.deleteGenerated); }));
  root.querySelectorAll('[data-translate-group]').forEach((button) => button.addEventListener('click', () => translateGroup(Number(button.dataset.translateGroup))));
  root.querySelectorAll('[data-strip-codes]').forEach((box) => box.addEventListener('change', (event) => { state.options.stripCodes = event.target.checked; }));
  // 下载文件名/后缀：输入写入 state，重渲染（翻译、删除）后不丢失；限定 root 作用域避免命中另一模式的同名元素
  root.querySelector('#archive-filename')?.addEventListener('input', (event) => { as.exportName = event.target.value; });
  root.querySelector('#archive-ext')?.addEventListener('change', (event) => { as.exportExt = event.target.value; });
  root.querySelector('#export-archive')?.addEventListener('click', exportArchive);
  root.querySelector('#download-each-pack')?.addEventListener('click', downloadEachPack);
  // 一键翻译：目标语言选择写入 state，重渲染后不丢失
  root.querySelector('#batch-target-lang')?.addEventListener('change', (event) => { state.archiveBatch.translateTarget = event.target.value; });
  root.querySelector('#translate-all-packs')?.addEventListener('click', translateAllPacks);
  // 恢复或默认选择各分组的源文件（默认第一个能识别出语言的），并恢复目标语言选择
  as.groups.forEach((group, groupIndex) => {
    const source = root.querySelector(`[data-source-group="${groupIndex}"]`);
    const target = root.querySelector(`[data-target-group="${groupIndex}"]`);
    if (source) source.value = group.selection?.source || pickDefaultSourceFile(group.files)?.path || '';
    if (target && group.selection) target.value = group.selection.targets;
    // 选择变化实时存入 group.selection：其他分组翻译触发重渲染时，本分组已选的源/目标不丢失
    source?.addEventListener('change', () => { group.selection = { source: source.value, targets: getSelected(target) }; });
    target?.addEventListener('change', () => { group.selection = { ...(group.selection || { source: source?.value }), targets: getSelected(target) }; });
  });
}

function getSelected(select) { return Array.isArray(select?.value) ? select.value : (select?.value ? [select.value] : []); }

// 默认源文件：优先第一个能识别出官方语言的（en_US.lang / en_GB.lang 等，含 en_UK 别名映射），都识别不出才回落第一个
function pickDefaultSourceFile(files) {
  const pool = files.filter((item) => !item.deleted && ['lang', 'txt'].includes(item.extension));
  return pool.find((item) => BEDROCK_LANGUAGES[normalizeLanguage(item.language)]) || pool[0];
}

// 每个包的默认源文件：第 1 个 texts 分组的默认语言文件
function packFirstSource(pack) {
  for (const group of pack.groups) {
    const file = pickDefaultSourceFile(group.files);
    if (file) return { group, file };
  }
  return null;
}

// 包是否已有目标语言：未删除的同语言文件或已生成的翻译结果（与 targetOptions 判定一致）
function packHasTarget(pack, target) {
  return pack.groups.some((group) =>
    group.files.some((item) => !item.deleted && item.language === target) ||
    (group.generated || []).some((gen) => gen.target === target));
}

// 一键翻译入口：检测冲突包（已有目标语言），有则弹窗让用户勾选哪些覆盖（默认全不勾）
function translateAllPacks() {
  const root = $('archive-batch-workspace');
  const target = root.querySelector('#batch-target-lang')?.value;
  if (!target) { snackbar('请选择目标语言'); return; }
  const packs = state.archiveBatch.packs;
  const sources = packs.map((pack) => packFirstSource(pack));
  if (!sources.some(Boolean)) { snackbar('没有可翻译的语言文件'); return; }
  const conflictPacks = packs.map((pack, index) => ({ pack, index })).filter(({ pack }) => packHasTarget(pack, target));
  if (conflictPacks.length) {
    pendingBatchTranslate = { target, sources };
    $('batch-translate-list').innerHTML = conflictPacks.map(({ pack, index }) => `<mdui-checkbox data-batch-pack="${index}">${escapeHtml(pack.file.name)}</mdui-checkbox>`).join('');
    $('batch-translate-dialog').open = true;
    return;
  }
  runBatchTranslate(target, sources, new Set());
}

// 执行一键翻译：override 为勾选覆盖的包索引集合，其余冲突包跳过
async function runBatchTranslate(target, sources, override) {
  const packs = state.archiveBatch.packs;
  const button = $('archive-batch-workspace').querySelector('#translate-all-packs');
  if (button) button.disabled = true;
  let done = 0;
  let translated = 0;
  let skipped = 0;
  const setProgress = () => { if (button) button.innerHTML = `<span class="material-icons spinning" aria-hidden="true">autorenew</span>翻译中 ${done}/${packs.length}`; };
  setProgress();
  for (let index = 0; index < packs.length; index += 1) {
    const source = sources[index];
    if (!source || (packHasTarget(packs[index], target) && !override.has(index))) { skipped += 1; done += 1; setProgress(); continue; }
    const parsed = parseText(source.file.edited ?? source.file.text);
    const values = parsed.entries.map((entry) => entry.value);
    const translatedValues = await translateValues(values, source.file.language || 'en_US', target);
    // 覆盖时先移除旧的同目标结果，避免列表出现重复
    source.group.generated = (source.group.generated || []).filter((gen) => gen.target !== target);
    // 已有的同目标语言文件从上方列表移除（导出时同路径被新译文覆盖），只在下方“已翻译文件”出现
    source.group.files = source.group.files.filter((item) => item.language !== target);
    source.group.generated.push({ path: `${source.group.path}/${target}.lang`, target, parsed, translated: translatedValues });
    translated += 1;
    done += 1;
    setProgress();
  }
  renderArchive();
  snackbar(`一键翻译完成：${translated} 个包已生成，${skipped} 个包跳过`);
}

async function translateGroup(groupIndex) {
  const as = archiveState();
  const root = archiveRoot();
  const group = as.groups[groupIndex];
  const sourceSelect = root.querySelector(`[data-source-group="${groupIndex}"]`);
  const targetSelect = root.querySelector(`[data-target-group="${groupIndex}"]`);
  const sourcePath = sourceSelect?.value;
  const targets = getSelected(targetSelect);
  if (!sourcePath || !targets.length) { snackbar('请先选择源语言文件和至少一个目标语言'); return; }
  const source = group.files.find((item) => item.path === sourcePath);
  // 源文件被手动修改过则用修改后内容，否则用上传时预读的原文
  const parsed = parseText(source.edited ?? source.text);
  const values = parsed.entries.map((entry) => entry.value);
  // 翻译完成后清空目标语言选择，避免与“已存在”禁用项冲突
  group.selection = { source: sourcePath, targets: [] };
  group.generated = (group.generated || []).filter((gen) => !targets.includes(gen.target));
  const button = root.querySelector(`[data-translate-group="${groupIndex}"]`);
  const setProgress = (percent) => { if (button) button.innerHTML = `<span class="material-icons spinning" aria-hidden="true">autorenew</span>翻译中 ${percent}%`; };
  if (button) button.disabled = true;
  let done = 0;
  for (const target of targets) {
    const translated = await translateValues(values, source.language || 'en_US', target);
    group.generated.push({ path: `${group.path}/${target}.lang`, target, parsed, translated });
    done += 1;
    setProgress(Math.round((done / targets.length) * 100));
  }
  renderArchive();
  snackbar(`${targets.length} 个目标语言已生成，可在下方列表校对`);
}

// 基岩版官方支持的 29 种语言（来源：Microsoft Learn Add-On Pack Contents）
const BEDROCK_LANGUAGES = {
  en_US: '英语（美国）', en_GB: '英语（英国）', de_DE: '德语（德国）',
  fr_FR: '法语（法国）', fr_CA: '法语（加拿大）', it_IT: '意大利语（意大利）',
  ja_JP: '日语（日本）', ko_KR: '韩语（韩国）', zh_CN: '简体中文（中国大陆）',
  zh_TW: '繁体中文（中国台湾）', ru_RU: '俄语（俄罗斯）', es_ES: '西班牙语（西班牙）',
  es_MX: '西班牙语（墨西哥）', pt_BR: '葡萄牙语（巴西）', pt_PT: '葡萄牙语（葡萄牙）',
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
// 源语言下拉：29 种标准语言 + 当前文件的非标准代码（如 en_UK）追加为可选项；目标语言下拉始终只用标准 29 种
const sourceLanguageMenuItems = (current) => current && !BEDROCK_LANGUAGES[current] ? `${languageMenuItems()}<mdui-menu-item value="${escapeHtml(current)}">${escapeHtml(current)} · ${BEDROCK_LANGUAGES[normalizeLanguage(current)] ?? '未知语言'}</mdui-menu-item>` : languageMenuItems();

// 文件名（语言中文名）：识别不到官方语言时退回纯文件名
const fileLabel = (fileName, language) => { const name = BEDROCK_LANGUAGES[normalizeLanguage(language)]; return fileName + (language && name ? `（${name}）` : ''); };

// 目标语言选项：已有翻译结果的语言不可再选，避免覆盖（单文件与批量模式共用）
function singleTargetOptionsFor(results) {
  const existing = new Set((results || []).map((result) => result.target));
  return Object.entries(BEDROCK_LANGUAGES).map(([code, name]) => `<mdui-menu-item value="${code}" ${existing.has(code) ? 'disabled' : ''}>${code} · ${name}${existing.has(code) ? '（已存在）' : ''}</mdui-menu-item>`).join('');
}

function singleTargetOptions() {
  return singleTargetOptionsFor(state.single.results);
}

function renderLines(parsed, translated) {
  return parsed.lines.map((line) => {
    if (line.type === 'raw') return line.text;
    const index = parsed.entries.indexOf(line.entry);
    return `${line.key}=${translated[index]}`;
  }).join('\n') + '\n';
}

// 接口限流：翻译服务每 2 秒最多 2 次请求，统一节流为每 3 秒 1 次；并发调用按槽位自动排队
let nextRequestSlot = 0;
const waitForRateLimit = () => new Promise((resolve) => {
  const wait = Math.max(0, nextRequestSlot - Date.now());
  nextRequestSlot = Date.now() + wait + 3000;
  setTimeout(resolve, wait);
});

async function translateValues(texts, from, to) {
  const fromName = TRANSLATE_LANGUAGES[normalizeLanguage(from)];
  const toName = TRANSLATE_LANGUAGES[normalizeLanguage(to)];
  if (!fromName || !toName) return texts;
  if (fromName === toName || !window.translate?.request?.translateText) return texts;
  // 高级选项：勾选后删除 § 及其后跟随的数字/字母，输出纯文本译文
  const input = state.options.stripCodes ? texts.map((text) => String(text).replace(/§[0-9a-zA-Z]/g, '').replace(/\s{2,}/g, ' ').trim()) : texts;
  // Minecraft 格式代码（§4、§f、§r 等）先替换为占位符再整句翻译，避免拆碎单词（Japan§4ese 这类词中代码）；译文占位符不完整时该条回退原文
  const prepared = input.map((text) => {
    const codes = [];
    const masked = String(text).replace(/§[0-9a-fk-or]/gi, (code) => { codes.push(code); return `%c${codes.length}%`; });
    return { codes, masked };
  });
  await waitForRateLimit();
  // ponytail: 上游库对重复文本存在索引回填问题，先按值去重再翻译，减小请求体积
  const unique = [...new Set(prepared.map((item) => item.masked))];
  return new Promise((resolve) => window.translate.request.translateText({ from: fromName, to: toName, texts: unique }, (data) => {
    if (data?.result !== 1 || !Array.isArray(data.text)) { snackbar(`翻译接口返回失败：${data?.info || '未知错误'}，未翻译部分将保留原文`); resolve(texts); return; }
    const mapping = new Map(unique.map((text, index) => [text, data.text[index]]));
    resolve(prepared.map((item, index) => {
      const translated = mapping.get(item.masked) ?? texts[index];
      if (!item.codes.length) return translated;
      let found = 0;
      const restored = translated.replace(/%c(\d+)%/g, (token, n) => {
        const code = item.codes[Number(n) - 1];
        if (code) { found += 1; return code; }
        return token;
      });
      return found === item.codes.length ? restored : texts[index];
    }));
  }));
}

// 导出文件名：自定义输入优先（自动剥掉误输后缀），空值回退源文件名；后缀由选择器决定
function archiveExportName() {
  return `${stripExt(state.archive.exportName) || stripExt(state.archive.file.name)}.${state.archive.exportExt || 'zip'}`;
}

// 把删除标记与翻译结果写入包副本并同步语言清单，单包与批量模式共用
async function applyPackChanges(zip, groups) {
  for (const group of groups) {
    // 删除标记移除；源文件被手动修改过则写入修改后内容
    for (const item of group.files) {
      if (item.deleted) zip.remove(item.path);
      else if (item.edited != null) zip.file(item.path, item.edited);
    }
    for (const generated of group.generated || []) zip.file(generated.path, generated.edited ?? renderLines(generated.parsed, generated.translated));
    await syncLanguagesManifest(zip, group);
  }
}

async function exportArchive() {
  const as = archiveState();
  if (!as.groups.length) return;
  if (as.packs) {
    // 批量：每个资源包独立处理后保留原后缀，统一打进外层 zip
    const outer = new JSZip();
    for (const pack of as.packs) {
      const zip = await JSZip.loadAsync(pack.file);
      await applyPackChanges(zip, pack.groups);
      outer.file(`${stripExt(pack.file.name)}.${pack.ext}`, await zip.generateAsync({ type: 'blob' }));
    }
    downloadBlob(await outer.generateAsync({ type: 'blob' }), `${stripExt(as.exportName) || '批量导出'}.zip`);
    snackbar('已打包下载全部资源包');
    return;
  }
  const zip = await JSZip.loadAsync(as.file);
  await applyPackChanges(zip, as.groups);
  downloadBlob(await zip.generateAsync({ type: 'blob' }), archiveExportName());
}

// 逐包下载：每个资源包独立导出一个下载任务（文件名 = 原包名 + 原后缀）
async function downloadEachPack() {
  const packs = state.archiveBatch.packs;
  if (!packs.length) return;
  const button = $('archive-batch-workspace').querySelector('#download-each-pack');
  if (button) button.disabled = true;
  for (const pack of packs) {
    const zip = await JSZip.loadAsync(pack.file);
    await applyPackChanges(zip, pack.groups);
    downloadBlob(await zip.generateAsync({ type: 'blob' }), `${stripExt(pack.file.name)}.${pack.ext}`);
  }
  if (button) button.disabled = false;
  snackbar(`已触发 ${packs.length} 个下载任务`);
}

// 同步分组内的语言清单：加入新生成的语言、移除已删除且未重新生成的语言；清单不存在时创建标准 languages.json
async function syncLanguagesManifest(zip, group) {
  const manifest = group.files.find((item) => item.extension === 'json' && /^languages?\.json$/i.test(item.fileName));
  const path = manifest?.path ?? `${group.path}/languages.json`;
  let codes = [];
  if (manifest) {
    try { codes = JSON.parse(await group.zipEntries[manifest.path].async('string')); } catch { snackbar(`${path} 不是有效的 JSON，将重建该清单`); }
  }
  if (!Array.isArray(codes)) codes = [];
  for (const generated of group.generated || []) if (!codes.includes(generated.target)) codes.push(generated.target);
  const deleted = new Set(group.files.filter((item) => item.deleted).map((item) => item.language).filter(Boolean));
  const regenerated = new Set((group.generated || []).map((item) => item.target));
  codes = codes.filter((code) => !deleted.has(code) || regenerated.has(code));
  zip.file(path, JSON.stringify(codes, null, 2) + '\n');
}

function downloadBlob(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(link.href);
}

function targetOptions(group) {
  // 已存在（未删除）的语言 + 已生成的翻译结果都不可再选，避免覆盖
  const existing = new Set([
    ...group.files.filter((item) => !item.deleted).map((item) => item.language),
    ...(group.generated || []).map((item) => item.target)
  ].filter(Boolean));
  return Object.entries(BEDROCK_LANGUAGES).map(([code, name]) => `<mdui-menu-item value="${code}" ${existing.has(code) ? 'disabled' : ''}>${code} · ${name}${existing.has(code) ? '（已存在）' : ''}</mdui-menu-item>`).join('');
}

// 翻译成功后的独立列表：每个生成文件一个整体编辑框，默认折叠，带删除按钮
function generatedList(group, groupIndex) {
  if (!group.generated?.length) return '';
  return `<div class="generated-list"><h3>已翻译文件（${group.generated.length}）</h3>${group.generated.map((gen, genIndex) => `
    <details class="review-box">
      <summary><span class="material-icons expand-icon" aria-hidden="true">expand_more</span><strong>${escapeHtml(fileLabel(`${gen.target}.lang`, gen.target))}</strong><span class="muted">${gen.parsed.entries.length} 个键</span><mdui-chip>已翻译</mdui-chip><mdui-button-icon class="delete-generated" aria-label="删除 ${gen.target}.lang" data-delete-generated="${groupIndex}:${genIndex}"><span class="material-icons" aria-hidden="true">delete</span></mdui-button-icon></summary>
      <div class="review-editor"><mdui-text-field variant="outlined" label="校对译文（可编辑）" rows="12" value="${escapeHtml(gen.edited ?? renderLines(gen.parsed, gen.translated))}" data-review-lang="${groupIndex}:${genIndex}"></mdui-text-field></div>
    </details>`).join('')}</div>`;
}

function requestDelete(reference) {
  const as = archiveState();
  const [groupIndex, fileIndex] = reference.split(':').map(Number);
  const item = as.groups[groupIndex].files[fileIndex];
  as.pendingDelete = { groupIndex, fileIndex };
  $('confirm-text').textContent = `即将删除 ${as.groups[groupIndex].path}/${item.fileName}。确认后只会在导出时从新归档中移除，原始文件不会被修改。`;
  $('confirm-dialog').open = true;
}

// 删除翻译结果：复用同一个确认弹窗，删除后该目标语言恢复可选
function requestDeleteGenerated(reference) {
  const as = archiveState();
  const [groupIndex, genIndex] = reference.split(':').map(Number);
  const gen = as.groups[groupIndex].generated[genIndex];
  as.pendingDelete = { generated: true, groupIndex, genIndex };
  $('confirm-text').textContent = `即将删除翻译结果 ${gen.target}.lang。删除后该目标语言恢复可选，清单中对应条目也会同步处理。`;
  $('confirm-dialog').open = true;
}

// 删除单语言文件模式的翻译结果：复用同一个确认弹窗，删除后该目标语言恢复可选
function requestDeleteSingle(index) {
  state.single.pendingDelete = index;
  $('confirm-text').textContent = `即将删除翻译结果 ${state.single.results[index].target}.lang。删除后该目标语言恢复可选。`;
  $('confirm-dialog').open = true;
}

// 删除批量单文件模式的翻译结果：pendingDelete 存 [fileIndex, resultIndex]
function requestDeleteSingleBatch(fileIndex, resultIndex) {
  state.singleBatch.pendingDelete = [fileIndex, resultIndex];
  $('confirm-text').textContent = `即将删除翻译结果 ${state.singleBatch.files[fileIndex].results[resultIndex].target}.lang。删除后该目标语言恢复可选。`;
  $('confirm-dialog').open = true;
}

// 删除整个资源包：复用确认弹窗，确认后连同其全部翻译结果从批量列表移除
function requestDeletePack(packIndex) {
  const pack = state.archiveBatch.packs[packIndex];
  if (!pack) return;
  state.archiveBatch.pendingDelete = { pack: packIndex };
  $('confirm-text').textContent = `确认要删除 ${pack.file.name} 吗？该包已生成的翻译结果将一并移除。`;
  $('confirm-dialog').open = true;
}

function confirmDelete() {
  // 删除整个资源包：从批量列表移除并重建扁平分组索引
  if (state.archiveBatch.pendingDelete?.pack != null) {
    const { pack } = state.archiveBatch.pendingDelete;
    state.archiveBatch.packs.splice(pack, 1);
    state.archiveBatch.groups = state.archiveBatch.packs.flatMap((item) => item.groups);
    state.archiveBatch.pendingDelete = null;
    $('archive-batch-name').textContent = `已选择 ${state.archiveBatch.packs.length} 个资源包`;
    $('confirm-dialog').open = false;
    renderArchive();
    snackbar('资源包已从列表移除');
    return;
  }
  if (state.singleBatch.pendingDelete) {
    const [fileIndex, resultIndex] = state.singleBatch.pendingDelete;
    state.singleBatch.files[fileIndex].results.splice(resultIndex, 1);
    state.singleBatch.pendingDelete = null;
    $('confirm-dialog').open = false;
    renderSingleBatch();
    snackbar('翻译结果已删除');
    return;
  }
  if (state.single.pendingDelete != null) {
    state.single.results.splice(state.single.pendingDelete, 1);
    state.single.pendingDelete = null;
    $('confirm-dialog').open = false;
    renderSingle();
    snackbar('翻译结果已删除');
    return;
  }
  const as = archiveState();
  const pending = as.pendingDelete;
  if (!pending) { $('confirm-dialog').open = false; return; }
  if (pending.generated) as.groups[pending.groupIndex].generated.splice(pending.genIndex, 1);
  else as.groups[pending.groupIndex].files[pending.fileIndex].deleted = true;
  as.pendingDelete = null;
  $('confirm-dialog').open = false;
  renderArchive();
  snackbar(pending.generated ? '翻译结果已删除' : '语言文件已标记为删除，导出时生效');
}

async function loadSingleFile(file) {
  if (!file) return;
  if (state.single.file) { requestOverwrite('single', file); return; }
  await doLoadSingleFile(file);
}

async function doLoadSingleFile(file) {
  state.single.file = file;
  $('single-name').textContent = file.name;
  state.single.exportName = `${stripExt(file.name)}_translations`;
  const parsed = parseText(await file.text());
  state.single.entries = parsed.entries;
  state.single.lines = parsed.lines;
  state.single.issues = parsed.issues;
  state.single.results = [];
  state.single.pendingDelete = null;
  state.single.sourceLanguage = inferLanguage(file.name);
  renderSingle();
}

function renderSingle() {
  const issues = state.single.issues || [];
  const targetValue = (state.single.targetLanguages || []).length ? ` value="${escapeHtml(JSON.stringify(state.single.targetLanguages))}"` : '';
  $('single-workspace').innerHTML = `<mdui-card class="single-card"><div class="group-header"><div><h2>${escapeHtml(state.single.file.name)}</h2><p data-single-count>${state.single.entries.length} 个键 · 源语言：${escapeHtml(state.single.sourceLanguage || '需要选择')}</p></div><mdui-chip>${issues.length ? `${issues.length} 个问题` : '解析正常'}</mdui-chip></div><details class="review-box"><summary><span class="material-icons expand-icon" aria-hidden="true">expand_more</span><strong>源文件</strong><span class="muted">点击展开预览或修改</span></summary><div class="review-editor"><mdui-text-field variant="outlined" label="源文件内容（可修改）" rows="12" value="${escapeHtml(state.single.edited ?? renderLines(state.single, state.single.entries.map((entry) => entry.value)))}" data-single-source-edit></mdui-text-field></div></details><div class="config-grid"><mdui-select label="源语言" value="${escapeHtml(state.single.sourceLanguage)}" id="single-source">${sourceLanguageMenuItems(state.single.sourceLanguage)}</mdui-select><mdui-select label="目标语言（可多选）" multiple${targetValue} id="single-target">${singleTargetOptions()}</mdui-select></div><div class="stats"><mdui-chip>键：${state.single.entries.length}</mdui-chip><mdui-chip>问题：${issues.length}</mdui-chip></div><div class="advanced-options"><mdui-checkbox data-strip-codes ${state.options.stripCodes ? 'checked' : ''}>高级选项：翻译时删除格式代码（§ 及其后跟随的数字/字母）</mdui-checkbox></div><div class="toolbar"><span class="muted">保持键名不变，仅翻译等号右侧的值；翻译结果会累积保留</span><mdui-button variant="filled" id="single-translate"><span class="material-icons" aria-hidden="true">translate</span>开始翻译</mdui-button></div></mdui-card>${singleResultCard()}`;
  $('single-source').addEventListener('change', (event) => { state.single.sourceLanguage = event.target.value; });
  $('single-target').addEventListener('change', (event) => { state.single.targetLanguages = Array.isArray(event.target.value) ? event.target.value : [event.target.value]; });
  $('single-translate').addEventListener('click', translateSingle);
  $('single-workspace').querySelectorAll('[data-download-single]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); downloadSingle(Number(button.dataset.downloadSingle)); }));
  $('single-workspace').querySelectorAll('[data-delete-single]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); requestDeleteSingle(Number(button.dataset.deleteSingle)); }));
  const downloadAll = $('single-workspace').querySelector('[data-download-all]');
  if (downloadAll) downloadAll.addEventListener('click', downloadAllSingle);
  // 打包下载文件名：输入写入 state，重渲染（翻译、删除）后不丢失
  $('single-workspace').querySelector('#single-filename')?.addEventListener('input', (event) => { state.single.exportName = event.target.value; });
}

// 单语言文件模式的翻译结果列表：与整包模式结构一致，默认折叠，可多语言累积，带下载和删除按钮
function singleResultCard() {
  const results = state.single.results || [];
  if (!results.length) return '';
  return `<mdui-card class="single-card"><div class="generated-list"><h3>已翻译文件（${results.length}）</h3>
    ${results.map((result, index) => `
    <details class="review-box">
      <summary><span class="material-icons expand-icon" aria-hidden="true">expand_more</span><strong>${escapeHtml(fileLabel(`${result.target}.lang`, result.target))}</strong><span class="muted">${result.parsed.entries.length} 个键</span><mdui-chip>已翻译</mdui-chip><mdui-button-icon aria-label="下载 ${result.target}.lang" data-download-single="${index}"><span class="material-icons" aria-hidden="true">download</span></mdui-button-icon><mdui-button-icon class="delete-generated" aria-label="删除 ${result.target}.lang" data-delete-single="${index}"><span class="material-icons" aria-hidden="true">delete</span></mdui-button-icon></summary>
      <div class="review-editor"><mdui-text-field variant="outlined" label="校对译文（可编辑）" rows="12" value="${escapeHtml(result.edited ?? renderLines(result.parsed, result.translated))}" data-single-review-lang="${index}"></mdui-text-field></div>
    </details>`).join('')}</div>
      <div class="config-grid export-grid"><mdui-text-field label="打包文件名" value="${escapeHtml(state.single.exportName)}" id="single-filename"></mdui-text-field></div>
    <div class="toolbar"><span class="muted">校对输入会实时保存，下载时生效</span><mdui-button variant="filled" data-download-all><span class="material-icons" aria-hidden="true">folder_zip</span>打包下载全部（${results.length} 个文件）</mdui-button></div></mdui-card>`;
}

async function translateSingle() {
  const source = $('single-source').value || state.single.sourceLanguage;
  const targets = Array.isArray($('single-target')?.value) ? $('single-target').value : ($('single-target')?.value ? [$('single-target').value] : []);
  if (!source || !targets.length) { snackbar('请选择源语言和至少一个目标语言'); return; }
  if (targets.includes(source)) { snackbar('目标语言不能与源语言相同'); return; }
  const existing = (state.single.results || []).map((result) => result.target);
  if (targets.some((target) => existing.includes(target))) { snackbar('所选目标语言中已有翻译结果，请先删除后再重新翻译'); return; }
  const button = $('single-translate');
  const setProgress = (percent) => { if (button) button.innerHTML = `<span class="material-icons spinning" aria-hidden="true">autorenew</span>翻译中 ${percent}%`; };
  if (button) button.disabled = true;
  const values = state.single.entries.map((entry) => entry.value);
  state.single.results = state.single.results || [];
  let done = 0;
  for (const target of targets) {
    const translated = await translateValues(values, source, target);
    state.single.results.push({ parsed: { entries: state.single.entries, lines: state.single.lines }, translated, target });
    done += 1;
    setProgress(Math.round((done / targets.length) * 100));
  }
  // 翻译完成后清空目标语言选择，避免与“已存在”禁用项冲突
  state.single.targetLanguages = [];
  renderSingle();
  snackbar(`${targets.length} 个目标语言已生成，可在下方列表校对后下载`);
}

function downloadSingle(index) {
  const result = state.single.results?.[index];
  if (!result) return;
  const output = result.edited ?? renderLines(result.parsed, result.translated);
  downloadBlob(new Blob([output], { type: 'text/plain;charset=utf-8' }), `${result.target}.lang`);
  snackbar('目标语言文件已下载');
}

// 打包下载单语言文件模式的全部翻译结果，源文件一并打包，文件名优先使用自定义输入
async function downloadAllSingle() {
  const results = state.single.results || [];
  if (!results.length) return;
  const zip = new JSZip();
  zip.file(state.single.file.name, state.single.edited ?? state.single.file);
  for (const result of results) zip.file(`${result.target}.lang`, result.edited ?? renderLines(result.parsed, result.translated));
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${stripExt(state.single.exportName) || stripExt(state.single.file.name)}.zip`);
  snackbar('翻译结果已打包下载');
}

async function loadSingleFiles(files) {
  if (!files?.length) return;
  await doLoadSingleFiles(files);
}

// 批量单文件：逐个解析，再次上传直接追加到已有列表；每个文件独立翻译，结果累积在各自条目里
async function doLoadSingleFiles(files) {
  const items = state.singleBatch.files;
  for (const file of files) {
    const parsed = parseText(await file.text());
    items.push({ file, entries: parsed.entries, lines: parsed.lines, issues: parsed.issues, sourceLanguage: inferLanguage(file.name), targetLanguages: [], results: [] });
  }
  state.singleBatch = { files: items, exportName: state.singleBatch.exportName || '批量翻译', translateTarget: state.singleBatch.translateTarget || '', pendingDelete: null };
  $('single-batch-name').textContent = `已选择 ${items.length} 个语言文件`;
  renderSingleBatch();
}

// 批量单文件的翻译结果列表：结构与单文件模式一致，data 属性带 fileIndex 前缀
function batchResultsCard(item, fileIndex) {
  const results = item.results || [];
  if (!results.length) return '';
  return `<div class="generated-list"><h3>已翻译文件（${results.length}）</h3>${results.map((result, index) => `
    <details class="review-box">
      <summary><span class="material-icons expand-icon" aria-hidden="true">expand_more</span><strong>${escapeHtml(fileLabel(`${result.target}.lang`, result.target))}</strong><span class="muted">${result.parsed.entries.length} 个键</span><mdui-chip>已翻译</mdui-chip><mdui-button-icon aria-label="下载 ${result.target}.lang" data-batch-download-single="${fileIndex}:${index}"><span class="material-icons" aria-hidden="true">download</span></mdui-button-icon><mdui-button-icon class="delete-generated" aria-label="删除 ${result.target}.lang" data-batch-delete-single="${fileIndex}:${index}"><span class="material-icons" aria-hidden="true">delete</span></mdui-button-icon></summary>
      <div class="review-editor"><mdui-text-field variant="outlined" label="校对译文（可编辑）" rows="12" value="${escapeHtml(result.edited ?? renderLines(result.parsed, result.translated))}" data-batch-review-lang="${fileIndex}:${index}"></mdui-text-field></div>
    </details>`).join('')}</div>`;
}

// 批量单文件的打包下载卡：任意文件有翻译结果才显示
function batchExportCard() {
  const files = state.singleBatch.files;
  const translated = files.reduce((sum, item) => sum + (item.results?.length || 0), 0);
  if (!translated) return '';
  return `<mdui-card class="export-card"><div class="config-grid export-grid"><mdui-text-field label="打包文件名" value="${escapeHtml(state.singleBatch.exportName)}" id="single-filename"></mdui-text-field></div><div class="toolbar"><span class="muted">每个源文件单独一个文件夹，与译文一起打包</span><mdui-button variant="filled" id="download-all-batch"><span class="material-icons" aria-hidden="true">folder_zip</span>打包下载全部（${translated} 个译文文件）</mdui-button></div></mdui-card>`;
}

function renderSingleBatch() {
  const root = $('single-batch-workspace');
  const files = state.singleBatch.files;
  if (!files.length) { root.innerHTML = '<div class="empty">请选择语言文件后查看解析结果</div>'; return; }
  // 一键翻译卡：源语言 = 各文件下拉已选值或文件名推断，跳过无源语言和已有目标结果的文件
  const translateAllCard = `<mdui-card class="export-card"><div class="config-grid"><mdui-select label="一键翻译至" value="${state.singleBatch.translateTarget || 'zh_CN'}" id="batch-target-lang">${languageMenuItems()}</mdui-select></div><div class="toolbar"><span class="muted">翻译所有文件，已有该目标语言结果的文件自动跳过</span><mdui-button variant="filled" id="translate-all-single"><span class="material-icons" aria-hidden="true">translate</span>一键翻译</mdui-button></div></mdui-card>`;
  root.innerHTML = `${translateAllCard}${files.map((item, index) => `
    <mdui-card class="single-card">
      <div class="group-header"><div><input class="folder-name-input" data-batch-rename="${index}" value="${escapeHtml(item.folderName || stripExt(item.file.name))}" aria-label="打包时的文件夹名" title="打包下载时的文件夹名，可直接修改"><p data-batch-count="${index}">${item.entries.length} 个键 · 源语言：${escapeHtml(item.sourceLanguage || '需要选择')}</p></div><mdui-chip>${item.issues.length ? `${item.issues.length} 个问题` : '解析正常'}</mdui-chip></div>
      <details class="review-box"><summary><span class="material-icons expand-icon" aria-hidden="true">expand_more</span><strong>源文件</strong><span class="muted">点击展开预览或修改</span></summary><div class="review-editor"><mdui-text-field variant="outlined" label="源文件内容（可修改）" rows="12" value="${escapeHtml(item.edited ?? renderLines(item, item.entries.map((entry) => entry.value)))}" data-batch-source-edit="${index}"></mdui-text-field></div></details>
      <div class="config-grid"><mdui-select label="源语言" value="${escapeHtml(item.selection?.source || item.sourceLanguage)}" data-batch-source="${index}">${sourceLanguageMenuItems(item.selection?.source || item.sourceLanguage)}</mdui-select><mdui-select label="目标语言（可多选）" multiple data-batch-target="${index}">${singleTargetOptionsFor(item.results)}</mdui-select></div>
      <div class="advanced-options"><mdui-checkbox data-strip-codes ${state.options.stripCodes ? 'checked' : ''}>高级选项：翻译时删除格式代码（§ 及其后跟随的数字/字母）</mdui-checkbox></div>
      <div class="toolbar"><span class="muted">保持键名不变，仅翻译等号右侧的值；翻译结果会累积保留</span><mdui-button variant="filled" data-translate-single-batch="${index}"><span class="material-icons" aria-hidden="true">translate</span>开始翻译</mdui-button></div>
      ${batchResultsCard(item, index)}
    </mdui-card>`).join('')}${batchExportCard()}`;
  root.querySelectorAll('[data-translate-single-batch]').forEach((button) => button.addEventListener('click', () => translateBatchSingle(Number(button.dataset.translateSingleBatch))));
  root.querySelectorAll('[data-batch-download-single]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const [fileIndex, resultIndex] = button.dataset.batchDownloadSingle.split(':').map(Number); downloadSingleBatch(fileIndex, resultIndex); }));
  root.querySelectorAll('[data-batch-delete-single]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); const [fileIndex, resultIndex] = button.dataset.batchDeleteSingle.split(':').map(Number); requestDeleteSingleBatch(fileIndex, resultIndex); }));
  root.querySelectorAll('[data-strip-codes]').forEach((box) => box.addEventListener('change', (event) => { state.options.stripCodes = event.target.checked; }));
  root.querySelector('#download-all-batch')?.addEventListener('click', downloadAllSingleBatch);
  root.querySelector('#single-filename')?.addEventListener('input', (event) => { state.singleBatch.exportName = event.target.value; });
  root.querySelector('#batch-target-lang')?.addEventListener('change', (event) => { state.singleBatch.translateTarget = event.target.value; });
  root.querySelector('#translate-all-single')?.addEventListener('click', translateAllSingleFiles);
  // 文件夹名实时编辑写入 item.folderName，打包下载时优先使用
  root.querySelectorAll('[data-batch-rename]').forEach((input) => input.addEventListener('input', (event) => { files[Number(event.target.dataset.batchRename)].folderName = event.target.value; }));
  // 选择变化实时存入 item.selection：其他文件翻译触发重渲染时，本文件已选的源/目标不丢失
  files.forEach((item, index) => {
    const source = root.querySelector(`[data-batch-source="${index}"]`);
    const target = root.querySelector(`[data-batch-target="${index}"]`);
    if (target && item.selection?.targets) target.value = item.selection.targets;
    source?.addEventListener('change', () => { item.selection = { ...(item.selection || {}), source: source.value }; item.sourceLanguage = source.value; });
    target?.addEventListener('change', () => { item.selection = { ...(item.selection || {}), targets: getSelected(target) }; });
  });
}

// 一键翻译所有单文件：跳过无源语言和已有该目标结果的文件，其余按各自源语言翻译
async function translateAllSingleFiles() {
  const root = $('single-batch-workspace');
  const target = root.querySelector('#batch-target-lang')?.value;
  if (!target) { snackbar('请选择目标语言'); return; }
  const files = state.singleBatch.files;
  const sources = files.map((item) => root.querySelector(`[data-batch-source="${files.indexOf(item)}"]`)?.value || item.sourceLanguage);
  if (!sources.some(Boolean)) { snackbar('没有可翻译的文件：请先选择源语言'); return; }
  const button = root.querySelector('#translate-all-single');
  if (button) button.disabled = true;
  let done = 0;
  let translated = 0;
  let skipped = 0;
  const setProgress = () => { if (button) button.innerHTML = `<span class="material-icons spinning" aria-hidden="true">autorenew</span>翻译中 ${done}/${files.length}`; };
  setProgress();
  for (let index = 0; index < files.length; index += 1) {
    const item = files[index];
    const source = sources[index];
    if (!source || source === target || (item.results || []).some((result) => result.target === target)) { skipped += 1; done += 1; setProgress(); continue; }
    const values = item.entries.map((entry) => entry.value);
    const translatedValues = await translateValues(values, source, target);
    item.results.push({ parsed: { entries: item.entries, lines: item.lines }, translated: translatedValues, target });
    translated += 1;
    done += 1;
    setProgress();
  }
  renderSingleBatch();
  snackbar(`一键翻译完成：${translated} 个文件已生成，${skipped} 个文件跳过`);
}

async function translateBatchSingle(fileIndex) {
  const item = state.singleBatch.files[fileIndex];
  const root = $('single-batch-workspace');
  const source = root.querySelector(`[data-batch-source="${fileIndex}"]`)?.value || item.sourceLanguage;
  const targets = getSelected(root.querySelector(`[data-batch-target="${fileIndex}"]`));
  if (!source || !targets.length) { snackbar('请选择源语言和至少一个目标语言'); return; }
  if (targets.includes(source)) { snackbar('目标语言不能与源语言相同'); return; }
  const existing = (item.results || []).map((result) => result.target);
  if (targets.some((target) => existing.includes(target))) { snackbar('所选目标语言中已有翻译结果，请先删除后再重新翻译'); return; }
  const button = root.querySelector(`[data-translate-single-batch="${fileIndex}"]`);
  const setProgress = (percent) => { if (button) button.innerHTML = `<span class="material-icons spinning" aria-hidden="true">autorenew</span>翻译中 ${percent}%`; };
  if (button) button.disabled = true;
  const values = item.entries.map((entry) => entry.value);
  item.results = item.results || [];
  let done = 0;
  for (const target of targets) {
    const translated = await translateValues(values, source, target);
    item.results.push({ parsed: { entries: item.entries, lines: item.lines }, translated, target });
    done += 1;
    setProgress(Math.round((done / targets.length) * 100));
  }
  // 翻译完成后清空本文件的目标语言选择（避免与“已存在”禁用项冲突），保留其它文件的选择
  item.selection = { ...(item.selection || {}), targets: [] };
  renderSingleBatch();
  snackbar(`${targets.length} 个目标语言已生成，可在下方列表校对后下载`);
}

function downloadSingleBatch(fileIndex, resultIndex) {
  const result = state.singleBatch.files[fileIndex]?.results?.[resultIndex];
  if (!result) return;
  downloadBlob(new Blob([result.edited ?? renderLines(result.parsed, result.translated)], { type: 'text/plain;charset=utf-8' }), `${result.target}.lang`);
  snackbar('目标语言文件已下载');
}

// 批量单文件打包下载：每个源文件一个文件夹（源文件 + 各译文），避免不同来源的同名文件互相覆盖
async function downloadAllSingleBatch() {
  const files = state.singleBatch.files;
  if (!files.length) return;
  const zip = new JSZip();
  const used = new Map();
  for (const item of files) {
    // 重名文件夹加 _2、_3 递增后缀（首占原名，第二个起编号）；文件夹名可用输入框自定义
    const base = (item.folderName || '').trim() || stripExt(item.file.name) || '文件';
    const count = used.get(base) || 0;
    const folder = count ? `${base}_${count + 1}` : base;
    used.set(base, count + 1);
    const dir = zip.folder(folder);
    dir.file(item.file.name, item.edited ?? item.file);
    for (const result of item.results || []) dir.file(`${result.target}.lang`, result.edited ?? renderLines(result.parsed, result.translated));
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  downloadBlob(blob, `${stripExt(state.singleBatch.exportName) || '批量翻译'}.zip`);
  snackbar('翻译结果已打包下载');
}

function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char])); }

$('archive-workspace').innerHTML = '<div class="empty">请选择资源包后查看识别结果</div>';
$('single-workspace').innerHTML = '<div class="empty">请选择语言文件后查看解析结果</div>';
$('archive-batch-workspace').innerHTML = '<div class="empty">请选择资源包后查看识别结果</div>';
$('single-batch-workspace').innerHTML = '<div class="empty">请选择语言文件后查看解析结果</div>';

// 校对输入实时写入状态，导出/下载时直接使用，编辑时零开销（两种整包模式共用，groupIndex 跨包连续）
const handleArchiveReview = (event) => {
  // 源文件预览/修改：写入 item.edited，翻译和导出时优先使用
  const sourceEdit = event.target.closest?.('[data-archive-source-edit]');
  if (sourceEdit) {
    const [groupIndex, fileIndex] = sourceEdit.dataset.archiveSourceEdit.split(':').map(Number);
    const item = archiveState().groups[groupIndex]?.files[fileIndex];
    if (item) item.edited = sourceEdit.value;
    return;
  }
  const field = event.target.closest?.('[data-review-lang]');
  if (!field) return;
  const [groupIndex, genIndex] = field.dataset.reviewLang.split(':').map(Number);
  const generated = archiveState().groups[groupIndex]?.generated?.[genIndex];
  if (generated) generated.edited = field.value;
};
$('archive-workspace').addEventListener('input', handleArchiveReview);
$('archive-batch-workspace').addEventListener('input', handleArchiveReview);

// 源文件编辑：重新解析并更新条目/行/问题，翻译与打包使用修改后的内容（两种单文件模式共用）
const applySourceEdit = (target, text) => {
  target.edited = text;
  const parsed = parseText(text);
  target.entries = parsed.entries;
  target.lines = parsed.lines;
  target.issues = parsed.issues;
};
const handleSingleReview = (event) => {
  const batchSource = event.target.closest?.('[data-batch-source-edit]');
  if (batchSource) {
    const item = state.singleBatch.files[Number(batchSource.dataset.batchSourceEdit)];
    if (item) {
      applySourceEdit(item, batchSource.value);
      const count = $('single-batch-workspace').querySelector(`[data-batch-count="${batchSource.dataset.batchSourceEdit}"]`);
      if (count) count.textContent = `${item.entries.length} 个键 · 源语言：${item.sourceLanguage || '需要选择'}`;
    }
    return;
  }
  const singleSource = event.target.closest?.('[data-single-source-edit]');
  if (singleSource) {
    applySourceEdit(state.single, singleSource.value);
    const count = $('single-workspace').querySelector('[data-single-count]');
    if (count) count.textContent = `${state.single.entries.length} 个键 · 源语言：${state.single.sourceLanguage || '需要选择'}`;
    return;
  }
  const batch = event.target.closest?.('[data-batch-review-lang]');
  if (batch) {
    const [fileIndex, resultIndex] = batch.dataset.batchReviewLang.split(':').map(Number);
    const result = state.singleBatch.files[fileIndex]?.results?.[resultIndex];
    if (result) result.edited = batch.value;
    return;
  }
  const field = event.target.closest?.('[data-single-review-lang]');
  if (!field) return;
  const result = state.single.results?.[Number(field.dataset.singleReviewLang)];
  if (result) result.edited = field.value;
};
$('single-workspace').addEventListener('input', handleSingleReview);
$('single-batch-workspace').addEventListener('input', handleSingleReview);
