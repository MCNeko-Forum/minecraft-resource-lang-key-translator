// 最小自检：stub DOM 加载 app.js，验证语言表完整性、定义齐全和注释保留输出（node check.mjs）
import { readFileSync } from 'node:fs';

const stub = () => ({ addEventListener() {}, classList: { toggle() {} }, style: {}, innerHTML: '', textContent: '', click() {}, open: false, value: '' });
globalThis.document = { getElementById: () => stub(), querySelectorAll: () => [], querySelector: () => null, documentElement: { classList: { toggle() {} } }, createElement: () => stub() };
globalThis.window = {};
globalThis.location = { hash: '' };
globalThis.history = { replaceState() {} };

const ok = (condition, message) => { if (!condition) throw new Error('自检失败：' + message); };
globalThis.ok = ok;
globalThis.__css = readFileSync(new URL('./static/css/styles.css', import.meta.url), 'utf8');

const src = readFileSync(new URL('./static/js/app.js', import.meta.url), 'utf8');
// index.html 防外部覆盖：关键新增元素必须存在，否则运行时 $() 会拿到 null
const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('./static/css/styles.css', import.meta.url), 'utf8');
ok(/id="overwrite-dialog"/.test(html) && /id="overwrite-confirm"/.test(html) && /id="overwrite-cancel"/.test(html), 'index.html 应有覆盖确认弹窗 overwrite-dialog 及其按钮');
  ok(/value="info">信息/.test(html) && /data-mode="info"/.test(html), 'index.html 应有“信息”标签页及对应面板');
  ok(html.includes('https://github.com/MCNeko-Forum/minecraft-resource-lang-key-translator'), '信息页应包含本项目仓库地址');
  ok(html.includes('MIT License'), '信息页应包含 MIT 协议链接');
  ok(src.includes('history.replaceState') && src.includes("location.hash.slice(1)"), '切换标签页应写入 URL hash，刷新后恢复当前标签页');
  // SEO：描述/关键词/Open Graph/JSON-LD/favicon/theme-color
  ok(/name="description"/.test(html) && /name="keywords"/.test(html), 'index.html 应有 meta description 与 keywords（SEO）');
  ok(/property="og:title"/.test(html) && /property="og:description"/.test(html) && /property="og:site_name"/.test(html), 'index.html 应有 Open Graph 标签（社交分享）');
  ok(/rel="icon"/.test(html) && /name="theme-color"/.test(html), 'index.html 应有 favicon（data URI SVG）与 theme-color');
  const ldJson = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)?.[1];
  ok(ldJson && JSON.parse(ldJson)['@type'] === 'WebApplication', 'JSON-LD 结构化数据应为合法 JSON 的 WebApplication');
  // 深色模式必须切换 MDUI 官方类名，否则 MDUI 组件（tabs/输入框/下拉栏）tokens 不变黑
  ok(src.includes("classList.toggle('mdui-theme-dark')"), '主题切换应切换 MDUI 官方类 mdui-theme-dark');
  ok(css.includes(':root.mdui-theme-dark') && !css.includes(':root.dark'), 'styles.css 深色变量应挂在 :root.mdui-theme-dark 下');
  // 品牌主色 #FFA500：MDUI 主色 token 全套覆盖（"r, g, b" 三元组格式，组件内 rgb() 包一层）+ theme-color 同步
  ok(css.includes('--mdui-color-primary-light: 255, 165, 0') && css.includes('--mdui-color-primary-dark: 255, 165, 0'), 'styles.css 应覆盖 MDUI 主色 token 为 #FFA500 的 RGB 三元组（light/dark）');
  ok(html.includes('<meta name="theme-color" content="#FFA500">'), 'index.html theme-color 应为品牌色 #FFA500');
ok(html.includes('./static/js/app.js') && html.includes('./static/css/styles.css') && html.includes('./static/css/fonts.css') && !/src="\.\/app\.js"/.test(html) && !/href="\.\/styles\.css"/.test(html), 'index.html 静态资源应引用 static 目录（app.js/styles.css/fonts.css）');
  ok(css.includes("'Alibaba PuHuiTi', Inter"), 'styles.css 全局字体栈应以 Alibaba PuHuiTi 开头（否则字体文件不会被请求）');
// 文件名控件已移到 JS 渲染的导出区：index.html 导入卡片不应残留旧控件（否则重复出现两套输入框）
ok(!/id="archive-filename"|id="archive-ext"|id="single-filename"/.test(html), 'index.html 不应残留旧的文件名输入框/后缀下拉栏（由 JS 在导出区渲染）');
// 批量模式：tab、多选上传 input、独立 workspace
ok(/value="archive-batch"/.test(html) && /整包模式（批量）/.test(html), 'index.html 应有整包模式（批量）标签');
ok(/value="single-file-batch"/.test(html) && /单语言文件模式（批量）/.test(html), 'index.html 应有单语言文件模式（批量）标签');
ok(/id="archive-batch-input"[^>]*multiple/.test(html) && /id="single-batch-input"[^>]*multiple/.test(html), '批量模式上传 input 应支持 multiple 多选');
ok(/id="archive-batch-workspace"/.test(html) && /id="single-batch-workspace"/.test(html), '批量模式应有独立 workspace');
// 标签页单行 + 可滑动
ok(/mdui-tabs::part\(container\)/.test(css) && /flex-wrap: nowrap/.test(css) && /overflow-x: auto/.test(css), '标签页容器应强制单行并支持横向滑动');
ok(/mdui-tabs mdui-tab\s*\{[^}]*flex-shrink: 0/.test(css), '标签项不应被压缩，保持完整文字');
ok(/\.folder-name-input\s*\{[^}]*border: 1px solid transparent/.test(css) && /\.folder-name-input:focus/.test(css), '文件夹名输入框应默认无边框（看似标题）聚焦时显示边框');
// 外部资源统一走 cdn.jsdmirror.com，不再依赖 unpkg/jsdelivr/googleapis
ok(!/unpkg\.com|cdn\.jsdelivr\.net|fonts\.googleapis\.com/.test(html), '不应再引用 unpkg/jsdelivr/googleapis 的外部资源');
ok((html.match(/cdn\.jsdmirror\.com/g) || []).length === 5, '应有 5 个外部资源引用 cdn.jsdmirror.com，实际 ' + (html.match(/cdn\.jsdmirror\.com/g) || []).length);
// 一键翻译：弹窗结构
ok(/id="batch-translate-dialog"/.test(html) && /id="batch-translate-confirm"/.test(html) && /id="batch-translate-cancel"/.test(html) && /id="batch-translate-list"/.test(html), 'index.html 应有一键翻译覆盖确认弹窗及复选框列表容器');
ok(/\$\('batch-translate-confirm'\)\.addEventListener/.test(src) && /\$\('batch-translate-cancel'\)\.addEventListener/.test(src), '一键翻译弹窗的确认/取消按钮应绑定事件');
ok(/batch-translate-list'\)\.querySelectorAll\('mdui-checkbox'\)/.test(src) && /\.filter\(\(box\) => box\.checked\)/.test(src), '确认时应收集勾选的复选框决定覆盖哪些包');
const checks = `
;(async function () {
  const css = globalThis.__css;
  const bedrock = Object.keys(BEDROCK_LANGUAGES);
  const translate = Object.keys(TRANSLATE_LANGUAGES);
  ok(bedrock.length === 29, 'BEDROCK_LANGUAGES 应有 29 种语言，实际 ' + bedrock.length);
  ok(bedrock.length === translate.length && bedrock.every((k) => translate.includes(k)), 'BEDROCK_LANGUAGES 与 TRANSLATE_LANGUAGES 键不一致');
  ok(typeof languageMenuItems === 'function', 'languageMenuItems 未定义');
  ok(typeof renderLines === 'function', 'renderLines 未定义');
  ok(languageMenuItems().includes('zh_CN'), '语言菜单缺少 zh_CN');
  ok(groupCard.toString().includes('\${generatedList(group, groupIndex)}'), 'groupCard 缺少已翻译列表的插入点');
  ok(renderArchive.toString().includes('group.selection'), 'renderArchive 缺少重渲染后恢复选择的逻辑');
  ok(applyPackChanges.toString().includes('generated.edited ?? renderLines'), '导出必须优先使用校对编辑内容');
  ok(applyPackChanges.toString().includes('syncLanguagesManifest'), '导出必须同步语言清单');
  ok(generatedList.toString().includes('data-review-lang') && !generatedList.toString().includes('data-review=\\"'), 'generatedList 应使用单文件整体编辑框');
  ok(singleResultCard.toString().includes('data-single-review-lang') && !singleResultCard.toString().includes('data-single-review=\\"'), 'singleResultCard 应使用单文件整体编辑框');
  ok(typeof singleTargetOptions === 'function' && singleTargetOptions.toString().includes('results'), '单语言文件模式目标语言应按已有翻译结果禁用');
  ok(translateSingle.toString().includes('results.push') && translateSingle.toString().includes("targetLanguages = []"), '单语言文件翻译应追加结果并清空目标选择');  ok(renderSingle.toString().includes('multiple') && translateSingle.toString().includes('targets.length'), '单语言文件模式目标语言应可多选');
  ok(singleResultCard.toString().includes('data-delete-single') && singleResultCard.toString().includes('data-download-single'), '单语言文件结果列表应有删除和下载按钮');
  ok(confirmDelete.toString().includes('single.pendingDelete'), '删除单语言文件翻译结果应复用确认弹窗');
  ok(typeof downloadAllSingle === 'function' && downloadAllSingle.toString().includes('JSZip') && singleResultCard.toString().includes('data-download-all'), '单语言文件模式应支持打包下载全部结果');
  ok(downloadAllSingle.toString().includes('state.single.file.name, state.single.edited ?? state.single.file'), '打包下载应包含上传的源语言文件（修改过则用修改后内容）');
  // 源文件预览/修改：两种单文件模式都要有默认折叠的编辑框，编辑后重新解析并影响翻译和打包
  ok(typeof applySourceEdit === 'function' && applySourceEdit.toString().includes('parseText'), '源文件编辑应重新解析内容');
  ok(renderSingle.toString().includes('data-single-source-edit') && renderSingle.toString().includes('review-box'), '单文件模式应有默认折叠的源文件预览框');
  ok(renderSingleBatch.toString().includes('data-batch-source-edit') && renderSingleBatch.toString().includes('review-box'), '批量单文件模式应有默认折叠的源文件预览框');
  ok(handleSingleReview.toString().includes('applySourceEdit'), '源文件编辑输入应实时重新解析');
  ok(downloadAllSingleBatch.toString().includes('item.edited ?? item.file'), '批量打包下载源文件应用修改后内容');
  // 整包模式源文件预览/修改：预读文本、折叠编辑框、翻译和导出用修改后内容
  ok(parseArchiveGroups.toString().includes('text: extension'), '整包解析应预读语言文件文本供预览');
  ok(groupCard.toString().includes('data-archive-source-edit') && groupCard.toString().includes('item.edited ?? item.text'), '整包模式文件行应有源文件预览编辑框');
  ok(translateGroup.toString().includes('source.edited ?? source.text'), '整包翻译应优先使用修改后的源文件内容');
  ok(runBatchTranslate.toString().includes('source.file.edited ?? source.file.text'), '一键翻译应优先使用修改后的源文件内容');
  ok(applyPackChanges.toString().includes('item.edited != null') && applyPackChanges.toString().includes('zip.file(item.path, item.edited)'), '导出应写入修改后的源文件内容');
  ok(handleArchiveReview.toString().includes('data-archive-source-edit'), '整包源文件编辑输入应实时保存');
  ok(!groupCard.toString().includes('>可修改<') && !renderSingle.toString().includes('>可修改<') && !renderSingleBatch.toString().includes('>可修改<'), '源文件预览框不应显示“可修改”标签');
  ok(!groupCard.toString().includes("item.language || '未识别语言'"), '语言文件列表不应显示语言代码卡片');
  ok(groupCard.toString().includes('个文件，点击展开') && groupCard.toString().indexOf('review-box') < groupCard.toString().indexOf('class="file-list"'), '整包模式语言文件列表应默认折叠');
  ok(renderArchive.toString().includes("group.selection?.source || source.querySelectorAll('mdui-menu-item')[0]?.value"), '整包模式源语言应默认选择第一个选项');
  ok(fileLabel('zh_CN.lang', 'zh_CN') === 'zh_CN.lang（简体中文（中国大陆））', 'fileLabel 应输出“文件名（语言中文名）”');
  ok(fileLabel('custom.lang', null) === 'custom.lang', 'fileLabel 无语言时应退回纯文件名');
  ok(groupCard.toString().includes('fileLabel(item.fileName, item.language)') && generatedList.toString().includes('fileLabel('), '两个列表的文件名都应附带语言中文名');
  ok(downloadSingle.toString().includes('result.edited ?? renderLines'), 'downloadSingle 必须优先使用校对编辑内容');
  ok(translateValues.toString().includes('waitForRateLimit'), 'translateValues 必须经过 3 秒限流');
  ok(!translateGroup.toString().includes('个格式问题'), '整包模式存在格式问题时不应弹消息条提示，直接忽略继续翻译');
  // en_UK 别名映射到 en_GB：目标语言列表只含 29 种标准语言，源语言下拉可显示非标准代码
  ok(LANGUAGE_ALIASES.en_UK === 'en_GB' && typeof normalizeLanguage === 'function', 'en_UK 应通过别名表映射到 en_GB');
  ok(!Object.keys(BEDROCK_LANGUAGES).includes('en_UK'), '目标语言列表不应包含 en_UK');
  ok(normalizeLanguage('en_UK') === 'en_GB' && normalizeLanguage('zh_CN') === 'zh_CN', 'normalizeLanguage 应归一化 en_UK 且不影响标准代码');
  ok(fileLabel('en_UK.lang', 'en_UK') === 'en_UK.lang（英语（英国））', 'en_UK 文件应显示映射后的中文名');
  ok(translateValues.toString().includes('TRANSLATE_LANGUAGES[normalizeLanguage(from)]'), '翻译源语言应经别名归一化（en_UK 可正确翻译）');
  ok(typeof sourceLanguageMenuItems === 'function' && sourceLanguageMenuItems('en_UK').includes('value="en_UK"'), '源语言下拉应能显示非标准代码 en_UK');
  ok(!sourceLanguageMenuItems('zh_CN').includes('en_UK'), '标准语言时源语言下拉不应追加 en_UK');
  ok(renderSingle.toString().includes('sourceLanguageMenuItems(state.single.sourceLanguage)') && renderSingleBatch.toString().includes('sourceLanguageMenuItems(item.selection?.source'), '两种单文件模式源语言下拉应用 sourceLanguageMenuItems');
  ok(translateGroup.toString().includes('button.disabled = true') && translateGroup.toString().includes('翻译中'), 'translateGroup 必须禁用按钮并显示翻译进度');
  ok(translateGroup.toString().includes('spinning') && translateSingle.toString().includes('spinning'), '翻译中必须显示旋转图标');
  ok(targetOptions.toString().includes('group.generated'), '目标语言选项应把已生成的翻译结果视为已存在并禁用');
  ok(generatedList.toString().includes('data-delete-generated'), '已翻译列表应有删除按钮');
  ok(typeof requestDeleteGenerated === 'function' && confirmDelete.toString().includes('pending.generated'), '删除翻译结果应复用确认弹窗');
  ok(translateGroup.toString().includes('targets: []'), '翻译完成后应清空目标语言选择');
  // 行为验证：生成 zh_CN 后该语言选项禁用，删除翻译结果后恢复可选
  const optGroup = { files: [{ deleted: false, language: 'en_US' }], generated: [{ target: 'zh_CN' }] };
  ok(targetOptions(optGroup).includes('value="zh_CN" disabled'), '已生成的 zh_CN 选项应禁用');
  ok(!targetOptions(optGroup).includes('value="ja_JP" disabled'), '未生成的 ja_JP 选项不应禁用');
  ok(translateSingle.toString().includes('disabled = true'), 'translateSingle 必须禁用按钮');
  // 限流行为：并发两次调用应排队，第二次至少等待约 3 秒
  const t0 = Date.now();
  await Promise.all([waitForRateLimit(), waitForRateLimit()]);
  ok(Date.now() - t0 >= 2900, '限流器并发调用应排队至少 3 秒，实际 ' + (Date.now() - t0) + 'ms');
  // 行为验证：§ 格式代码替换为占位符后整句翻译，占位符不完整时回退原文（先关闭默认勾选的删除选项）
  ok(state.options.stripCodes === true, 'stripCodes 应默认勾选');
  state.options.stripCodes = false;
  nextRequestSlot = 0;
  let sentTexts = null;
  window.translate = { request: { translateText: (req, cb) => { sentTexts = req.texts; cb({ result: 1, text: req.texts.map((t) => '訳' + t) }); } } };
  const styled = await translateValues(['Spawn §fJapan§4ese §fOfficer', '纯文本'], 'en_US', 'ja_JP');
  ok(sentTexts.includes('Spawn %c1%Japan%c2%ese %c3%Officer'), '应把 § 代码替换为占位符后整句发送，实际：' + JSON.stringify(sentTexts));
  ok(!sentTexts.some((t) => t.includes('§')), '发送给翻译接口的文本不应包含 § 格式代码');
  ok(styled[0] === '訳Spawn §fJapan§4ese §fOfficer', '译文应按占位符还原 § 代码，实际：' + styled[0]);
  ok(styled[1] === '訳纯文本', '无格式代码文本应整条翻译，实际：' + styled[1]);
  // 占位符被翻译引擎丢失：该条回退原文，不输出错乱颜色
  window.translate = { request: { translateText: (req, cb) => { cb({ result: 1, text: req.texts.map(() => '占位符丢失') }); } } };
  nextRequestSlot = 0;
  const fallback = await translateValues(['Spawn §4Ba'], 'en_US', 'ja_JP');
  ok(fallback[0] === 'Spawn §4Ba', '占位符不完整时该条应回退原文，实际：' + fallback[0]);
  // 行为验证：高级选项勾选后删除 § 及其后跟随的数字/字母，输出纯文本译文
  ok(groupCard.toString().includes('data-strip-codes') && renderSingle.toString().includes('data-strip-codes') && renderSingleBatch.toString().includes('data-strip-codes'), '每个模式的翻译按钮上方都应有删除格式代码的高级选项');
  state.options.stripCodes = true;  nextRequestSlot = 0;
  window.translate = { request: { translateText: (req, cb) => { sentTexts = req.texts; cb({ result: 1, text: req.texts.map((t) => '訳' + t) }); } } };
  const stripped = await translateValues(['Spawn §fJapan§4ese §fOfficer'], 'en_US', 'ja_JP');
  ok(sentTexts[0] === 'Spawn Japanese Officer', '勾选后应删除格式代码再翻译，实际：' + JSON.stringify(sentTexts));
  ok(stripped[0] === '訳Spawn Japanese Officer', '勾选后译文不应包含 § 代码，实际：' + stripped[0]);
  state.options.stripCodes = false;
  const parsed = parseText('## note\\na=x');
  const out = renderLines(parsed, ['甲']);
  ok(out === '## note\\na=甲\\n', 'renderLines 输出异常：' + JSON.stringify(out));
  ok(typeof syncLanguagesManifest === 'function', 'syncLanguagesManifest 未定义');
  // 无清单：创建标准 languages.json 并加入新语言；已删除语言被移除
  const written = {};
  const zipStub = { file: (p, c) => { written[p] = c; }, remove: (p) => { delete written[p]; } };
  const group = {
    path: 'texts',
    files: [
      { path: 'texts/en_US.lang', extension: 'lang', language: 'en_US', deleted: false },
      { path: 'texts/fr_FR.lang', extension: 'lang', language: 'fr_FR', deleted: true }
    ],
    zipEntries: {},
    generated: [{ target: 'zh_CN', parsed: { entries: [], lines: [] }, translated: [] }]
  };
  await syncLanguagesManifest(zipStub, group);
  const codes = JSON.parse(written['texts/languages.json']);
  ok(Array.isArray(codes) && codes.includes('zh_CN'), '清单应包含新生成的 zh_CN');
  ok(!codes.includes('fr_FR'), '清单应移除已删除且未重新生成的 fr_FR');
  // 自定义下载文件名与覆盖确认
  ok(stripExt('a.zip') === 'a' && stripExt('我的包.MCPACK') === '我的包' && stripExt('a.b.zip') === 'a.b', 'stripExt 应只剥掉下载后缀');
  ok(typeof requestOverwrite === 'function' && typeof doLoadArchive === 'function' && typeof doLoadSingleFile === 'function', '覆盖确认拆分应存在 loadArchive/loadSingleFile 与 doLoadArchive/doLoadSingleFile');
  ok(loadArchive.toString().includes('requestOverwrite') && loadSingleFile.toString().includes('requestOverwrite'), '两个模式再次上传都应先请求覆盖确认');
  ok(requestOverwrite.toString().includes("'overwrite-dialog'") && requestOverwrite.toString().includes("'overwrite-text'"), '覆盖确认应设置提示文本并弹出 overwrite-dialog');
  ok(doLoadArchive.toString().includes('exportName') && doLoadArchive.toString().includes('exportExt'), '整包上传后应自动填入下载文件名并识别后缀');
  ok(doLoadSingleFile.toString().includes('exportName'), '单文件上传后应自动填入打包下载文件名');
  ok(renderArchive.toString().includes('archive-filename') && renderArchive.toString().includes('archive-ext'), '整包模式导出区应渲染下载文件名输入框和后缀选择器');
  ok(renderArchive.toString().includes('export-card'), '整包模式导出区应有白色背景卡片（export-card）');
  ok(renderArchive.toString().indexOf('archive-filename') < renderArchive.toString().indexOf('id="export-archive"'), '文件名控件应渲染在导出资源包按钮上方');
  ok(singleResultCard.toString().includes('single-filename'), '单文件模式结果卡片应渲染打包下载文件名输入框');
  ok(singleResultCard.toString().indexOf('single-filename') < singleResultCard.toString().indexOf('data-download-all'), '文件名输入框应渲染在打包下载全部按钮上方');
  ok(renderArchive.toString().includes('as.exportName = event.target.value') && renderSingle.toString().includes('state.single.exportName = event.target.value') && renderSingleBatch.toString().includes('state.singleBatch.exportName = event.target.value'), '文件名输入应写入 state 防止重渲染丢失');
  ok(exportArchive.toString().includes('archiveExportName') && archiveExportName.toString().includes('exportExt'), '整包导出应使用自定义文件名与所选后缀');
  ok(downloadAllSingle.toString().includes('state.single.exportName'), '打包下载应使用自定义文件名');
  // 批量模式：加载、渲染、翻译、打包下载、覆盖确认
  ok(typeof loadArchiveBatch === 'function' && typeof doLoadArchiveBatch === 'function' && typeof parseArchiveGroups === 'function', '批量整包加载函数应存在且解析逻辑复用 parseArchiveGroups');
  ok(!loadArchiveBatch.toString().includes('requestOverwrite') && !loadSingleFiles.toString().includes('requestOverwrite'), '批量模式再次上传应直接追加而非弹覆盖确认');
  ok(doLoadArchiveBatch.toString().includes('state.archiveBatch.packs') && doLoadSingleFiles.toString().includes('state.singleBatch.files'), '批量上传应追加到已有列表而非清空');
  ok(OVERWRITE_LOADERS && OVERWRITE_LOADERS.archive === doLoadArchive && OVERWRITE_LOADERS.single === doLoadSingleFile, '覆盖确认应分发到单模式加载函数');
  ok(doLoadArchiveBatch.toString().includes('flatMap'), '批量整包应生成跨包连续编号的扁平分组列表');
  ok(doLoadArchiveBatch.toString().includes('!groups.length') && doLoadArchiveBatch.toString().includes('skipped'), '无语言文件的包不应进入批量列表并提示已忽略');
  ok(renderArchive.toString().includes('pack-section') && renderArchive.toString().includes('pack-title'), '批量整包应按包分节渲染包名标题');
  ok(renderArchive.toString().includes('data-delete-pack'), '批量整包包名旁应有删除整包按钮');
  ok(renderArchive.toString().includes('(pack, packIndex)'), 'renderArchive 的 packs.map 回调必须带 packIndex 参数（否则 ReferenceError）');
  ok(typeof requestDeletePack === 'function' && requestDeletePack.toString().includes('确认要删除'), '删除整包应复用确认弹窗并显示“确认要删除 文件名”');
  ok(confirmDelete.toString().includes('packs.splice') && confirmDelete.toString().includes("pendingDelete?.pack"), '确认删除整包应从批量列表移除并重建分组索引');
  ok(confirmDelete.toString().includes('archive-batch-name'), '确认删除整包后应同步更新已选择资源包计数');
  ok(doLoadArchiveBatch.toString().includes('exportName: state.archiveBatch.exportName') && doLoadSingleFiles.toString().includes('exportName: state.singleBatch.exportName'), '批量追加时应保留已输入的下载文件名');
  ok(renderArchive.toString().includes('打包下载全部'), '批量整包应有打包下载全部按钮');
  ok(exportArchive.toString().includes('outer') && exportArchive.toString().includes('applyPackChanges'), '批量导出应把各包打进外层 zip 并复用单包变更逻辑');
  ok(typeof downloadEachPack === 'function' && downloadEachPack.toString().includes('applyPackChanges'), '逐包下载应复用单包变更逻辑逐个导出');
  ok(downloadEachPack.toString().includes('downloadBlob') && downloadEachPack.toString().includes('pack.ext'), '逐包下载应触发多个下载任务并保留原后缀');
  ok(renderArchive.toString().includes('download-each-pack'), '批量导出卡应有逐包下载按钮');
  ok(renderArchive.toString().indexOf('download-each-pack') < renderArchive.toString().indexOf('id="export-archive"'), '逐包下载按钮应在打包下载全部左边');
  ok(exportArchive.toString().includes('pack.ext'), '批量导出各包应保留上传时识别的原后缀');
  ok(typeof renderSingleBatch === 'function' && typeof translateBatchSingle === 'function' && typeof downloadAllSingleBatch === 'function' && typeof requestDeleteSingleBatch === 'function', '批量单文件核心函数应存在');
  ok(translateBatchSingle.toString().includes('spinning') && translateBatchSingle.toString().includes('disabled = true') && translateBatchSingle.toString().includes('targets: []'), '批量单文件翻译应有进度、禁用按钮并清空本文件目标选择');
  // 批量单文件一键翻译：跳过已有结果，源语言取各文件下拉已选值或文件名推断
  ok(typeof translateAllSingleFiles === 'function', '批量单文件一键翻译函数应存在');
  ok(renderSingleBatch.toString().includes('translate-all-single') && renderSingleBatch.toString().includes('batch-target-lang'), '批量单文件顶部应渲染一键翻译卡');
  ok(translateAllSingleFiles.toString().includes("result.target === target") && translateAllSingleFiles.toString().includes('skipped'), '已有目标结果的文件应自动跳过');
  ok(translateAllSingleFiles.toString().includes('data-batch-source') && translateAllSingleFiles.toString().includes('|| item.sourceLanguage'), '源语言应取下拉已选值并回退文件名推断');
  ok(translateAllSingleFiles.toString().includes('spinning') && translateAllSingleFiles.toString().includes('disabled = true'), '一键翻译应禁用按钮并显示进度');
  ok(renderSingleBatch.toString().includes('state.singleBatch.translateTarget = event.target.value'), '一键翻译目标语言选择应写入 state');
  ok(batchResultsCard.toString().includes('data-batch-review-lang') && batchResultsCard.toString().includes('data-batch-delete-single') && batchResultsCard.toString().includes('data-batch-download-single'), '批量单文件结果列表应有校对、删除、下载');
  ok(downloadAllSingleBatch.toString().includes('folder'), '批量单文件打包下载应按源文件分文件夹防重名');
  ok(downloadAllSingleBatch.toString().includes('count + 1') && downloadAllSingleBatch.toString().includes('new Map'), '重名文件夹应加 _2、_3 递增数字后缀');
  // 文件夹名可编辑：输入框实时写入 item.folderName，打包下载优先使用
  ok(renderSingleBatch.toString().includes('data-batch-rename') && renderSingleBatch.toString().includes('item.folderName || stripExt(item.file.name)'), '文件名标题应显示为可编辑输入框（默认原文件名去后缀）');
  ok(renderSingleBatch.toString().includes('.folderName = event.target.value'), '文件夹名输入应实时写入 item.folderName');
  ok(downloadAllSingleBatch.toString().includes('item.folderName'), '打包下载应优先使用自定义文件夹名');
  ok(confirmDelete.toString().includes('singleBatch.pendingDelete') && confirmDelete.toString().includes('renderSingleBatch'), '批量单文件删除应复用确认弹窗并重渲染');
  ok(translateGroup.toString().includes('archiveState()') && renderArchive.toString().includes('archiveState()'), '整包渲染与翻译应通过 archiveState 兼容两种模式');
  // 一键翻译：源文件取每包第 1 个，冲突检测 + 弹窗勾选覆盖（默认不勾）
  ok(typeof packFirstSource === 'function' && typeof packHasTarget === 'function' && typeof translateAllPacks === 'function' && typeof runBatchTranslate === 'function', '一键翻译核心函数应存在');
  ok(packFirstSource.toString().includes('!item.deleted') && translateAllPacks.toString().includes('packFirstSource'), '一键翻译应取每包第 1 个未删除语言文件');
  ok(packHasTarget.toString().includes('!item.deleted && item.language === target') && packHasTarget.toString().includes('generated'), '冲突判定应与 targetOptions 一致（已有文件+已生成结果）');
  ok(renderArchive.toString().includes('translate-all-packs') && renderArchive.toString().includes('batch-target-lang'), '批量模式顶部应渲染一键翻译卡');
  ok(translateAllPacks.toString().includes('batch-translate-dialog') && translateAllPacks.toString().includes('data-batch-pack'), '有冲突包时应弹窗列出复选框（默认不勾）');
  ok(!translateAllPacks.toString().includes('checked>') || !/<mdui-checkbox[^>]*checked/.test(translateAllPacks.toString()), '冲突包复选框默认不勾选');
  ok(translateAllPacks.toString().includes('runBatchTranslate(target, sources, new Set())'), '无冲突时直接执行翻译');
  ok(runBatchTranslate.toString().includes('!override.has(index)') && runBatchTranslate.toString().includes('skipped'), '未勾选覆盖的冲突包应跳过');
  ok(runBatchTranslate.toString().includes("gen.target !== target"), '覆盖时应先移除旧的同目标翻译结果');
  ok(runBatchTranslate.toString().includes('item.language !== target'), '覆盖后原有同目标语言文件应从上方列表移除，只在已翻译文件中出现');
  ok(runBatchTranslate.toString().includes('spinning') && runBatchTranslate.toString().includes('disabled = true'), '一键翻译应禁用按钮并显示进度');
  ok($('batch-translate-confirm') !== undefined, '一键翻译确认按钮绑定应存在');
  console.log('自检通过：29 种语言、映射一致、定义齐全、注释保留、清单同步正常');
})().catch((error) => { console.error(error.message); process.exit(1); });`;

(0, eval)(src + checks);
